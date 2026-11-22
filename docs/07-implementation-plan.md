# Updated Phased Implementation Plan and Completion Status

This plan documents the fifteen approved phases (0–14) for building the Digital Products Marketplace Platform, linking each phase to what has actually been implemented in the repository (database migrations up to `032`, server services, user interfaces, and end-to-end tests), in addition to the remaining operational items before actual launch and the roadmap for additional enhancements.

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
| **12** | Reviews, content reports, notifications, admin dashboard, and seller reviews | One review per product enforced by `UNIQUE(product_id, buyer_id)` + seller reply & stats + deletion with mandatory reason + instant notifications | Completed (`008`, `019`, `025`, `026`, `028_seller_reviews.sql`, `/seller/reviews`) |
| **13** | Separate settings tables (11 tables) + backups + `Append-Only` audit log | Immutable audit log protected against updates or deletion + settings, staff, and permissions management | Completed (`009_settings_tables.sql`, `010_audit_and_backups.sql`, `020_settings_and_staff_helpers.sql`) |
| **14** | Comprehensive security review + RPC and RLS hardening + Playwright E2E tests | Closure of RPC, RLS, and field-tampering vulnerabilities + 4 comprehensive E2E test suites | Completed (`027_security_hardening.sql`, `tests/e2e/specs/01..04`, `docs/security-review.md`) |

---

## 2. Actual Repository Implementation Map (Migrations & Modules)

### 2.1 Database Migrations (`supabase/migrations/001..032`)
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

---

## 3. Remaining Operational Items Before Actual Launch (Operational & Legal Decisions)

1. **Final Legal Review** of the seller agreement text, privacy policy, and terms of use, including the explicit statement: *"Payment takes place outside the platform, the platform does not provide financial refunds, and its role is strictly limited to issuing download codes."*
2. **Actual Plan Limits Document**: Locking production plan quotas and limits for Vercel, Google Drive API, Supabase, the download streaming service, and administrative cloud backup storage.
3. **Connecting the Independent Download Streaming Service (`DOWNLOAD_SERVICE_URL`)**: Deploying the external streaming Worker (e.g., Cloudflare Worker per `docs/download-service-contract.md`) to stream Drive files and large ZIP archives outside Vercel.
4. **Setting Up Administrative Cloud Storage for Backups** (Cloudflare R2 or AWS S3 independent of sellers' Drive accounts) and configuring separate encryption keys.
5. **Setting Production Default Values from the `Super Admin` Panel**: Minimum product price (`min_product_price`), initial exchange rates (`EGP, KWD, SAR, USD`), and minimum payout threshold (`100 USD`).
6. **Defining the Soft Launch Plan**: Initial number of sellers, product volume, and monitoring performance and audit logs.

---

## 4. Pre-Deployment Checklist

1. Apply all migrations up to `032` in order on staging and then production databases (`pnpm db:push`).
2. Create the public previews storage bucket `previews` in Supabase Storage according to `docs/scan-preview-flow.md`.
3. Verify all environment variables are configured in `.env.local` / Vercel (`ENCRYPTION_KEY`, `CODE_HASH_PEPPER`, `DOWNLOAD_SERVICE_TOKEN`, `WORKER_SECRET`, `GOOGLE_DRIVE_*`).
4. Verify typechecking passes (`pnpm typecheck`) and all four Playwright test suites pass (`pnpm test:e2e`):
   - `01-full-journey.spec.ts`
   - `02-attempts-and-compensation.spec.ts`
   - `03-security.spec.ts`
   - `04-security-hardening.spec.ts`

---

## 5. Next Iteration Roadmap

- [x] **Seller Reviews Page (`/seller/reviews`)**: Completed in migration `028_seller_reviews.sql` and `docs/seller-reviews.md`.
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
