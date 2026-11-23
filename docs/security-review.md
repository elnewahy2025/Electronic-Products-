# Security Review — Findings & Fixes (`027_security_hardening.sql`)

## 1. Audit Scope
- All Row-Level Security (RLS) policies across migrations `001`–`026`
- All Next.js API route handlers and Server Actions
- All `SECURITY DEFINER` PostgreSQL functions (RPCs)
- Field-level authorization on sensitive tables (`purchase_codes`, `reviews`, `notifications`, `profiles`)
- Rate limiting and append-only audit trails

---

## 2. Executive Summary of Findings (Pre-Hardening)

### 🔴 Critical: Unprotected `SECURITY DEFINER` Admin RPCs
20+ administrative `SECURITY DEFINER` functions were executable by `authenticated` without internal permission checks. Any logged-in user (even a regular buyer) could invoke them directly via PostgREST (`supabase.rpc(...)`), bypassing Next.js API routes:

| Function | Potential Abuse Before Fix |
|---|---|
| `approve_purchase_request`, `reject_purchase_request` | Approve unpaid purchase requests and issue codes, or reject other buyers' requests |
| `confirm_code_delivery`, `revoke_code_before_delivery` | Confirm delivery of undelivered codes or revoke codes before delivery |
| `issue_replacement_code` | Issue free replacement purchase codes |
| `approve_payout`, `mark_payout_paid`, `reject_payout` | Approve, mark paid, or reject seller payout requests |
| `approve_seller`, `reject_seller`, `suspend_seller` | Approve, reject, or suspend any seller account |
| `record_successful_attempt`, `mark_session_completed`, `expire_partial_session` | Consume attempts or close download sessions belonging to other users |
| `create_compensation_session`, `reject_compensation` | Create or reject compensation sessions without admin permission |
| `extend_session`, `revoke_session_before_delivery` | Extend or revoke download sessions |
| `delete_review`, `resolve_report` | Soft-delete reviews or resolve content reports |
| `set_category_parent`, `delete_category_safe`, `reorder_categories` | Modify or delete storefront categories |

### 🟠 High: RLS Gaps & Field-Level Tampering
| Issue | Impact Before Fix |
|---|---|
| `files_update` policy had no `WITH CHECK` clause | A seller could transfer file ownership (`seller_id`) to another seller |
| `notif_update_self` allowed updating all columns | A user could alter notification `title`, `body`, or `user_id` |
| `reviews_soft_delete` allowed modifying `rating` / `body` | A seller could change a 1-star review into a 5-star review instead of soft-deleting |
| `reviews_soft_delete` allowed un-deleting (`deleted → published`) | A seller could restore a review that an admin had deleted |
| `purchase_codes` UPDATE had no column restrictions | Staff with `code.issue` could alter `code_hash`, `order_item_id`, or `issued_at` |
| `seller_payouts` allowed direct `INSERT` by sellers | A seller could insert a payout row directly, bypassing the `$100` minimum and balance check in `request_payout` |
| `allowed_file_types` had public `SELECT` | Exposed internal file type configuration to unauthenticated visitors |
| `seller_drive_accounts` lacked a single-default constraint | Multiple Drive accounts could be marked `is_default = true` for the same seller |

### 🟡 Medium: Service-Only RPC Exposure & Audit Attribution
| Issue | Impact Before Fix |
|---|---|
| `updateSettings` used `createAdminClient()` with a dummy UUID | Settings audit logs recorded a placeholder UUID instead of the real `Super Admin` `auth.uid()` |
| Service-only RPCs granted to `authenticated` | `record_successful_attempt`, `mark_session_completed`, `expire_partial_session`, `pick_drive_account`, and `update_drive_quota` only need to be called by the backend server |

---

## 3. Remediation Implemented in `027_security_hardening.sql`

### Critical Fix: Internal Authorization Checks in Every Admin RPC
Every administrative `SECURITY DEFINER` RPC now starts with an explicit permission check inside the database function itself:

