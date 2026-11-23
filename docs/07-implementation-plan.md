# Updated Phased Implementation Plan and Completion Status

This plan documents the fifteen approved phases (0–14) for building the Digital Products Marketplace Platform, linking each phase to what has actually been implemented in the repository (database migrations up to `055`, the Cloudflare download Worker under `workers/download`, server services, user interfaces, and end-to-end tests), in addition to the remaining operational items before actual launch and the roadmap for additional enhancements. Implementation in the repository does **not** mean external deployment or vendor configuration is complete; those items are tracked in section 3.

---

## 1. Core Phases Table (0–14)

| Phase | Contents | Verifiable Deliverable | Repository Status |
|---|---|---|---|
| **0** | Locking the specification document and final addendum | Approved requirements document + fully locked decisions glossary | Completed (`docs/01-requirements-final.md`) |
| **1** | ERD + data dictionary + settings tables + permissions and RLS matrix | Final schema + `UNIQUE` constraints + detailed permissions and RLS matrix | Completed (`docs/02` to `docs/08` + migrations `001`–`012`) |
| **2** | Responsive Arabic UX design (`RTL Mobile-First`) | Brand identity guide + core UI components (`RTL` + `Cairo`) | Completed (`src/app/globals.css`, `src/components/ui/*`) |
| **3** | Application foundation + OAuth + mandatory 2FA for admin roles + RBAC | Working login blocking all administrative access until `2FA (TOTP)` is enabled | Completed (`013_mfa_and_auth_helpers.sql`, `src/lib/auth/*`, `src/app/(auth)/*`) |
| **4** | Seller approval + mandatory agreement + multi-account Google Drive linking | Approved seller with signed agreement and multiple linked Drive accounts encrypted with `AES-256-GCM` | Completed (`014_seller_onboarding.sql`, `015_drive_upload.sql`, `src/app/(seller)/seller/onboarding/*`, `drive-accounts/*`) |
| **5** | Direct upload center (`Direct-to-Drive Resumable`) + versions | Direct browser-to-Drive upload bypassing Vercel + product and version management | Completed (`015_drive_upload.sql`, `021_product_management.sql`, `src/lib/google/drive.ts`, `src/app/api/upload/*`) |
| **6** | Automated scanning and quarantine + previews + watermark | Digital signature inspection (`Magic Bytes`) + suspicious file quarantine + diagonally watermarked previews | Completed (`022_scan_and_previews.sql`, `src/lib/server/services/scan-service.ts`, `preview-service.ts`) |
| **7** | Public storefront, hierarchical categories, and instant search | Guest browsing without an account + filtering and search + cycle-protected category management | Completed (`023_category_rpc.sql`, `src/app/(public)/*`, `src/app/(admin)/admin/categories/*`) |
| **8** | Purchase requests + codes (`HMAC-SHA256`) + 72 hours + post-delivery revocation block | Unique code issuance + order tracking + replacement code + brute-force protection + post-delivery cancellation block | Completed (`005_orders_and_codes.sql`, `016_purchase_flow.sql`, `024_redeem_hardening.sql`) |
| **9** | Download sessions + ZIP + individual files + atomic attempt counter | 3 attempts immune to concurrency bypass (`FOR UPDATE`) + `ExpiredPartial` partial session support | Completed (`006_downloads_and_compensation.sql`, `017_download_flow.sql`, `src/lib/server/services/download-service.ts`) |
| **10** | Compensation (cap of 3 per product code `code_id`) + exception requests | Compensation session for remaining files only + exception requests decided exclusively by `Super Admin` | Completed (`006_downloads_and_compensation.sql`, `017_download_flow.sql`, `src/app/(admin)/admin/compensations/*`, `exceptions/*`) |
| **11** | Finance: currencies + purchase-time exchange rates + commissions + wallets & payouts | Exchange rate lock at purchase time + seller wallets + minimum payout threshold (`100 USD`) | Completed (`007_finance.sql`, `018_finance_helpers.sql`, `src/lib/server/services/finance-service.ts`) |
| **12** | Reviews, content reports, notifications, admin dashboard, and seller reviews | One review per product enforced by `UNIQUE(product_id, buyer_id)` + seller reply & stats + instant notifications. Seller replies but **cannot delete reviews**; deletion is requested via a structured support ticket and executed only by Admin/Staff with `review.delete` from the admin ticket detail page (`review.deleted_from_ticket`). | Completed (`008`, `019`, `025`, `026`, `028_seller_reviews.sql`, `053_review_privacy_hardening.sql`, `054_review_delete_ticket_guard.sql`, `/seller/reviews`, `/admin/support/[id]`) |
| **13** | Separate settings tables (11 tables) + backups + `Append-Only` audit log | Immutable audit log protected against updates or deletion + settings, staff, and permissions management | Completed (`009_settings_tables.sql`, `010_audit_and_backups.sql`, `020_settings_and_staff_helpers.sql`) |
| **14** | Comprehensive security review + RPC and RLS hardening + Playwright E2E tests | Closure of RPC, RLS, and field-tampering vulnerabilities + 4 comprehensive E2E test suites | Completed (`027_security_hardening.sql`, `tests/e2e/specs/01..04`, `docs/security-review.md`) |

