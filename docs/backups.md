# Automated Backups & Restore Verification (Migration 037)

## Overview
This module automates PostgreSQL backups according to `backup_settings.schedule` (`daily` / `weekly` / `manual_only`), stores compressed `.sql.gz` archives with SHA-256 checksums in the private `database-backups` Supabase Storage bucket, snapshots Storage object bytes into the same bucket as a point-in-time companion manifest, prunes expired archives per `retention_days`, and performs **real isolated restore verification** on schedule (`restore_test_frequency_days`). The SQL dump covers `public`, `auth` and `storage`; the Storage byte snapshot is in-project, not an off-site replica.

## Architecture

1. **Database RPCs (`supabase/migrations/037_backup_automation.sql`):**
   - Private bucket `database-backups` (`public = false`, `service_role` only).
   - `is_backup_due()` — evaluates `backup_settings.schedule` against the latest completed `backup_jobs`.
   - `is_restore_test_due()` — evaluates `backup_settings.restore_test_frequency_days` against the latest completed `restore_jobs`.
   - `start_backup_job`, `complete_backup_job`, `fail_backup_job` — atomic lifecycle + `backup_archives` SHA-256 recording + failure notifications via `notify_staff_with_permission`.
   - `record_restore_verification` — records isolated restore test outcome in `restore_jobs` + audit log + failure alerts.
   - `update_backup_settings` — Super Admin RPC for updating `backup_settings` from `/admin/backups`.

2. **Real Backup & Restore Runner (`scripts/backup-and-verify.mjs`):**
   - Runs real `pg_dump --schema=public --schema=auth --schema=storage --no-owner --no-privileges` by default. `BACKUP_SCHEMAS` may add schemas but may not omit `public`, `auth` or `storage`; the runner exits before dumping if that invariant is broken. It gzips at level 9, computes SHA-256, captures the source PostgreSQL major version, mandatory evidence counts (`backup_settings`, `profiles`, `products`, `auth.users`, `storage.objects`), restore prerequisites (extensions, FK/trigger/policy counts), uploads to `database-backups`, and records `complete_backup_job`.
   - The dump captures **Storage bucket/object metadata**. The runner also downloads every object from non-`database-backups` buckets at backup time and uploads the bytes to `<archive-prefix>/blobs/...` in the same private bucket, with a SHA-256 `storage-manifest.json`. This is a **same-project, point-in-time Storage byte snapshot**, not an off-site DR copy; the Storage backend still needs independent replication for disaster recovery.
   - In `--verify` / `--force-verify` mode: fails closed when the archive lookup fails, no archive exists, the checksum is missing/invalid/mismatched, PostgreSQL major versions differ, row-count or restore-prerequisite evidence is missing/invalid, the Storage manifest is missing/corrupt, a blob download fails, restored `storage.objects` metadata does not match the manifest, or restored FKs/triggers are disabled/unvalidated. On success it downloads the latest archive and its blob manifest, verifies SHA-256 against `backup_archives.checksum` and `storage_evidence.manifest_checksum`, creates an isolated temporary PostgreSQL database (`restore_verify_<timestamp>`), restores the multi-schema dump with `psql -v ON_ERROR_STOP=1`, asserts the recorded row counts, verifies each snapshotted blob checksum and metadata parity, confirms FK/trigger enforcement, drops the temporary DB, and logs the result and evidence in `restore_jobs`.

3. **External Cron & Watchdog:**
   - **GitHub Actions** (`.github/workflows/backup-and-verify.yml`): runs daily at `03:00 UTC` with an ephemeral PostgreSQL 17 service container for isolated restore verification, matching production.
   - **Vercel Cron Watchdog** (`/api/internal/worker/backup-cron`, `0 4 * * *`): checks `is_backup_due()` and `is_restore_test_due()`, optionally dispatches the GitHub Actions workflow (`BACKUP_GITHUB_REPO` + `BACKUP_GITHUB_TOKEN`), and raises an admin notification (`backup_overdue`) if a scheduled backup is missed.

## Required Secrets (Production / GitHub Actions)
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `BACKUP_DATABASE_URL` — mapped to `DATABASE_URL` in the GitHub Actions workflow; direct PostgreSQL connection string for `pg_dump` and source evidence queries
- `BACKUP_SCHEMAS` is optional but, if set, must still contain `public,auth,storage`. Storage bytes are snapshotted into the same project bucket, so independent object storage credentials are **not yet wired**. Provision a separate provider/bucket and replicate both SQL archives and blob snapshots there before treating this as full disaster recovery (see `docs/backup-storage-config.md`).
- Optional for Vercel watchdog dispatch: `BACKUP_GITHUB_REPO`, `BACKUP_GITHUB_TOKEN`

## Local Verification (Docker Supabase)
```powershell
$env:SUPABASE_URL="http://127.0.0.1:55321"
$env:SUPABASE_SERVICE_ROLE_KEY="<local_service_role_key>"
$env:LOCAL_PG_DOCKER_CONTAINER="supabase_db_electronic-products"
node scripts/backup-and-verify.mjs --backup --force-verify
```
