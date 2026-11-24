# Independent Backup Storage Configuration (Cloudflare R2 or AWS S3)

> **STATUS: CONFIGURATION RUNBOOK. BUCKET PROVISIONING AND KEY MANAGEMENT ARE EXTERNAL
> OPERATIONAL TASKS — NOT COMPLETED BY THIS DOCUMENT.**
>
> No credentials appear in this document or in the repository. Use the secret manager of the
> deployment platform and the existing variable names in `.env.example`.

## 1. Separation requirements

| Requirement | Implementation |
|---|---|
| Independent of seller Google Drive | The backup bucket belongs to the platform operator, never to a seller. Seller Drive accounts are used only for product delivery. |
| Independent encryption keys | Backups use a dedicated provider-side KMS key or dedicated server-side encryption key. Never reuse `ENCRYPTION_KEY` (seller Drive token encryption) or `CODE_HASH_PEPPER` (code hashing). |
| Independent IAM identity | A dedicated backup service identity with access to this one bucket only; no wildcard `s3:*`, no access to seller Drive tokens, no access to application secrets. |
| Separate lifecycle | Backup artifacts follow `backup_settings.retention_days` (proposed 90 days) and audit archives follow `audit_settings.retention_days` (180 days live, then archive), not Drive retention. |
| Least privilege reads | Restore verification uses a read-only identity where the provider supports it; writes are performed by the backup runner identity. |

The in-repo backup runner (`scripts/backup-and-verify.mjs`) currently writes compressed,
SHA-256-checked multi-schema (`public`, `auth`, `storage`) dumps **and a point-in-time snapshot
of Storage object bytes** to the private Supabase Storage bucket `database-backups`, and records
them in `backup_archives` ([`docs/backups.md`](backups.md)). This is same-project recovery
evidence, not off-site replication. Provisioning an R2/S3 bucket and copying both the SQL
archives and the blob snapshots to it is an **external operational step**. Do not assume the
application already writes to R2/S3 until the bucket, credentials and runner configuration are
in place and verified.

---

## 2. Environment variables (names already present in `.env.example`)

| Variable | Purpose | Example shape (no real values) |
|---|---|---|
| `BACKUP_STORAGE_ENDPOINT` | S3-compatible API endpoint | R2: `https://<account-id>.r2.cloudflarestorage.com`; AWS: `https://s3.<region>.amazonaws.com` |
| `BACKUP_STORAGE_BUCKET` | Private bucket name | `platform-admin-backups-prod` |
| `BACKUP_STORAGE_ACCESS_KEY` | Dedicated backup service access key ID | stored only in the secret manager |
| `BACKUP_STORAGE_SECRET_KEY` | Matching secret | stored only in the secret manager |
| `BACKUP_GITHUB_REPO` (optional) | `owner/repo` for watchdog dispatch | set only if GitHub Actions dispatch is used |
| `BACKUP_GITHUB_TOKEN` (optional) | Fine-grained token for workflow dispatch | set only if GitHub Actions dispatch is used |

Notes:
- `.env.example` has no separate region variable; derive the region from the endpoint or add
  a provider-specific variable only if the runner is updated to consume it.
- Never commit `.env.local`, `.env.test`, or populated secret values. Rotate keys if they
  have ever appeared in a log, ticket or chat message.
- Store keys in Vercel/Supabase/GitHub encrypted secrets and in the CI secret store, not in
  `next.config`, not in client code, and not in Worker secrets.

---

## 3. Provider setup

### 3.1 Cloudflare R2
1. Create a private bucket dedicated to backups (e.g. `platform-admin-backups-prod`).
2. Disable public access entirely; do not attach a custom public domain or r2.dev URL.
3. Enable bucket versioning. Enable Object Lock only if the chosen R2 feature set supports
   the required retention mode; otherwise enforce retention with lifecycle rules plus
   immutable provider-side configuration.
4. Create an API token scoped to **Object Read & Write** on this single bucket. Do not grant
   account-wide permissions. Use a second read-only token for restore drills if supported.
5. Set `BACKUP_STORAGE_ENDPOINT`, `BACKUP_STORAGE_BUCKET`, `BACKUP_STORAGE_ACCESS_KEY`,
   `BACKUP_STORAGE_SECRET_KEY` in the deployment secret store.
6. Configure R2 lifecycle rules per section 5 and enable request metrics/alerting.

### 3.2 AWS S3
1. Create a private bucket with **Block Public Access** fully enabled and no bucket policy
   granting anonymous access.
2. Enable bucket versioning. Enable Object Lock in governance mode with a proposed 30-day
   retention for backup objects if compliance requirements allow; use compliance mode only
   after legal sign-off, because it cannot be shortened.
3. Enable default encryption with a dedicated KMS key (customer-managed key, not the
   account default key used by other services). Key policy should allow use only by the
   backup role and the restore-verification role.
4. Create an IAM policy scoped to the bucket only:
   - `s3:ListBucket` on the bucket ARN;
   - `s3:GetObject`, `s3:PutObject`, `s3:AbortMultipartUpload`, `s3:GetObjectVersion` on
     `<bucket-arn>/*`;
   - `s3:DeleteObject` only if the lifecycle/retention job needs it (prefer lifecycle expiry);
   - explicit `Deny` for `s3:PutBucketPublicAccessBlock` removal and for `s3:GetObject` on
     other buckets.
5. Attach the policy to a role used only by the backup runner; use a read-only role for
   restore verification.
6. Set the four `BACKUP_STORAGE_*` variables in the deployment secret store.
7. Enable server access logging or CloudTrail data events for the bucket and alert on
   unexpected `GetObject` or `DeleteObject` calls.