```sql
IF NOT (is_admin_or_above() OR staff_has('specific.permission')) THEN
  RAISE EXCEPTION 'not_authorized';
END IF;
```

**Verified by:** `tests/e2e/specs/04-security-hardening.spec.ts` → *"buyer cannot call admin RPCs directly"*.

### Critical Fix: Service-Only RPCs Revoked from `authenticated`
`record_successful_attempt`, `mark_session_completed`, `expire_partial_session`, `pick_drive_account`, and `update_drive_quota` now have `REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC, authenticated, anon;` and `GRANT EXECUTE ... TO service_role;`. Only the Next.js server (via `createAdminClient()`) can invoke them.

### High Fix: RLS Policies Hardened
1. `files_update`: Added explicit `WITH CHECK` clause matching the `USING` condition so `seller_id` cannot be reassigned.
2. `allowed_file_types`: Restricted `SELECT` to `is_admin_or_above() OR staff_has('filetype.manage')` (and updated `initUpload` in `src/lib/server/services/upload-service.ts` to query `allowed_file_types` via `createAdminClient()`).
3. `seller_payouts`: Dropped direct `payouts_insert` policy and executed `REVOKE INSERT ON seller_payouts FROM authenticated`, forcing all payout requests through the `request_payout` RPC.
4. `seller_drive_accounts`: Added partial unique index `idx_seller_drive_one_default ON seller_drive_accounts(seller_id) WHERE is_default = true`.

### High Fix: Field-Level Protection Triggers
1. `notifications` (`trg_notifications_only_read_at`): Blocks any modification to `user_id`, `type`, `title`, `body`, `category`, `link`, `data`, or `created_at`.
2. `reviews` (`trg_reviews_protect_fields`): Blocks non-`super_admin` users from modifying `rating`, `body`, `product_id`, `buyer_id`, or `order_item_id`, blocks un-deleting a `deleted` review, and enforces a mandatory `delete_reason`.
3. `purchase_codes` (`trg_codes_protect_fields`): Blocks any change to `code_hash`, `order_item_id`, or `issued_at`, and blocks changing `expires_at` after delivery (`delivered_at IS NOT NULL`).

### Medium Fix: Accurate Settings Audit Trail
`updateSettings` in `src/lib/server/services/settings-service.ts` now uses the authenticated user's Supabase client (`createClient()`) so the database trigger records the actual `auth.uid()` in `updated_by` and `audit_logs`.

---

## 4. Threat Model After Fixes

| Attack Vector | Blocked By |
|---|---|
| Buyer calls `approve_purchase_request` / `approve_compensation` via PostgREST | Internal RPC permission check (`request.approve` / `download.compensation.approve`) + API `requirePerm`; compensation approval locks a `pending` row with `FOR UPDATE` (`049`) |
| Seller modifies another seller's file or transfers ownership | RLS `USING` + `WITH CHECK` + FK constraints |
| Seller inserts a fake payout bypassing minimum/balance | `REVOKE INSERT` on `seller_payouts` + `request_payout` RPC validation |
| User tampers with notification title/body | `trg_notifications_only_read_at` trigger blocks non-`read_at` changes |
| Seller inflates review ratings, restores deleted reviews, or deletes reviews directly | `trg_reviews_protect_fields` blocks `rating`/`body` changes and un-delete; `trg_restrict_review_soft_delete` + `review_delete_from_ticket` (`054`) require a linked seller support ticket; legacy `delete_review` is `service_role`-only |
| Staff redirects a purchase code by changing `code_hash` | `trg_codes_protect_fields` trigger blocks `code_hash` mutation |
| Brute-force code redemption | Per-user (5/15m) and per-IP (15/15m) rate limits (`024_redeem_hardening.sql`) + `redeem_attempts` audit trail |
| Cross-account code redemption | `buyer_owns_code` verified inside `redeem_code` RPC + `/api/redeem` route |

---

## 5. Residual Risks & Mitigations

