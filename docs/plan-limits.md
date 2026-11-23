# Proposed Production Plan Limits and Launch Defaults

> **STATUS: PROPOSED LAUNCH DEFAULTS — CONFIRM WITH VENDOR DASHBOARDS BEFORE LAUNCH.**
>
> These are planning numbers for the first production rollout, not a statement of purchased
> entitlements or guaranteed vendor limits. Vendor plans, regions and quotas change; verify
> every number in the Vercel, Google Cloud, Supabase, Cloudflare and storage-provider
> dashboards before applying it. Where the repository already enforces a value, this
> document records that value as a *product* rule rather than a vendor quota.

## 1. Summary of hard product rules (already implemented)

| Rule | Value | Source |
|---|---|---|
| Code validity | 72 hours from issue | `download_settings.code_validity_hours`; migrations `005`, `009` |
| Download session duration | 4 hours (partial session also 4 hours by default) | `download_settings` |
| Completed attempts per purchased item | 3 | `download_settings.max_attempts_per_product` |
| Compensation sessions per code | 3 | `compensation_settings.max_sessions_per_product` |
| Minimum payout | 100 USD | `payout_settings.minimum_amount` / `minimum_currency` |
| Audit retention | 180 days live, then archived | `audit_settings.retention_days` |
| Backup retention | 90 days (proposed) | `backup_settings.retention_days` |
| MFA-enforced roles | `super_admin`, `admin`, `staff` | `security_settings.mfa_enforced_roles` (immutable) |

See [`docs/production-defaults.md`](production-defaults.md) for how to set the configurable values.

---

## 2. Vercel (Next.js application)

Proposed launch defaults:

| Item | Launch default | Rationale / verification |
|---|---|---|
| Plan | Pro (or equivalent team plan) | Needed for configurable function duration, cron and team logs. Confirm plan features in dashboard. |
| Function max duration | 10 s for API routes; 60 s only for explicitly designated admin/cron routes | Set in `vercel.json` where supported. No file streaming from Vercel. |
| Function memory | 1,024 MB default; 1,536 MB only for image processing (`sharp`) routes | Confirm available sizes and price in dashboard. |
| Request body limit | Treat ~4.5 MB as the effective serverless payload ceiling | Do not send original product files through Next.js; Drive uploads are resumable and direct. Confirm current platform limit. |
| Concurrent serverless executions | Alert at 70% of plan allowance; hard stop review at 90% | Track in Vercel Observability. |
| Cron | Keep `backup-cron` at `0 4 * * *`; one cron invocation per day | Confirm cron jobs are enabled on the selected plan. |
| Log retention | 7 days hot on Pro by default; export to external sink for the 180-day audit requirement | Audit evidence lives in `audit_logs`, not Vercel logs. Confirm log-drain availability. |
| Bandwidth | 100 GB/month planning ceiling for app HTML/API/images | Product files must never count against this; verify via the download Worker. |
| Build | One production build per release; no runtime generation of large ZIPs | ZIP creation is delegated to the external Worker. |

**Hard rule:** no large file, ZIP assembly, or long-running download passes through Vercel.
The application issues signed tokens and resolves short-lived Drive URLs only
([`docs/download-service-contract.md`](download-service-contract.md)).

---

## 3. Google Drive API (seller-owned accounts)