---

## 2. Actual Repository Implementation Map (Migrations & Modules)

### 2.1 Database Migrations (`supabase/migrations/001..055`)
- **`001_extensions_and_helpers.sql`**: Extensions (`pgcrypto`, `citext`), types (`ENUMs`), and `updated_at` helper functions.
- **`002_identity_and_roles.sql`**: Tables `profiles`, `seller_profiles`, `seller_applications`, `seller_agreements`, `seller_drive_accounts`, `roles`, `permissions`, `role_permissions`, `store_members`, `member_permissions`.
- **`003_security_helper_functions.sql`**: Security check helper functions (`SECURITY DEFINER`) used inside `RLS` policies.
- **`004_products_and_files.sql`**: Tables `categories`, `products`, `product_versions`, `files`, `file_versions`, `product_version_files`, `file_storage_locations`, `file_previews`, `upload_sessions`, `scan_jobs`, `quarantine_records`, `allowed_file_types`, `tags`, `product_tags`.
- **`005_orders_and_codes.sql`**: Tables `purchase_requests`, `purchase_request_items`, `orders`, `order_items`, `purchase_codes`, `code_redemptions`, `code_delivery_attempts` with triggers preventing code revocation or order cancellation after delivery.
- **`006_downloads_and_compensation.sql`**: Tables `download_sessions`, `download_tokens`, `download_attempts`, `download_deliveries`, `compensation_requests` (capped at 3 per `code_id`), `attempt_exception_requests` with triggers preventing session invalidation after delivery starts.
- **`007_finance.sql`**: Tables `exchange_rates`, `seller_commissions`, `seller_wallets`, `financial_transactions`, `seller_payouts`, `payments`.
- **`008_reviews_and_support.sql`**: Tables `reviews` (`UNIQUE(product_id, buyer_id)`), `favorites`, `content_reports`, `support_tickets`, `support_messages`, `notifications`.
- **`009_settings_tables.sql`**: The eleven separate settings tables (`Singleton id = 1`) with a trigger preventing modification of immutable fields (`mfa_enforced_roles`, `append_only_enforced`).
- **`010_audit_and_backups.sql`**: Tables `audit_logs` (`Append-Only` protected by `REVOKE` + trigger), `audit_archives`, `security_events`, `backup_jobs`, `backup_archives`, `restore_jobs`, `retention_policies`.
- **`011_rls_policies.sql`**: `Row-Level Security` policies for all tables.
- **`012_views_and_rpcs.sql`**: Safe Views and sensitive operation functions (`redeem_code`, `consume_attempt`, `confirm_code_delivery`, `create_compensation_session`, `issue_attempt_exception`, `adjust_wallet`).
- **`013_mfa_and_auth_helpers.sql`**: `2FA` verification functions and automatic profile creation on signup.
- **`014_seller_onboarding.sql`**: Functions for submitting seller applications, signing the seller agreement, and approving/rejecting/suspending sellers.
- **`015_drive_upload.sql`**: Functions for automatic Drive account selection (`pick_drive_account`) and quota updates (`update_drive_quota`).
- **`016_purchase_flow.sql`**: Temporary code handoff table (`code_plaintext_handoff`), and functions for creating, approving, and rejecting purchase requests and issuing replacement codes.
- **`017_download_flow.sql`**: Functions for recording completed attempts, closing sessions, transitioning expired partial sessions to `expired_partial`, and extending/revoking sessions before delivery.
- **`018_finance_helpers.sql`**: Functions for calculating effective commission, crediting seller earnings on order approval, and requesting/approving/disbursing/rejecting payouts.
- **`019_reviews_and_admin.sql`**: Functions for adding verified reviews, soft-deleting reviews with a mandatory reason, and processing content reports.
- **`020_settings_and_staff_helpers.sql`**: Triggers for automatically recording settings changes in `audit_logs`, and functions for managing staff and per-member permissions.
- **`021_product_management.sql`**: Functions for creating, updating, and publishing products and versions and validating the minimum price.
- **`022_scan_and_previews.sql`**: Scan queue functions (`claim_scan_jobs`, `complete_scan_pass`, `quarantine_file`, `release_from_quarantine`) and preview queue functions (`claim_preview_jobs`, `finalize_preview`, `fail_preview`).
- **`023_category_rpc.sql`**: Functions protecting the category tree from cycles (`category_would_create_cycle`, `set_category_parent`, `delete_category_safe`, `reorder_categories`).
- **`024_redeem_hardening.sql`**: `redeem_attempts` table, rate-limit checking (`check_redeem_rate_limit`), and hardening of `redeem_code` and `buyer_owns_code`.
- **`025_seller_orders_and_stats.sql`**: Views and functions for seller statistics and sales without exposing sensitive buyer data.
- **`026_notifications_system.sql`**: Expansion of the `notifications` table with automatic notification triggers and the `mark_all_notifications_read` function.
- **`027_security_hardening.sql`**: Comprehensive security hardening (permission checks inside 24 administrative RPC functions, revoking 5 server-only functions from `authenticated`, fixing 4 RLS policies, and adding 4 triggers to protect fields from tampering).
- **`028_seller_reviews.sql`**: Seller review management and replies (`seller_reply`, `seller_replied_at`, `seller_replied_by`, trigger `trg_restrict_review_reply`, view `seller_reviews_view` (`SECURITY INVOKER`), and statistics function `seller_review_stats`).
- **`029_storefront_ux.sql`**: Product cover image (`cover_image_url`), gallery images table `product_gallery_images` (with RLS and a maximum of 8 images per product), updates to `storefront_products` and `search_storefront`, plus `Breadcrumbs`, `ProductGallery`, `SimilarProducts` components and `loading.tsx` skeletons.
- **`030_admin_notifications.sql`**: `notify_staff_with_permission` function (`SECURITY DEFINER`, `service_role` only) and 5 automatic triggers notifying staff by permission (new seller, payout request, quarantined file, compensation, exception), plus the unified `/notifications` route with a pending-items banner.
- **`031_performance_indexes.sql`**: Enabling `pg_trgm` and the Arabic search index `idx_products_search_trgm`, 12 hot-path indexes, the `product_rating_stats` aggregate table, and rewriting `buyer_order_detail` and `buyer_orders_list` to eliminate `N+1` queries.
- **`032_seller_orders.sql`**: `seller_orders` and `seller_sales_stats` (`SECURITY DEFINER`) functions for displaying seller sales and stats with masked buyer identity (`ab***@domain.com`) and net amount calculation after commission.
- **`033_commission_snapshot_and_wallet.sql`**: Snapshotting the commission rate at sale time on `order_items` (`commission_rate_at_sale`, `commission_amount`, `net_seller_amount`), immediate atomic crediting into `seller_wallets.balance` and `financial_transactions` inside `approve_purchase_request` (protected by unique index `uq_fin_tx_order_item_type` against duplicates), and displaying financial transaction history in `/seller/wallet`.
- **`034_product_images_storage.sql`**: Creating the `product-images` bucket in Supabase Storage with `RLS` policies, server-side image processing via `sharp` (WebP conversion + EXIF stripping + resizing), real deletion from Storage on removal, and tightening `img-src` in `middleware.ts` by removing the open `https:` wildcard.
- **`035_email_notifications.sql`**: `email_outbox` table (Transactional Outbox pattern) with 4 automatic triggers for critical events (order approval/rejection, code delivery confirmation, payout decision, and seller status), real delivery via `nodemailer` (SMTP) or Resend API, and daily admin digest (`/api/internal/worker/admin-digest`).
- **`036_seller_order_detail.sql`**: Single-sale detail RPC for sellers with masked buyer identity.
- **`037_backup_automation.sql`**: Private `database-backups` Supabase Storage bucket, backup job/archive lifecycle, due checks, isolated restore verification records, and Super Admin backup settings RPC.
- **`038_auth_user_profile_trigger.sql`**: Automatic creation of `profiles` (and pending `seller_profiles`) on new auth user signup.
- **`039_fix_search_storefront_return_type.sql`**: Cast `rating_count` to `bigint` so `search_storefront()` matches its declared return type.
- **`040_drive_store_folder.sql`**: Dedicated Google Drive "Store" folder id per linked seller Drive account; Picker imports stay inside that folder.
- **`041_fix_view_row_scoping.sql`**: Explicit ownership predicates inside SECURITY DEFINER views (preserving guest-order email fallback).
- **`042_protect_profile_fields.sql`**: Before-update trigger denying changes to privileged profile fields (status, MFA fields, account type, email verification).
- **`043_mfa_hardening.sql`**: Real TOTP enrollment (`mfa_enrollments`) and failed-attempt/lockout tracking (`mfa_attempts`), service-role-only access.
- **`044_revoke_pick_drive_account.sql`**: Removes residual `PUBLIC EXECUTE` from server-only `pick_drive_account`.
- **`045_fix_pgcrypto_search_path.sql`**: Corrects `hmac()` lookup for code-hash functions under Supabase's `extensions` schema.
- **`046_block_compensation_after_completion.sql`**: Blocks opening compensation for a fully delivered order.
- **`047_code_pepper_from_caller.sql`**: Code hash functions take `CODE_HASH_PEPPER` from the trusted caller instead of a fallback pepper.
- **`048_protect_product_rating_stats.sql`**: RLS and write revocation on `product_rating_stats`; public EXECUTE retained only for the trigger-called refresh function.
- **`049_compensation_four_eyes.sql`**: Separate `request.reject` permission, `FOR UPDATE` lock on pending compensation approvals, approve-only permission check, single pending request and 3-session cap.
- **`050_delivery_result_skipped.sql`**: Honest `skipped` delivery result; resend returns `501 RESEND_NOT_IMPLEMENTED` instead of claiming success.
- **`051_download_ownership_rpc.sql`**: Enforces buyer ownership (including guest email matching) before download completion and file-set validation.
- **`052_guest_review_eligibility.sql`**: Guest-aware `can_current_user_review` so email-matched guest purchases can be reviewed.
- **`053_review_privacy_hardening.sql`**: Scopes seller review stats, restricts soft-delete to admin/staff with `review.delete`, and masks buyer identity.
- **`054_review_delete_ticket_guard.sql`**: Structured seller support ticket (`product_id`, `order_item_id`, `review_id`); admin/staff-only `delete_review_from_ticket` with buyer-case guards; legacy `delete_review` becomes service-role-only; trigger defence in depth; `review.deleted_from_ticket` audit event.
- **`055_download_token_ledger.sql`**: Enforced single-use download token ledger (`register_download_token`, `claim_download_token`, `mark_download_token_completed`, service-role-only) with token hash registration, atomic claim before Drive resolution, byte/checksum verification against `file_versions`, and an atomic completion step that rejects replayed callbacks.
- **Download Worker (`workers/download`)**: Cloudflare Worker implementing `docs/download-service-contract.md` (HMAC token verification, short-lived Drive URL resolution, streaming or store-only ZIP, measured bytes/checksum completion callbacks, retry only on transport errors). Source and tests are in the repo; deployment and secret configuration remain operational tasks.