1. **`log_audit` has no rate limit:** A compromised authenticated session could call `log_audit` repeatedly. *Mitigation:* Monitor table growth; add rate limiting or revoke direct `authenticated` execution if all audit logging is performed inside server-side functions.
2. **`create_purchase_request` public spam:** Rate limits exist (3/hour per email, 10/hour per IP), but a large distributed botnet could rotate IPs and emails. *Mitigation:* Add CAPTCHA on the public checkout form if abuse is observed.
3. **Direct JWT replay:** If a session token is stolen from a client device, the attacker has session access until token expiry. *Mitigation:* Short JWT expiry + mandatory 2FA for all admin/staff roles.
4. **Drive token theft if `ENCRYPTION_KEY` leaks:** Refresh tokens are encrypted with `AES-256-GCM` using `ENCRYPTION_KEY`. *Mitigation:* Store secrets in managed platform vaults, rotate keys periodically, and never expose `seller_drive_accounts.encrypted_refresh_token` in views.
5. **Quarantined or deleted files remaining on Google Drive:** When a quarantined file is deleted, Drive deletion is best-effort. *Mitigation:* Periodic background reconciliation job.
6. **Insider admin abuse:** Every admin action is logged in `audit_logs` (append-only), but an authorized admin could approve their own purchase request. *Mitigation:* Regular audit log review and future two-person approval rule for high-value actions.
7. **`get_usd_rate` is public:** Anyone can query exchange rates, which are non-sensitive public storefront data.
8. **Content-Security-Policy (CSP) & HSTS headers:** **Implemented** in `middleware.ts` (per-request nonce + dynamic CSP + HSTS in production) and `next.config.mjs` (static security headers + `poweredByHeader: false`), with optional violation reporting at `/api/csp-report`. See [`docs/security-headers.md`](security-headers.md).
9. **No real code resend transport:** `/api/admin/codes/[id]/resend` deliberately returns `501 RESEND_NOT_IMPLEMENTED` and records `result: 'skipped'` instead of falsely marking delivery as `'sent'` (`050`). Connect a real transport before enabling this action.

---

## 6. Recommendations for Next Iteration
- Tighten `img-src` in CSP once product cover images are uploaded to Supabase Storage
- Add 2FA backup/recovery codes for staff and admins
- Add per-admin IP allowlisting for critical actions (`wallet.adjust`, `backup.restore`)
- Add real-time security alerts (email/webhook on repeated `code_revocation_blocked_after_delivery` or brute-force spikes)
- Add a scheduled RLS verification job that inspects `pg_policies` and function grants for drift

---

## 7. Audit Remediation (`048`–`053`)

| Finding | Mitigation |
|---|---|
| `product_rating_stats` writable by clients | RLS + `REVOKE` writes from `anon`/`authenticated` (`048`) |
| Compensation self-approval / missing pending lock | `approve_compensation` RPC with approve-only permission and `FOR UPDATE`; `request.reject` for rejections; single pending request and 3-session cap (`049`) |
| Resend falsely reported success | `501 RESEND_NOT_IMPLEMENTED` + `skipped` delivery attempt (`050`) |
| Token replay after session completion / arbitrary file completion | Status check in resolve/completion, ownership RPC, file-set intersection (`051`) |
| Guest buyers could never review | Guest-aware `can_current_user_review` RPC (`052`) |
| Error hygiene and low findings | `publicError` sanitizer, super-admin-only settings GET, constant-time secret comparisons, rejection sampling, `logAudit` for file deletion, cron-secret-only workers, scoped seller stats, masked `buyer_id`, admin-only review soft-delete (`053` + app changes) |
| Seller-driven review deletion bypass (`054`) | Sellers can only open a structured support ticket (`product_id`, `order_item_id`, `review_id`); only Admin/Staff with `review.delete` may call `delete_review_from_ticket` from the admin ticket page. RPC re-checks ticket linkage/status and blocks deletion while the buyer has a pending/approved compensation request, pending/approved attempt exception, or open/pending buyer-owned support ticket for the same review/item/product. DB trigger requires an open seller ticket even for direct PostgREST updates. Legacy `delete_review` is `service_role`-only. Success emits `review.deleted_from_ticket` to the append-only audit log. |
