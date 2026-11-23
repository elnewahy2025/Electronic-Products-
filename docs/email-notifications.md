# Email Notifications & Admin Digests (Migration 035)

## Architecture (Transactional Outbox Pattern)
Instead of sending SMTP requests inside database transactions or blocking user requests:
1. PostgreSQL triggers enqueue rows into `email_outbox` (`status = 'queued'`) atomically alongside the business state change.
2. The email worker (`/api/internal/worker/email` or Vercel cron `/api/internal/worker/email-cron` every 2 minutes) claims rows with `FOR UPDATE SKIP LOCKED` via `claim_email_outbox()`.
3. Each email is dispatched using a real transport (`RESEND_API_KEY` via Resend API, or `SMTP_HOST`/`SMTP_PORT` via `nodemailer`).
4. Failed sends are retried up to `max_attempts = 3` before being marked `failed` with `last_error`.

## Critical Events Covered by Triggers
| Trigger | Table / Event | Recipient | Template |
|---|---|---|---|
| `trg_email_purchase_status` | `purchase_requests.status → approved / rejected` | `customer_email` | `purchase_approved` / `purchase_rejected` |
| `trg_email_code_delivered` | `purchase_codes.delivered_at` set | `customer_email` | `code_delivered` |
| `trg_email_payout_status` | `seller_payouts.status → approved / paid / rejected` | Seller (`profiles.email`) | `payout_approved` / `payout_paid` / `payout_rejected` |
| `trg_email_seller_status` | `seller_profiles.status → approved / rejected / suspended` | Seller (`profiles.email`) | `seller_approved` / `seller_rejected` / `seller_suspended` |

## Daily Admin Digest
- Endpoint: `GET / POST /api/internal/worker/admin-digest` (scheduled daily at `07:00 UTC` in `vercel.json`).
- Queries live pending counts across `purchase_requests`, `seller_profiles`, `seller_payouts`, `quarantine_records`, and `compensation_requests`.
- Sends an Arabic RTL summary email to all active `super_admin` and `admin` members when `pendingTotal > 0`.

## Security
- `email_outbox` has RLS enabled (`SELECT` restricted to `is_admin_or_above() OR staff_has('audit.read')`).
- `enqueue_email`, `claim_email_outbox`, `mark_email_sent`, and `mark_email_failed` are `SECURITY DEFINER` and `REVOKE`d from `PUBLIC` (`service_role` only).
- Worker and cron endpoints require `Authorization: Bearer $CRON_SECRET` (fallback `$WORKER_SECRET`). The spoofable `x-vercel-cron: 1` header is **never** accepted as authentication; configure Vercel Cron to send the Bearer secret.