---

## 3. Remaining Operational Items Before Actual Launch (Operational & Legal Decisions)

These items are no longer "entirely undone": drafting, code and runbooks are prepared in
the repository. What remains is external review, vendor configuration, deployment and
sign-off. Do not treat a prepared document as evidence that the external task is finished.

| # | Item | Prepared in repo | Remaining work / status |
|---|---|---|---|
| 1 | **Legal review of Seller Agreement, Privacy Policy and Terms of Use** | [`docs/legal-review-drafts.md`](legal-review-drafts.md) contains DRAFT clauses with the mandatory statement: *"Payment takes place outside the platform; the platform does not provide financial refunds; its role is strictly limited to issuing download codes and protected delivery sessions."* | **Prepared, NOT approved.** Requires qualified external counsel, Arabic translation approval, jurisdiction choices and launch sign-off. Not legal advice. |
| 2 | **Production plan quotas and limits** | [`docs/plan-limits.md`](plan-limits.md) proposes launch defaults for Vercel, Google Drive API, Supabase, the Worker, R2/S3 backups, email outbox and alerts. | **Prepared.** Confirm every number against live vendor dashboards and record the approved values in the launch log. |
| 3 | **Independent download streaming service (`DOWNLOAD_SERVICE_URL`)** | **Implementation is in the repo**: Cloudflare Worker under `workers/download` (`src/index.ts`, `token.ts`, `resolve.ts`, `drive.ts`, `zip.ts`, `complete.ts`, tests) implements `docs/download-service-contract.md`. Migration `055_download_token_ledger.sql` enforces single-use tokens. | **Deploy still operational.** Run Worker tests/typecheck, set `DOWNLOAD_SERVICE_TOKEN` and `APP_INTERNAL_URL` as Worker secrets, `wrangler deploy`, then set `DOWNLOAD_SERVICE_URL` on the app and run an end-to-end stream/completion smoke test. Not deployed by this plan. |
| 4 | **Administrative cloud storage for backups** | [`docs/backup-storage-config.md`](backup-storage-config.md) documents independent R2/S3 setup, separate keys, least-privilege IAM, versioning/object lock, lifecycle, watchdog and restore drills. Env var names already exist in `.env.example`. | **Doc prepared; bucket provisioning is external.** Create and secure the bucket/KMS identity, populate secrets, verify one upload and one isolated restore. Existing runner stores to private Supabase Storage `database-backups` per `docs/backups.md`; do not assume R2/S3 writes are live. |
| 5 | **Production default values from the Super Admin panel** | [`docs/production-defaults.md`](production-defaults.md) lists `min_product_price`, EGP/KWD/SAR/USD rates, `100 USD` payout threshold, 4 h / 3 attempts / 72 h download settings, MFA-enforced roles, and verification SQL. | **Doc prepared; values not set in production.** Super Admin must apply and verify them after the final migration run; confirm proposed rates and minimum price with the business owner. |
| 6 | **Soft launch plan** | [`docs/soft-launch-plan.md`](soft-launch-plan.md) defines proposed phases (e.g. 10 sellers / 100 products in the closed pilot), monitoring windows, success criteria, rollback/stop criteria and support staffing. | **Plan prepared.** Requires business/security sign-off and evidence from each phase gate before expanding. |

