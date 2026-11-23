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
const SHA256_RE = /^[a-f0-9]{64}$/i;
// These tables are present in every migration set and give a stable restore signal.
const EVIDENCE_TABLES = ['backup_settings', 'profiles', 'products'];
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

function runPsql(dbName, sql, inputBuffer, { tuplesOnly = false } = {}) {
  const modeArgs = tuplesOnly ? ['-tA'] : [];
  if (dockerContainer) {
    const res = spawnSync(
      'docker',
      ['exec', '-i', dockerContainer, 'psql', ...modeArgs, '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', dbName, ...(sql ? ['-c', sql] : [])],
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
    [...modeArgs, '-v', 'ON_ERROR_STOP=1', url.toString(), ...(sql ? ['-c', sql] : [])],
    { input: inputBuffer, maxBuffer: 256 * 1024 * 1024, encoding: 'utf8' },
  );
  if (res.status !== 0) {
    throw new Error(`psql (${dbName}) failed: ${res.stderr || res.stdout}`);
  }
  return res.stdout;
}

function querySource(sql) {
  if (dockerContainer) {
    const res = spawnSync(
      'docker',
      ['exec', dockerContainer, 'psql', '-tA', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-c', sql],
      { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
    );
    if (res.status !== 0) {
      throw new Error(`source psql failed: ${res.stderr || res.stdout}`);
    }
    return res.stdout;
  }

  if (!databaseUrl) {
    throw new Error('DATABASE_URL or LOCAL_PG_DOCKER_CONTAINER is required for backup evidence');
  }

  return execFileSync(
    'psql',
    ['-tA', '-v', 'ON_ERROR_STOP=1', databaseUrl, '-c', sql],
    { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  );
}

function collectBackupEvidence() {
  const sourceVersionNum = querySource('SHOW server_version_num;').trim();
  if (!/^\d+$/.test(sourceVersionNum)) {
    throw new Error(`invalid source PostgreSQL version: ${sourceVersionNum}`);
  }

  const rowCounts = {};
  for (const table of EVIDENCE_TABLES) {
    const value = querySource(`SELECT count(*) FROM public.${table};`).trim();
    if (!/^\d+$/.test(value)) {
      throw new Error(`invalid row count for public.${table}: ${value}`);
    }
    rowCounts[table] = Number(value);
  }

  return { sourceVersionNum, rowCounts };
}

function pgMajorFromVersionNum(versionNum) {
  const parsed = Number(versionNum);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed >= 100000 ? Math.floor(parsed / 10000) : Math.floor(parsed / 100);
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
    const evidence = collectBackupEvidence();
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
      p_source_pg_version: evidence.sourceVersionNum,
      p_row_counts: evidence.rowCounts,
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
    .select('id, storage_location, checksum, created_at, source_pg_version, row_counts')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`archive lookup failed: ${error.message}`);
  }
  if (!archive) {
    throw new Error('no backup archive found to verify');
  }

  if (!archive.checksum || !SHA256_RE.test(archive.checksum)) {
    throw new Error(`archive ${archive.id} has no valid SHA-256 checksum`);
  }
  if (!archive.row_counts || typeof archive.row_counts !== 'object') {
    throw new Error(`archive ${archive.id} has no row-count evidence`);
  }
  if (!/^\d+$/.test(String(archive.source_pg_version ?? ''))) {
    throw new Error(`archive ${archive.id} has no source PostgreSQL version evidence`);
  }

  const verifyVersionNum = runPsql('postgres', 'SHOW server_version_num;', undefined, { tuplesOnly: true }).trim();
  const sourceMajor = pgMajorFromVersionNum(archive.source_pg_version);
  const verifyMajor = pgMajorFromVersionNum(verifyVersionNum);
  if (!sourceMajor || !verifyMajor || sourceMajor !== verifyMajor) {
    throw new Error(
      `PostgreSQL major version mismatch: backup ${sourceMajor ?? 'unknown'} (${archive.source_pg_version}), verify ${verifyMajor ?? 'unknown'} (${verifyVersionNum})`,
    );
  }

  const locationPrefix = `${BUCKET}/`;
  if (typeof archive.storage_location !== 'string' || !archive.storage_location.startsWith(locationPrefix)) {
    throw new Error(`invalid storage location for archive ${archive.id}: ${String(archive.storage_location)}`);
  }
  const objectPath = archive.storage_location.slice(locationPrefix.length);
  if (!objectPath || objectPath.includes('..') || objectPath.startsWith('/')) {
    throw new Error(`invalid archive object path: ${objectPath}`);
  }

  const tempDb = `restore_verify_${Date.now()}`;
  const evidence = {
    archive_id: archive.id,
    checksum: archive.checksum,
    source_pg_version: archive.source_pg_version,
    verify_pg_version: verifyVersionNum,
  };

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

    if (actualChecksum !== archive.checksum.toLowerCase()) {
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

      const countSql = `SELECT jsonb_build_object(${EVIDENCE_TABLES
        .map((table) => `'${table}', (SELECT count(*) FROM public.${table})`)
        .join(', ')})::text;`;
      const restoredCounts = JSON.parse(runPsql(tempDb, countSql, undefined, { tuplesOnly: true }).trim());
      for (const table of EVIDENCE_TABLES) {
        const expected = Number(archive.row_counts[table]);
        const actual = Number(restoredCounts[table]);
        if (!Number.isFinite(expected) || !Number.isFinite(actual) || expected !== actual) {
          throw new Error(
            `restore row-count mismatch for public.${table}: expected ${expected}, got ${actual}`,
          );
        }
      }
      evidence.row_counts = restoredCounts;
      console.log(`[verify] Isolated restore succeeded! Row counts match: ${JSON.stringify(restoredCounts)}`);
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
      p_evidence: evidence,
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
      p_evidence: Object.keys(evidence).length > 0 ? evidence : null,
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