| Item | Launch default | Notes |
|---|---|---|
| Scope | `https://www.googleapis.com/auth/drive.file` only | Already set via `GOOGLE_DRIVE_SCOPES` in `.env.example`. |
| Per-user request rate | Plan at **10 QPS per seller account** with exponential backoff on 429/5xx | Google publishes different quota windows per API/method; confirm in Google Cloud console and tune. |
| Project-level daily quota | Plan at **100,000 requests/day** for the pilot; request an increase before scaling beyond 25 sellers | Placeholder planning figure, not a vendor guarantee. Track per-method usage. |
| Token refresh | Budget **2 refreshes/hour/seller**; alert on repeated `invalid_grant` | Revoked Drive accounts must be re-linked by the seller. |
| Picker API key | HTTP-referrer restricted to production and staging origins; no unrestricted key | `GOOGLE_PICKER_API_KEY`, `GOOGLE_PICKER_APP_ID`. |
| Per-file size | Governed by `allowed_file_types` in the Platform; no file is proxied by the app | Set per-extension max sizes in `/admin` before pilot. |
| Quota headroom | Require at least **20% free space** on each linked Drive account before accepting new uploads | `pick_drive_account` uses recorded quota; seller must add capacity when full. |
| Failure budget | Alert if Drive 401/403/429 exceeds **20 errors/hour across the platform** | Usually means revoked tokens or quota exhaustion. |

---

## 4. Supabase (Postgres, Auth, Storage, RLS)

| Item | Launch default | Notes |
|---|---|---|
| Database plan | Pro-tier equivalent with PgBouncer/transaction pooler | Confirm connection ceilings in dashboard. |
| Direct connections | Plan for **≤ 20** long-lived direct sessions; everything else through the transaction pooler | Serverless routes must use pooled connections. |
| Pooler connections | Planning ceiling **150**, alert at 70% | Validate against the actual plan; never rely on session pooling from Vercel. |
| `statement_timeout` | 15 s for request-scoped queries; 60 s for admin reporting only | Prevent runaway queries. |
| RLS | Enabled on every table; no policy-less tables; service role only in server code | See [`docs/08-rls-matrix.md`](08-rls-matrix.md). |
| Auth sign-ins | Plan at **100/hour** for pilot, **500/hour** at GA; alert on 20% 5xx | Implement per-IP/email throttling and monitor Auth logs. |
| MFA | Enforced for `super_admin`, `admin`, `staff` | Immutable setting; do not relax. |
| Storage buckets | `previews` and `product-images` public-read as designed; `database-backups` private; no public bucket for originals | Confirm bucket policies in dashboard. |
| Storage egress | 50 GB/month planning ceiling for previews/images | Product files are delivered from Drive via Worker. |
| Row growth | Alert if `audit_logs` grows > 50,000 rows/day or `email_outbox` > 10,000 open rows | Indicates abuse or stalled worker. |

---

## 5. Download Worker (Cloudflare Worker under `workers/download`)

| Item | Launch default | Notes |
|---|---|---|
| Deployment target | Single Cloudflare Worker bound to the production domain/path used by `DOWNLOAD_SERVICE_URL` | Implementation lives in `workers/download`; deployment is an operational step. See [`docs/07-implementation-plan.md`](07-implementation-plan.md) and the Worker `README.md`. |
| Requests/day | Plan at **100,000/day** for the pilot; alert at 70% of the purchased plan allowance | Confirm free/paid plan quotas in Cloudflare dashboard. |
| Concurrent streams | 50 launch ceiling; queue or reject beyond this | Protects Drive URL budgets. |
| Single file size guardrail | 2 GB per file | Larger products must be split by the seller. |
| ZIP size guardrail | 2 GB per ZIP and 50 files per ZIP | Streaming assembly with `fflate`; never buffer the whole archive in memory. |
| Daily egress guardrail | 25 GB/day during pilot | Alert at 70%; review before increasing. |
| Per-request CPU / duration | Keep work to token verification + streaming; no image or archive transformation | Confirm Worker CPU/duration limits for the chosen plan. |
| Drive URL lifetime | Treat resolved URLs as valid for **15 minutes**; re-initiate on expiry | Contract behaviour in `docs/download-service-contract.md`. |
| Completion reporting | POST completion only after success; on failure log the token nonce and do not call complete | Prevents false attempt consumption. |
| Failure budget | Alert if completion failures > 2% over 15 minutes, or 410 responses > 10/hour | Investigate token/session issues. |

---

## 6. Backup storage (independent Cloudflare R2 or AWS S3)