Related cross-cutting controls already documented: append-only audit events
([`docs/05-audit-events.md`](05-audit-events.md)), MFA/RBAC
([`docs/04-permissions-matrix.md`](04-permissions-matrix.md)), RLS
([`docs/08-rls-matrix.md`](08-rls-matrix.md)), and the ticket-based review moderation path
([`docs/seller-reviews.md`](seller-reviews.md)).

---

## 4. Pre-Deployment Checklist

1. Apply all migrations **up to `055`** in order on staging and then production
   (`pnpm db:push` / reviewed migration workflow). Confirm the applied version by checking
   `supabase_migrations.schema_migrations` (or the Supabase migration dashboard) rather than
   assuming success.
2. Create/verify the Supabase Storage buckets: `previews` per
   `docs/scan-preview-flow.md`, `product-images` per migration
   `034_product_images_storage.sql`, and the private `database-backups` bucket per
   `docs/backups.md`.
3. Verify environment variables in Vercel/secret stores: `ENCRYPTION_KEY`,
   `CODE_HASH_PEPPER`, `DOWNLOAD_SERVICE_TOKEN`, `DOWNLOAD_SERVICE_URL`, `WORKER_SECRET`,
   `GOOGLE_DRIVE_*`, SMTP/Resend settings, and the four `BACKUP_STORAGE_*` variables.
