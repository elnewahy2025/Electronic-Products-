# Automated Backups & Restore Verification (Migration 037)

## Overview
This module automates PostgreSQL backups according to `backup_settings.schedule` (`daily` / `weekly` / `manual_only`), stores compressed `.sql.gz` archives with SHA-256 checksums in the private `database-backups` Supabase Storage bucket, prunes expired archives per `retention_days`, and performs **real isolated restore verification** on schedule (`restore_test_frequency_days`).

## Architecture

1. **Database RPCs (`supabase/migrations/037_backup_automation.sql`):**
   - Private bucket `database-backups` (`public = false`, `service_role` only).
   - `is_backup_due()` — evaluates `backup_settings.schedule` against the latest completed `backup_jobs`.
   - `is_restore_test_due()` — evaluates `backup_settings.restore_test_frequency_days` against the latest completed `restore_jobs`.
   - `start_backup_job`, `complete_backup_job`, `fail_backup_job` — atomic lifecycle + `backup_archives` SHA-256 recording + failure notifications via `notify_staff_with_permission`.
   - `record_restore_verification` — records isolated restore test outcome in `restore_jobs` + audit log + failure alerts.
   - `update_backup_settings` — Super Admin RPC for updating `backup_settings` from `/admin/backups`.

2. **Real Backup & Restore Runner (`scripts/backup-and-verify.mjs`):**
   - Runs real `pg_dump --schema=public --no-owner --no-privileges`, gzips at level 9, computes SHA-256, uploads to `database-backups`, and records `complete_backup_job`.
   - In `--verify` / `--force-verify` mode: downloads the latest archive from `database-backups`, verifies its SHA-256 against `backup_archives.checksum`, creates an isolated temporary PostgreSQL database (`restore_verify_<timestamp>`), restores the full dump with `psql -v ON_ERROR_STOP=1`, verifies core table row counts (`backup_settings`, `profiles`, `products`), drops the temporary DB, and logs the result in `restore_jobs`.

3. **External Cron & Watchdog:**
   - **GitHub Actions** (`.github/workflows/backup-and-verify.yml`): runs daily at `03:00 UTC` with an ephemeral PostgreSQL 15 service container for isolated restore verification.
   - **Vercel Cron Watchdog** (`/api/internal/worker/backup-cron`, `0 4 * * *`): checks `is_backup_due()` and `is_restore_test_due()`, optionally dispatches the GitHub Actions workflow (`BACKUP_GITHUB_REPO` + `BACKUP_GITHUB_TOKEN`), and raises an admin notification (`backup_overdue`) if a scheduled backup is missed.

## Required Secrets (Production / GitHub Actions)
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `BACKUP_DATABASE_URL` (direct PostgreSQL connection string for `pg_dump`)
- Optional for Vercel watchdog dispatch: `BACKUP_GITHUB_REPO`, `BACKUP_GITHUB_TOKEN`

## Local Verification (Docker Supabase)
```powershell
$env:SUPABASE_URL="http://127.0.0.1:55321"
$env:SUPABASE_SERVICE_ROLE_KEY="<local_service_role_key>"
$env:LOCAL_PG_DOCKER_CONTAINER="supabase_db_electronic-products"
node scripts/backup-and-verify.mjs --backup --force-verify
```