| Item | Launch default | Notes |
|---|---|---|
| Provisioned capacity | 500 GB, expandable | Weekly compressed DB dumps plus optional file copies. |
| Retention | 90 days matching `backup_settings.retention_days`; older versions lifecycle-expire | Object Lock/versioning per [`docs/backup-storage-config.md`](backup-storage-config.md). |
| Max object size | 5 GB per object; multipart for larger | Applies only if file copies are enabled. |
| Write volume | 1 full DB dump/week (plan 500 MB compressed) + manual dumps | Confirm via `backup_jobs`. |
| Egress | 20 GB/month planning ceiling for restore drills | Alert at 70%. |
| Encryption | Provider-managed KMS key dedicated to backups, separate from `ENCRYPTION_KEY` and `CODE_HASH_PEPPER` | No credentials in docs or repo. |
| Failure budget | Backup overdue > 24 h or checksum mismatch = page the on-call Super Admin | Watchdog is `/api/internal/worker/backup-cron`. |

---

## 7. Email outbox and notifications

| Item | Launch default | Notes |
|---|---|---|
| Outbox drain rate | 100 messages/minute per worker run; batch size 50 | Tune to SMTP/Resend quota. |
| Daily cap | 5,000 messages/day during pilot | Code delivery, payout decisions, seller status, admin digest. |
| Retries | 3 attempts with exponential backoff; then mark failed and alert | Never silently mark delivery as sent. |
| Bounce/complaint rate | Alert at 2% bounces or 0.5% complaints over 1 hour | Pause bulk sends. |
| Admin digest | Once daily at 08:00 Africa/Cairo (`general_settings.timezone`) | `/api/internal/worker/admin-digest`. |
| Code resend | No silent success: current handler returns `501 RESEND_NOT_IMPLEMENTED` and logs `skipped` (`050`) | Connect a real transport before enabling. |

---

## 8. Monitoring and alert thresholds (launch defaults)

| Signal | Warning | Critical / stop-ship |
|---|---|---|
| 5xx rate (app) | > 1% over 5 min | > 5% over 5 min or > 20 errors in 5 min |
| API p95 latency | > 2 s over 15 min | > 5 s over 15 min |
| Code delivery success | < 99% over 1 hour | < 95% over 1 hour |
| Download completion failures | > 2% over 15 min | > 5% over 15 min |
| Drive 401/403/429 | > 20/hour | > 100/hour |
| `*_blocked_after_delivery` audit events | > 5 in 15 min | > 20 in 15 min (possible attack or logic bug) |
| `review_delete_requires_ticket` / `buyer_case_*` guard failures | Any | Repeated attempts from one actor |
| MFA-blocked admin sign-ins | > 5/hour | > 20/hour |
| Backup job | Overdue 12 h | Overdue 24 h or failed verification |
| Restore drill | Overdue 35 days | Failed checksum/row counts |
| Email outbox backlog | > 500 pending for 30 min | > 2,000 pending or 1 h stalled |
| Storage/DB quota | 70% | 90% |
| Support tickets | > 10 open for 2 days | > 20 open with SLA breach |

Alerts go to the admin notification centre and the on-call channel configured during
launch. Every threshold above is a proposed starting point; adjust after the first two
monitoring windows in [`docs/soft-launch-plan.md`](soft-launch-plan.md).

---

## 9. What must be confirmed before applying

- [ ] Confirm Vercel plan limits and set function duration/memory in `vercel.json` if needed.
- [ ] Confirm Google Cloud quotas per method and project; enable billing alerts.
- [ ] Confirm Supabase plan connection ceiling and pooler settings; enable pooler in all server clients.
- [ ] Confirm Cloudflare plan request/CPU limits and deploy `workers/download`.
- [ ] Provision the independent backup bucket and KMS key; store only references in env vars.
- [ ] Confirm SMTP/Resend throughput and daily quota.
- [ ] Record the confirmed values and the dashboard URLs in the launch log; replace this
      document's proposed numbers where vendors differ.