4. Deploy the download Worker from `workers/download` (Cloudflare):
   - run its typecheck and Node tests (`npm run typecheck`, `npm test`);
   - set `DOWNLOAD_SERVICE_TOKEN` and `APP_INTERNAL_URL` as Worker secrets;
   - run `npx wrangler deploy`, then point the app's `DOWNLOAD_SERVICE_URL` at the deployed
     origin and smoke-test a single-file and a ZIP download including completion callback.
   Deployment is an operational action; repository presence is not deployment.
5. Provision and verify the independent backup bucket/KMS identity and run one backup plus
   one isolated restore drill (`docs/backup-storage-config.md`, `docs/backups.md`).
6. Apply and verify production defaults as Super Admin (`docs/production-defaults.md`),
   including MFA roles and the mandatory no-refund checkout statement.
7. Obtain external legal sign-off on the DRAFT texts in `docs/legal-review-drafts.md` before
   public launch; confirm vendor limits in `docs/plan-limits.md`.
8. Verify typechecking (`pnpm typecheck`) and all four Playwright suites (`pnpm test:e2e`):
   - `01-full-journey.spec.ts`
   - `02-attempts-and-compensation.spec.ts`
   - `03-security.spec.ts`
   - `04-security-hardening.spec.ts`
   Also include the review-deletion ticket guards from `docs/06-testing-checklist.md` and the
   Worker tests before opening the soft launch.
