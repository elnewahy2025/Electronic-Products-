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
// Back up the application schema plus Supabase's auth and storage metadata.
// Storage object *bytes* are snapshotted separately by snapshotStorageBlobs()
// and verified against the restored storage.objects rows.
const REQUIRED_SCHEMAS = ['public', 'auth', 'storage'];
const BACKUP_SCHEMAS = (process.env.BACKUP_SCHEMAS || REQUIRED_SCHEMAS.join(','))
  .split(',')
  .map((schema) => schema.trim())
  .filter((schema) => /^[a-z_][a-z0-9_]*$/.test(schema));
if (!REQUIRED_SCHEMAS.every((schema) => BACKUP_SCHEMAS.includes(schema))) {
  console.error(`BACKUP_SCHEMAS must include ${REQUIRED_SCHEMAS.join(',')}`);
  process.exit(1);
}
// These tables give a stable restore signal. All are mandatory: a drill that
// omits auth.users or storage.objects cannot prove application recoverability.
const EVIDENCE_TABLES = [
  'public.backup_settings',
  'public.profiles',
  'public.products',
  'auth.users',
  'storage.objects',
];
const STORAGE_SNAPSHOT_VERSION = 1;
const SNAPSHOT_EXCLUDED_BUCKETS = new Set(['database-backups']);
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
        ...BACKUP_SCHEMAS.map((schema) => `--schema=${schema}`),
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
      ...BACKUP_SCHEMAS.map((schema) => `--schema=${schema}`),
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

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function snapshotPrefix(objectPath) {
  const match = /^backups\/([^/]+)\.sql\.gz$/.exec(objectPath || '');
  if (!match) throw new Error(`invalid archive object path for blob snapshot: ${objectPath}`);
  return `backups/${match[1]}`;
}

/**
 * Snapshot Storage object bytes into the private database-backups bucket and
 * return a manifest-backed evidence object. The source of truth for which
 * objects exist is storage.objects (RLS-free psql), not the Storage listing.
 */
async function snapshotStorageBlobs(objectPath) {
  const prefix = snapshotPrefix(objectPath);
  const raw = querySource(`
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'bucket_id', o.bucket_id, 'name', o.name, 'size', o.size
    ) ORDER BY o.bucket_id, o.name), '[]'::jsonb)::text
    FROM storage.objects o
    WHERE o.bucket_id <> 'database-backups';`).trim();
  const objects = JSON.parse(raw);
  if (!Array.isArray(objects)) throw new Error('invalid storage.objects snapshot');

  const manifest = { version: STORAGE_SNAPSHOT_VERSION, object_count: objects.length, objects: [] };
  let totalBytes = 0;
  for (const object of objects) {
    if (typeof object.bucket_id !== 'string' || typeof object.name !== 'string') {
      throw new Error('invalid storage.objects row in snapshot');
    }
    if (SNAPSHOT_EXCLUDED_BUCKETS.has(object.bucket_id)) continue;

    const { data, error } = await supabase.storage.from(object.bucket_id).download(object.name);
    if (error || !data) {
      throw new Error(`blob download failed ${object.bucket_id}/${object.name}: ${error?.message ?? 'empty'}`);
    }
    const bytes = Buffer.from(await data.arrayBuffer());
    if (object.size != null && Number(object.size) !== bytes.length) {
      throw new Error(`metadata/blob size mismatch for ${object.bucket_id}/${object.name}`);
    }

    const blobPath = `${prefix}/blobs/${encodeURIComponent(object.bucket_id)}/${encodeURIComponent(object.name)}`;
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(blobPath, bytes, {
      contentType: 'application/octet-stream',
      upsert: false,
    });
    if (uploadError) throw new Error(`blob snapshot upload failed ${blobPath}: ${uploadError.message}`);

    manifest.objects.push({
      bucket_id: object.bucket_id,
      name: object.name,
      size_bytes: bytes.length,
      sha256: sha256(bytes),
      blob_path: blobPath,
    });
    totalBytes += bytes.length;
  }

  const manifestPath = `${prefix}/storage-manifest.json`;
  const manifestBuffer = Buffer.from(JSON.stringify(manifest));
  const { error: manifestError } = await supabase.storage.from(BUCKET).upload(manifestPath, manifestBuffer, {
    contentType: 'application/json',
    upsert: false,
  });
  if (manifestError) throw new Error(`manifest upload failed ${manifestPath}: ${manifestError.message}`);

  return {
    version: STORAGE_SNAPSHOT_VERSION,
    buckets: [...new Set(manifest.objects.map((o) => o.bucket_id))].sort(),
    object_count: manifest.objects.length,
    total_bytes: totalBytes,
    manifest_path: manifestPath,
    manifest_checksum: sha256(manifestBuffer),
    blob_paths: manifest.objects.map((o) => o.blob_path),
    // The backup bucket is in the same Supabase project, so this is a
    // point-in-time snapshot, not an off-site mirror. See docs/backups.md.
    external_mirror: false,
  };
}

