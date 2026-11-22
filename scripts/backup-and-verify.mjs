#!/usr/bin/env node
/**
 * Real Automated Database Backup & Isolated Restore Verification Runner
 *
 * Modes:
 *   node scripts/backup-and-verify.mjs --backup              # Run backup unconditionally
 *   node scripts/backup-and-verify.mjs --scheduled           # Run backup only if is_backup_due() is true
 *   node scripts/backup-and-verify.mjs --verify              # Verify latest archive checksum + isolated pg restore
 *   node scripts/backup-and-verify.mjs --scheduled --verify  # Honor both is_backup_due() and is_restore_test_due()
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 *   DATABASE_URL (PostgreSQL connection string for pg_dump; or LOCAL_PG_DOCKER_CONTAINER for local Docker)
 *   VERIFY_DATABASE_ADMIN_URL (optional; defaults to DATABASE_URL for creating/dropping isolated temp DB)
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createClient } from '@supabase/supabase-js';

const BUCKET = 'database-backups';
const args = new Set(process.argv.slice(2));
const modeBackup = args.has('--backup');
const modeScheduled = args.has('--scheduled');
const modeVerify = args.has('--verify');
const forceVerify = args.has('--force-verify');

if (!modeBackup && !modeScheduled && !modeVerify && !forceVerify) {
  console.error('Usage: node scripts/backup-and-verify.mjs [--backup | --scheduled] [--verify | --force-verify]');
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.DATABASE_URL;
const dockerContainer = process.env.LOCAL_PG_DOCKER_CONTAINER;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function runPgDump() {
  if (dockerContainer) {
    return execFileSync(
      'docker',
      [
        'exec',
        dockerContainer,
        'pg_dump',
        '-U', 'postgres',
        '-d', 'postgres',
        '--schema=public',
        '--no-owner',
        '--no-privileges',
      ],
      { maxBuffer: 256 * 1024 * 1024 },
    );
  }

  if (!databaseUrl) {
    throw new Error('DATABASE_URL or LOCAL_PG_DOCKER_CONTAINER is required for pg_dump');
  }

  return execFileSync(
    'pg_dump',
    [
      databaseUrl,
      '--schema=public',
      '--no-owner',
      '--no-privileges',
    ],
    { maxBuffer: 256 * 1024 * 1024 },
  );
}

function runPsql(dbName, sql, inputBuffer) {
  if (dockerContainer) {
    const res = spawnSync(
      'docker',
      ['exec', '-i', dockerContainer, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', dbName, ...(sql ? ['-c', sql] : [])],
      { input: inputBuffer, maxBuffer: 256 * 1024 * 1024, encoding: 'utf8' },
    );
    if (res.status !== 0) {
      throw new Error(`psql (${dbName}) failed: ${res.stderr || res.stdout}`);
    }
    return res.stdout;
  }

  const baseUrl = process.env.VERIFY_DATABASE_ADMIN_URL || databaseUrl;
  if (!baseUrl) {
    throw new Error('VERIFY_DATABASE_ADMIN_URL or DATABASE_URL is required for restore verification');
  }

  const url = new URL(baseUrl);
  url.pathname = `/${dbName}`;

  const res = spawnSync(
    'psql',
    ['-v', 'ON_ERROR_STOP=1', url.toString(), ...(sql ? ['-c', sql] : [])],
    { input: inputBuffer, maxBuffer: 256 * 1024 * 1024, encoding: 'utf8' },
  );
  if (res.status !== 0) {
    throw new Error(`psql (${dbName}) failed: ${res.stderr || res.stdout}`);
  }
  return res.stdout;
}

async function performBackup(type) {
  const { data: jobId, error: startErr } = await supabase.rpc('start_backup_job', {
    p_type: type,
    p_triggered_by: null,
  });
  if (startErr || !jobId) {
    throw new Error(`start_backup_job failed: ${startErr?.message ?? 'no jobId'}`);
  }

  try {
    console.log(`[backup] Running pg_dump for job ${jobId}...`);
    const sqlBuffer = runPgDump();
    const gzBuffer = gzipSync(sqlBuffer, { level: 9 });
    const checksum = createHash('sha256').update(gzBuffer).digest('hex');

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const objectPath = `backups/${stamp}_${jobId}.sql.gz`;

    console.log(`[backup] Uploading ${gzBuffer.length} bytes to ${BUCKET}/${objectPath}...`);
    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(objectPath, gzBuffer, {
        contentType: 'application/gzip',
        upsert: false,
      });

    if (uploadErr) {
      throw new Error(`storage upload failed: ${uploadErr.message}`);
    }

    const { data: archiveId, error: completeErr } = await supabase.rpc('complete_backup_job', {
      p_job_id: jobId,
      p_size_bytes: gzBuffer.length,
      p_storage_location: `${BUCKET}/${objectPath}`,
      p_checksum: checksum,
    });
    if (completeErr) {
      throw new Error(`complete_backup_job failed: ${completeErr.message}`);
    }

    console.log(`[backup] Completed job=${jobId} archive=${archiveId} sha256=${checksum}`);
    await pruneExpiredArchives();
    return archiveId;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[backup] Failed job=${jobId}: ${message}`);
    await supabase.rpc('fail_backup_job', {
      p_job_id: jobId,
      p_error: message,
    });
    throw err;
  }
}

async function pruneExpiredArchives() {
  const { data: settings } = await supabase
    .from('backup_settings')
    .select('retention_days')
    .eq('id', 1)
    .single();

  const retentionDays = settings?.retention_days ?? 90;
  const cutoff = new Date(Date.now() - retentionDays * 86400 * 1000).toISOString();

  const { data: expired } = await supabase
    .from('backup_archives')
    .select('id, storage_location')
    .lt('created_at', cutoff);

  if (!expired?.length) return;

  const paths = expired
    .map(a => a.storage_location?.replace(`${BUCKET}/`, ''))
    .filter(Boolean);

  if (paths.length > 0) {
    const { error } = await supabase.storage.from(BUCKET).remove(paths);
    if (error) {
      console.warn(`[backup] Retention prune warning: ${error.message}`);
    } else {
      console.log(`[backup] Pruned ${paths.length} expired archive object(s) older than ${retentionDays}d.`);
    }
  }
}

async function verifyLatestArchive() {
  const { data: archive, error } = await supabase
    .from('backup_archives')
    .select('id, storage_location, checksum, created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !archive) {
    console.log('[verify] No backup archive found to verify.');
    return;
  }

  const tempDb = `restore_verify_${Date.now()}`;
  const objectPath = archive.storage_location.replace(`${BUCKET}/`, '');

  try {
    console.log(`[verify] Downloading archive ${archive.id} (${objectPath})...`);
    const { data: blob, error: dlErr } = await supabase.storage
      .from(BUCKET)
      .download(objectPath);

    if (dlErr || !blob) {
      throw new Error(`download failed: ${dlErr?.message ?? 'empty blob'}`);
    }

    const gzBuffer = Buffer.from(await blob.arrayBuffer());
    const actualChecksum = createHash('sha256').update(gzBuffer).digest('hex');

    if (archive.checksum && actualChecksum !== archive.checksum) {
      throw new Error(`checksum mismatch: expected ${archive.checksum}, got ${actualChecksum}`);
    }

    const sqlBuffer = gunzipSync(gzBuffer);
    console.log(`[verify] Checksum OK (${actualChecksum.slice(0, 12)}...). Restoring into isolated DB ${tempDb}...`);

    runPsql('postgres', `CREATE DATABASE "${tempDb}";`);
    try {
      // Prepare isolated DB: install extensions in public (matching Supabase) and stub auth schema
      runPsql(
        tempDb,
        `
        CREATE EXTENSION IF NOT EXISTS pgcrypto;
        CREATE EXTENSION IF NOT EXISTS citext;
        CREATE EXTENSION IF NOT EXISTS pg_trgm;
        CREATE SCHEMA IF NOT EXISTS auth;
        CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULL::uuid';
        CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS 'SELECT ''authenticated''::text';
        CREATE OR REPLACE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS 'SELECT NULL::text';
        CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
        END $$;
        `,
      );
      // Make CREATE SCHEMA public idempotent and defer cross-schema FK triggers (auth.users) during public-only restore
      const restoreSql =
        "SET session_replication_role = 'replica';\n" +
        sqlBuffer.toString('utf8').replace(/^CREATE SCHEMA public;$/m, 'CREATE SCHEMA IF NOT EXISTS public;') +
        "\nSET session_replication_role = 'origin';\n";
      runPsql(tempDb, null, Buffer.from(restoreSql, 'utf8'));
      const checkOut = runPsql(
        tempDb,
        `SELECT (SELECT count(*) FROM public.backup_settings) AS settings_cnt, (SELECT count(*) FROM public.profiles) AS profiles_cnt, (SELECT count(*) FROM public.products) AS products_cnt;`,
      );
      console.log(`[verify] Isolated restore succeeded!\n${checkOut.trim()}`);
    } finally {
      try {
        runPsql('postgres', `DROP DATABASE IF EXISTS "${tempDb}" WITH (FORCE);`);
      } catch (dropErr) {
        console.warn(`[verify] Cleanup warning for ${tempDb}: ${dropErr.message}`);
      }
    }

    await supabase.rpc('record_restore_verification', {
      p_archive_id: archive.id,
      p_status: 'completed',
      p_error: null,
      p_performed_by: null,
    });
    console.log(`[verify] Recorded restore_jobs=completed for archive ${archive.id}.`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[verify] Restore verification FAILED: ${message}`);
    await supabase.rpc('record_restore_verification', {
      p_archive_id: archive.id,
      p_status: 'failed',
      p_error: message,
      p_performed_by: null,
    });
    throw err;
  }
}

async function main() {
  if (modeBackup) {
    await performBackup('manual');
  } else if (modeScheduled) {
    const { data: due, error } = await supabase.rpc('is_backup_due');
    if (error) throw new Error(`is_backup_due failed: ${error.message}`);
    if (due) {
      await performBackup('auto');
    } else {
      console.log('[backup] Schedule not due yet — skipping.');
    }
  }

  if (forceVerify) {
    await verifyLatestArchive();
  } else if (modeVerify) {
    const { data: due, error } = await supabase.rpc('is_restore_test_due');
    if (error) throw new Error(`is_restore_test_due failed: ${error.message}`);
    if (due) {
      await verifyLatestArchive();
    } else {
      console.log('[verify] Restore test not due yet — skipping.');
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