9. Execute the gate in `docs/soft-launch-plan.md` for Phase 0 before inviting sellers.

---

## 5. Next Iteration Roadmap

- [x] **Seller Reviews Page (`/seller/reviews`)**: Completed in migration `028_seller_reviews.sql`; seller reply/stats remain, while review deletion is now admin/staff-only via a structured seller support ticket (`054_review_delete_ticket_guard.sql`). See `docs/seller-reviews.md`.
- [x] **Storefront UX Enhancements (`Storefront UX`)**: Completed in migration `029_storefront_ux.sql` (`cover_image_url`, `product_gallery_images`, `Breadcrumbs`, `ProductGallery`, `SimilarProducts`, `loading.tsx`) and `docs/storefront-ux.md`.
- [x] **Admin Notifications & Unified `/notifications` Route**: Completed in migration `030_admin_notifications.sql`, `src/app/notifications/*`, and `docs/admin-notifications.md`.
- [x] **Security Headers (`CSP + Nonce + HSTS + Permissions-Policy`)**: Completed in `middleware.ts`, `src/app/layout.tsx`, `next.config.mjs`, `/api/csp-report`, and `docs/security-headers.md`.
- [x] **Performance Review**: Completed in migration `031_performance_indexes.sql` (`pg_trgm`, `product_rating_stats`, `N+1` resolution in `buyer-service.ts`, `unstable_cache` + `revalidateTag`, `<Suspense>` streaming in `/products`) and `docs/performance.md`.
- [x] **Seller Orders Page (`/seller/orders`)**: Completed in migration `032_seller_orders.sql`, `src/app/(seller)/seller/orders/*`, and `docs/seller-orders.md` with buyer identity masking.
- [x] **Commission Snapshot at Sale Time + Wallet Crediting (`credit wallet`)**: Completed in migration `033_commission_snapshot_and_wallet.sql` with financial transaction history in `/seller/wallet`.
- [x] **Direct Product Image Uploads to Supabase Storage + `sharp` + CSP Tightening**: Completed in migration `034_product_images_storage.sql`, `product-image-service.ts`, `/api/seller/images/upload`, and `img-src` tightening in `middleware.ts`.
- [x] **Real Email Notifications + Daily Admin Digest**: Completed in migration `035_email_notifications.sql`, `email-service.ts` (`nodemailer` SMTP + Resend API), `email-cron` and `admin-digest` routes, and `docs/email-notifications.md`.
- [x] **Seller Order Detail Page (`/seller/orders/[orderItemId]`)**: Completed in migration `036_seller_order_detail.sql` and `src/app/(seller)/seller/orders/[orderItemId]/page.tsx`, displaying `code_prefix`, snapshotted commission, and download sessions & deliveries without exposing buyer identity.
- [x] **Automated Backups & Isolated Restore Verification**: Completed in migration `037_backup_automation.sql`, script `scripts/backup-and-verify.mjs`, GitHub Actions workflow (`.github/workflows/backup-and-verify.yml`), Vercel Cron Watchdog (`/api/internal/worker/backup-cron`), upgraded `/admin/backups`, and `docs/backups.md`.