---

## 4. Backup contents and scheduling

| Item | Value |
|---|---|
| Database dump | `pg_dump` with mandatory `--schema=public --schema=auth --schema=storage --no-owner --no-privileges`, gzipped, SHA-256 checksum recorded in `backup_archives` (see `scripts/backup-and-verify.mjs`) |
| Schedule | Weekly by default (`backup_settings.schedule = 'weekly'`, proposed); GitHub Actions runs daily at 03:00 UTC and `is_backup_due()` decides whether to execute |
| Manual backup | Super Admin only via `/admin/backups`; logged in `audit_logs` |
| Blob snapshot | The runner always copies Storage object bytes (excluding `database-backups`) into the same project bucket under `<archive-prefix>/blobs/...` with a SHA-256 manifest. This is not off-site DR; replicate it to the operator bucket along with the SQL dump. `backup_settings.include_files` does not control this snapshot. |
| Naming | `<env>/db/YYYY-MM-DDTHH-MM-SSZ.sql.gz` plus a `.sha256` sidecar; no seller identifiers in object keys |
| Encryption in transit | TLS only; S3-compatible endpoint must use HTTPS |

---

## 5. Lifecycle, versioning and retention

Proposed launch policy (confirm with legal/compliance):

| Object class | Transition | Expiry |
|---|---|---|
| Current backup objects | Standard → Infrequent Access after 30 days | 90 days (`backup_settings.retention_days`) |
| Non-current versions | Standard → Infrequent Access after 30 days | Expire after 90 days |
| Incomplete multipart uploads | — | Abort after 7 days |
| Audit archive objects (if stored here) | Cold storage after 30 days | Retain per `audit_settings` (180 days live + archive); do not expire solely on the backup schedule |

Notes:
- Retention must not be shorter than the platform's dispute/accounting window; counsel to
  confirm in [`docs/legal-review-drafts.md`](legal-review-drafts.md).
- Versioning and Object Lock protect against accidental deletion, but they are not a
  substitute for a separate restore test. Never delete a version manually as routine cleanup.
- If the provider supports MFA delete for version removal, enable it for the operator account.

---

## 6. Watchdog and failure handling

1. **Application watchdog:** Vercel Cron `0 4 * * *` calls `/api/internal/worker/backup-cron`,
   which evaluates `is_backup_due()` and `is_restore_test_due()` and can dispatch the GitHub
   Actions workflow using `BACKUP_GITHUB_REPO` / `BACKUP_GITHUB_TOKEN`.
2. **Missed backup:** if no completed `backup_jobs` row exists within 24 h of the due time,
   create a `backup_overdue` admin notification and page the on-call Super Admin.
3. **Checksum mismatch:** fail the job, record `backup.failed`, and do not mark the archive
   usable. Quarantine the object for investigation.
4. **Secret rotation:** rotate `BACKUP_STORAGE_ACCESS_KEY` /
   `BACKUP_STORAGE_SECRET_KEY` on suspected exposure and at least every 180 days; verify the
   next scheduled backup before revoking the old key.
5. **Restore authorisation:** restore is Super Admin only, with explicit confirmation and a
   full `audit_logs` record (`restore.started`, `restore.completed`, `restore.failed`).

---

## 7. Restore drills

| Frequency | Proposed target |
|---|---|
| Automated isolated restore verification | Every 30 days (`backup_settings.restore_test_frequency_days = 30`), via `scripts/backup-and-verify.mjs --verify` |
| Manual cross-provider drill | Quarterly: copy one archive into the independent R2/S3 bucket, restore it into an isolated database, compare checksums and core row counts (`backup_settings`, `profiles`, `products`) |
| Failure response | Re-run once; if still failing, treat as a critical incident, block the release and notify the on-call Super Admin |

Each drill must:
1. Download the archive using the read-only identity.
2. Verify SHA-256 against `backup_archives.checksum`.
3. Restore into a temporary database named `restore_verify_<timestamp>` using
   `psql -v ON_ERROR_STOP=1`.
4. Check core table row counts and that RLS/policies/roles are present in the dump.
5. Drop the temporary database and record the outcome via `record_restore_verification`
   (also written to `restore_jobs` and `audit_logs`).
6. Never restore over production without a separate, explicitly approved disaster-recovery runbook.

---

## 8. Verification checklist (before launch)

- [ ] Bucket exists, is private, and is outside every seller's Google Drive account.
- [ ] Versioning enabled; lifecycle and retention rules match section 5.
- [ ] Object Lock / MFA delete configured or a documented compensating control approved.
- [ ] Dedicated encryption key configured and verified to be different from `ENCRYPTION_KEY`
      and `CODE_HASH_PEPPER`.
- [ ] IAM policy scoped to one bucket; no wildcard actions; read-only identity for drills.
- [ ] Public access block verified from an unauthenticated request (expect 403).
- [ ] Four `BACKUP_STORAGE_*` variables set in production secret stores; no real values in
      the repository, docs or tickets.
- [ ] One manual backup uploaded, checksum verified against `backup_archives`.
- [ ] One isolated restore drill completed and recorded in `restore_jobs`.
- [ ] Watchdog tested: simulate a missed backup and confirm `backup_overdue` notification.
- [ ] Alert routing tested for checksum mismatch, quota 70%/90% and 24 h overdue.
- [ ] Restore permissions restricted to Super Admin; action present in `audit_logs`.
- [ ] Provider dashboard URLs, account/bucket identifiers and key rotation date recorded in
      the launch log (without secrets).