function collectBackupEvidence() {
  const sourceVersionNum = querySource('SHOW server_version_num;').trim();
  if (!/^\d+$/.test(sourceVersionNum)) {
    throw new Error(`invalid source PostgreSQL version: ${sourceVersionNum}`);
  }

  const rowCounts = {};
  for (const table of EVIDENCE_TABLES) {
    const value = querySource(`SELECT count(*) FROM ${table};`).trim();
    if (!/^\d+$/.test(value)) {
      throw new Error(`invalid row count for ${table}: ${value}`);
    }
    rowCounts[table] = Number(value);
  }

  const extensionSchemas = JSON.parse(querySource(`
    SELECT COALESCE(jsonb_object_agg(e.extname, n.nspname), '{}'::jsonb)::text
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname IN ('pgcrypto','uuid-ossp','citext','pg_trgm');`).trim());
  for (const [extension, schema] of Object.entries(extensionSchemas)) {
    if (!['pgcrypto', 'uuid-ossp', 'citext', 'pg_trgm'].includes(extension) ||
        !/^[a-z_][a-z0-9_]*$/.test(String(schema))) {
      throw new Error(`unsafe extension prerequisite: ${extension}@${schema}`);
    }
  }

  const integrity = JSON.parse(querySource(`
    SELECT jsonb_build_object(
      'fk_count', (SELECT count(*) FROM pg_constraint WHERE contype = 'f'),
      'trigger_count', (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal),
      'policy_count', (SELECT count(*) FROM pg_policies)
    )::text;`).trim());
  if (!Number.isFinite(integrity.fk_count) || !Number.isFinite(integrity.trigger_count) ||
      !Number.isFinite(integrity.policy_count) || integrity.fk_count < 1 ||
      integrity.trigger_count < 1 || integrity.policy_count < 1) {
    throw new Error(`invalid source integrity evidence: ${JSON.stringify(integrity)}`);
  }

  return { sourceVersionNum, rowCounts, extensionSchemas, integrity };
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
    const checksum = sha256(gzBuffer);

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const objectPath = `backups/${stamp}_${jobId}.sql.gz`;

    // Snapshot bytes before recording the archive so evidence describes the
    // same point in time. Any download/upload/size mismatch fails the backup.
    const storageEvidence = await snapshotStorageBlobs(objectPath);
    console.log(`[backup] Snapshotted ${storageEvidence.object_count} Storage object(s) (${storageEvidence.total_bytes} bytes).`);

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
    if (completeErr || !archiveId) {
      throw new Error(`complete_backup_job failed: ${completeErr?.message ?? 'no archive id'}`);
    }

    const { error: evidenceError } = await supabase.rpc('record_backup_restore_evidence', {
      p_archive_id: archiveId,
      p_storage_evidence: storageEvidence,
      p_restore_prereqs: {
        extension_schemas: evidence.extensionSchemas,
        integrity: evidence.integrity,
      },
    });
    if (evidenceError) {
      throw new Error(`record_backup_restore_evidence failed: ${evidenceError.message}`);
    }

    console.log(`[backup] Completed job=${jobId} archive=${archiveId} sha256=${checksum}`);
    await pruneExpiredArchives();
    return archiveId;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[backup] Failed job=${jobId}: ${message}`);
    const { error: failError } = await supabase.rpc('fail_backup_job', {
      p_job_id: jobId,
      p_error: message,
    });
    if (failError) console.error(`[backup] fail_backup_job also failed: ${failError.message}`);
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
    .select('id, storage_location, storage_evidence')
    .lt('created_at', cutoff);

  if (!expired?.length) return;

  const paths = expired.flatMap((a) => {
    const archive = a.storage_location?.replace(`${BUCKET}/`, '');
    const evidence = a.storage_evidence ?? {};
    return [
      archive,
      ...(Array.isArray(evidence.blob_paths) ? evidence.blob_paths : []),
      typeof evidence.manifest_path === 'string' ? evidence.manifest_path : null,
    ].filter((path) => typeof path === 'string' && path.startsWith('backups/'));
  });

  const uniquePaths = [...new Set(paths)];

  if (uniquePaths.length > 0) {
    const { error } = await supabase.storage.from(BUCKET).remove(uniquePaths);
    if (error) {
      console.warn(`[backup] Retention prune warning: ${error.message}`);
    } else {
      console.log(`[backup] Pruned ${uniquePaths.length} expired archive/blob object(s) older than ${retentionDays}d.`);
    }
  }
}

async function verifyLatestArchive() {
  const { data: archive, error } = await supabase
    .from('backup_archives')
    .select('id, storage_location, checksum, created_at, source_pg_version, row_counts, storage_evidence, restore_prereqs')
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
  for (const table of EVIDENCE_TABLES) {
    if (!Object.prototype.hasOwnProperty.call(archive.row_counts, table)) {
      throw new Error(`archive ${archive.id} has no row-count evidence for ${table}`);
    }
  }
  if (!/^\d+$/.test(String(archive.source_pg_version ?? ''))) {
    throw new Error(`archive ${archive.id} has no source PostgreSQL version evidence`);
  }

  const storageEvidence = archive.storage_evidence ?? {};
  if (storageEvidence.version !== STORAGE_SNAPSHOT_VERSION ||
      !SHA256_RE.test(String(storageEvidence.manifest_checksum ?? '')) ||
      !Number.isInteger(storageEvidence.object_count) ||
      !Array.isArray(storageEvidence.blob_paths) ||
      !Array.isArray(storageEvidence.buckets) ||
      typeof storageEvidence.manifest_path !== 'string') {
    throw new Error(`archive ${archive.id} has no valid Storage blob evidence`);
  }
  const restorePrereqs = archive.restore_prereqs ?? {};
  if (!restorePrereqs.extension_schemas || !restorePrereqs.integrity) {
    throw new Error(`archive ${archive.id} has no restore prerequisite evidence`);
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
      // Prepare isolated DB with the same extension placement and roles as
      // the source. No auth stubs: a real auth dump must create auth.users and
      // auth.uid()/role()/email() itself or the drill must fail.
      const extensionSql = Object.entries(restorePrereqs.extension_schemas)
        .map(([extension, schema]) => {
          if (!['pgcrypto', 'uuid-ossp', 'citext', 'pg_trgm'].includes(extension) ||
              !/^[a-z_][a-z0-9_]*$/.test(String(schema))) {
            throw new Error(`unsafe extension prerequisite: ${extension}@${schema}`);
          }
          return `CREATE SCHEMA IF NOT EXISTS ${schema};\nCREATE EXTENSION IF NOT EXISTS ${extension} WITH SCHEMA ${schema};`;
        })
        .join('\n');
      runPsql(
        tempDb,
        `
        ${extensionSql}
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
        END $$;
        `,
      );
      // pg_dump emits pre-data -> COPY data -> post-data (FKs/triggers/policies),
      // so replaying with constraints ENFORCED is safe. CREATE SCHEMA public
      // must be idempotent because a fresh PostgreSQL database already has it.
      // Supabase extensions live in a separate schema; keep it on search_path.
      const restoreSql = sqlBuffer.toString('utf8')
        .replace(/^CREATE SCHEMA public;$/m, 'CREATE SCHEMA IF NOT EXISTS public;')
        .replace(
          "SELECT pg_catalog.set_config('search_path', '', false);",
          "SELECT pg_catalog.set_config('search_path', 'public, extensions', false);",
        );
      runPsql(tempDb, null, Buffer.from(restoreSql, 'utf8'));

      // Prove the restored database enforces FKs/triggers and restored the
      // same policy/role surface as the source (no replica-mode masking).
      const integritySql = `SELECT jsonb_build_object(
        'fk_unvalidated', (SELECT count(*) FROM pg_constraint WHERE contype = 'f' AND NOT convalidated),
        'triggers_disabled', (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled = 'D'),
        'policies', (SELECT count(*) FROM pg_policies),
        'roles', (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role'))
      )::text;`;
      const restoredIntegrity = JSON.parse(runPsql(tempDb, integritySql, undefined, { tuplesOnly: true }).trim());
      if (restoredIntegrity.fk_unvalidated !== 0 || restoredIntegrity.triggers_disabled !== 0 ||
          restoredIntegrity.roles !== 3 || restoredIntegrity.policies < 1) {
        throw new Error(`restore integrity assertions failed: ${JSON.stringify(restoredIntegrity)}`);
      }
      const sourceIntegrity = restorePrereqs.integrity;
      if (Number(sourceIntegrity.fk_count) < 1 || Number(sourceIntegrity.trigger_count) < 1 ||
          restoredIntegrity.policies !== Number(sourceIntegrity.policy_count)) {
        throw new Error(`restore integrity counts differ from source evidence: ${JSON.stringify({ sourceIntegrity, restoredIntegrity })}`);
      }
      evidence.integrity = restoredIntegrity;

      // Verify the archived Storage byte snapshot and its parity with the
      // restored storage.objects metadata. Blob bytes are not loaded into the
      // restored DB, so we assert archived integrity instead of false "restored bytes".
      const { data: manifestBlob, error: manifestError } = await supabase.storage
        .from(BUCKET)
        .download(storageEvidence.manifest_path);
      if (manifestError || !manifestBlob) {
        throw new Error(`manifest download failed: ${manifestError?.message ?? 'empty blob'}`);
      }
      const manifestBuffer = Buffer.from(await manifestBlob.arrayBuffer());
      if (sha256(manifestBuffer) !== String(storageEvidence.manifest_checksum).toLowerCase()) {
        throw new Error('storage manifest checksum mismatch');
      }
      const manifest = JSON.parse(manifestBuffer.toString('utf8'));
      if (manifest.version !== STORAGE_SNAPSHOT_VERSION ||
          manifest.object_count !== storageEvidence.object_count ||
          !Array.isArray(manifest.objects)) {
        throw new Error('storage manifest shape mismatch');
      }
      for (const entry of manifest.objects) {
        const { data: blob, error: blobError } = await supabase.storage.from(BUCKET).download(entry.blob_path);
        if (blobError || !blob) {
          throw new Error(`archived blob missing: ${entry.blob_path}`);
        }
        const bytes = Buffer.from(await blob.arrayBuffer());
        if (bytes.length !== entry.size_bytes || sha256(bytes) !== String(entry.sha256).toLowerCase()) {
          throw new Error(`archived blob hash/size mismatch: ${entry.blob_path}`);
        }
      }

      let restoredObjects = [];
      if (storageEvidence.buckets.length > 0) {
        const bucketSql = storageEvidence.buckets
          .map((bucket) => `'${String(bucket).replace(/'/g, "''")}'`)
          .join(', ');
        const restoredJson = runPsql(tempDb, `
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'bucket_id', bucket_id, 'name', name, 'size', size
          ) ORDER BY bucket_id, name), '[]'::jsonb)::text
          FROM storage.objects WHERE bucket_id IN (${bucketSql});`,
        undefined, { tuplesOnly: true }).trim();
        restoredObjects = JSON.parse(restoredJson);
      }
      const normalize = (rows) => rows
        .map((row) => `${row.bucket_id}/${row.name}:${row.size ?? ''}`)
        .sort();
      const expectedObjects = manifest.objects
        .map((o) => ({ bucket_id: o.bucket_id, name: o.name, size: o.size_bytes }));
      if (JSON.stringify(normalize(restoredObjects)) !== JSON.stringify(normalize(expectedObjects))) {
        throw new Error('restored storage.objects metadata does not match blob manifest');
      }
      evidence.storage = {
        object_count: storageEvidence.object_count,
        total_bytes: storageEvidence.total_bytes,
        manifest_checksum: storageEvidence.manifest_checksum,
        blobs_verified: manifest.objects.length,
        external_mirror: false,
      };

      const countSql = `SELECT jsonb_build_object(${EVIDENCE_TABLES
        .map((table) => `'${table}', (SELECT count(*) FROM ${table})`)
        .join(', ')})::text;`;
      const restoredCounts = JSON.parse(runPsql(tempDb, countSql, undefined, { tuplesOnly: true }).trim());
      const requiredTables = EVIDENCE_TABLES.filter((table) =>
        Object.prototype.hasOwnProperty.call(archive.row_counts, table),
      );
      if (requiredTables.length === 0) {
        throw new Error('archive has no row-count evidence for the configured backup schemas');
      }
      for (const table of requiredTables) {
        const expected = Number(archive.row_counts[table]);
        const actual = Number(restoredCounts[table]);
        if (!Number.isFinite(expected) || !Number.isFinite(actual) || expected !== actual) {
          throw new Error(`restore row-count mismatch for ${table}: expected ${expected}, got ${actual}`);
        }
      }
      const missingEvidence = EVIDENCE_TABLES.filter(
        (table) => !Object.prototype.hasOwnProperty.call(archive.row_counts, table),
      );
      if (missingEvidence.length > 0) {
        console.warn(`[verify] Archive predates evidence for: ${missingEvidence.join(', ')}`);
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

    const { error: recordError } = await supabase.rpc('record_restore_verification', {
      p_archive_id: archive.id,
      p_status: 'completed',
      p_error: null,
      p_performed_by: null,
      p_evidence: evidence,
    });
    if (recordError) throw new Error(`record_restore_verification failed: ${recordError.message}`);
    console.log(`[verify] Recorded restore_jobs=completed for archive ${archive.id}.`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[verify] Restore verification FAILED: ${message}`);
    const { error: recordError } = await supabase.rpc('record_restore_verification', {
      p_archive_id: archive.id,
      p_status: 'failed',
      p_error: message,
      p_performed_by: null,
      p_evidence: Object.keys(evidence).length > 0 ? evidence : null,
    });
    if (recordError) console.error(`[verify] record_restore_verification also failed: ${recordError.message}`);
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
