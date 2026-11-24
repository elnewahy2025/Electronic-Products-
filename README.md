# Digital Products Marketplace Platform (Electronic Products Platform)

A high-security Arabic multi-vendor platform for selling and delivering digital products, built with **Next.js 15 (App Router)** and **Supabase (PostgreSQL 17 + Auth + RLS + Storage)** with direct integration to sellers' **Google Drive** accounts.

## Core Features
- **Direct-to-Drive Resumable Upload:** Files are uploaded directly from the seller's browser to linked Google Drive accounts without passing through Vercel servers, featuring automatic quota distribution (`quota`) and resumable upload support.
- **Signature Screening and Watermarked Previews:** File type/extension validation (`Magic Bytes`, first 8 KiB) and quarantine of mismatches, with generation of diagonally watermarked previews (`{platform_name} — Unlicensed Copy`), while the original file is delivered cleanly to the buyer without a watermark. This is type screening, not malware scanning; see [`docs/file-screening-risk.md`](docs/file-screening-risk.md).
- **Purchase Code System and Protected Download Sessions:**
  - Unique purchase codes stored as `HMAC-SHA256` hashes with brute-force protection (`Rate Limiting`) and a redemption attempts log.
  - Download sessions limited to 4 hours (configurable by Super Admin) and a maximum of 3 completed download attempts per product (full ZIP or completion of all individual files).
  - Support for partial sessions (`ExpiredPartial`), administrative compensation sessions (up to a maximum of 3 compensation sessions per product code `code_id`), and attempt exception requests decided exclusively by `Super Admin`.
  - Complete prevention of revoking or canceling codes or sessions after delivery confirmation or download start, even by `Super Admin`.
- **Financial Management and Multi-Currency Support:** Support for `USD, EGP, SAR, KWD` with exchange rate snapshotting strictly at the moment of purchase, seller wallets, and payout requests (with a default minimum threshold of 100 USD).
- **Granular Permissions System and Immutable Audit Log (`Append-Only Audit Log`):** Mandatory two-factor authentication (`2FA / TOTP`) for administrative roles, comprehensive `Row-Level Security (RLS)` policies (`001`–`064`) with column-protection triggers, **Cloudflare Turnstile** bot protection on auth flows, and an audit log protected against deletion or modification.
- **Production Observability & Uptime Monitoring:** Structured JSON server error logging (`logServerError`), **`@sentry/nextjs`** error tracking with strict cookie/header/body/PII scrubbing (`scrubSentryEvent`) and source map uploads, a public `GET /api/health` endpoint, and active **Sentry Uptime Monitors** on `/` and `/api/health`.

## Reference Documentation (`docs/`)
| Document | Contents |
|---|---|
| [`docs/01-requirements-final.md`](docs/01-requirements-final.md) | Complete final requirements document and locked executive addendum |
| [`docs/02-erd-dictionary.md`](docs/02-erd-dictionary.md) | Entity-Relationship Diagram (`Mermaid ERD`), data dictionary, constraints, and state machines |
| [`docs/03-settings-tables.md`](docs/03-settings-tables.md) | Design of the eleven separate settings tables (`Singleton Settings Tables`) |
| [`docs/04-permissions-matrix.md`](docs/04-permissions-matrix.md) | Full permissions matrix (Administration + **Download, Compensation, and Exception Flow Permissions Matrix** + Reviews) |
| [`docs/05-audit-events.md`](docs/05-audit-events.md) | Audit log (`audit_logs`) event dictionary, protection rules, and archiving |
| [`docs/06-testing-checklist.md`](docs/06-testing-checklist.md) | Mandatory pre-launch testing checklist |
| [`docs/07-implementation-plan.md`](docs/07-implementation-plan.md) | Updated phased implementation plan (0–14), migration map (`001`–`064`), and remaining items |
| [`docs/08-rls-matrix.md`](docs/08-rls-matrix.md) | Detailed `RLS` matrix for every table, safe views, triggers, and `SECURITY DEFINER` function hardening |
| [`docs/drive-upload-flow.md`](docs/drive-upload-flow.md) | Google Drive linking flow, direct resumable upload, and quota management |
| [`docs/scan-preview-flow.md`](docs/scan-preview-flow.md) | Automated scanning pipeline, quarantine, and watermarked preview generation |
| [`docs/download-service-contract.md`](docs/download-service-contract.md) | Independent download streaming service contract (`Download Streaming Service`) |
| [`docs/redeem-hardening.md`](docs/redeem-hardening.md) | Hardening of the code redemption endpoint (`/api/redeem`), attempt limits, and threat model |
| [`docs/categories-management.md`](docs/categories-management.md) | Hierarchical categories management and cycle prevention |
| [`docs/notifications.md`](docs/notifications.md) | Instant notifications system and automatic database triggers |
| [`docs/admin-notifications.md`](docs/admin-notifications.md) | Permission-targeted admin notifications and unified `/notifications` route (`030_admin_notifications.sql`) |
| [`docs/email-notifications.md`](docs/email-notifications.md) | Real email notifications (`email_outbox` + `nodemailer`/Resend + daily admin digest `035_email_notifications.sql`) |
| [`docs/storefront-ux.md`](docs/storefront-ux.md) | Storefront enhancements: cover images and gallery, `Breadcrumbs`, similar products, and `Skeletons` (`029_storefront_ux.sql`) |
| [`docs/seller-reviews.md`](docs/seller-reviews.md) | Seller reviews management (`/seller/reviews`), aggregated statistics, and replying to reviews (`028_seller_reviews.sql`) |
| [`docs/seller-orders.md`](docs/seller-orders.md) | Seller sales page (`/seller/orders`), buyer identity masking, and net calculation after commission (`032_seller_orders.sql`) |
| [`docs/security-review.md`](docs/security-review.md) | Comprehensive security review, discovered vulnerabilities, and their fixes in `027_security_hardening.sql` |
| [`docs/security-headers.md`](docs/security-headers.md) | Browser-level security headers (`CSP + Nonce`, `HSTS`, `Permissions-Policy`, `/api/csp-report`) |
| [`docs/file-screening-risk.md`](docs/file-screening-risk.md) | Magic-byte type-screening scope and owner-signed residual risk record |
| [`docs/secret-scanning.md`](docs/secret-scanning.md) | Full-history `gitleaks` CI scanning and local pre-commit hook setup |
| [`docs/backups.md`](docs/backups.md) | Automated PostgreSQL 17 backup & fail-closed isolated restore verification |
| [`docs/performance.md`](docs/performance.md) | Performance review: indexes (`pg_trgm`), `N+1` resolution, `unstable_cache`, and `Suspense` streaming (`031_performance_indexes.sql`) |

## Project Structure
```text
├── docs/                     # Requirements, ERD, permissions & RLS matrices, contracts, security, and performance docs
├── supabase/
│   ├── config.toml           # Local Supabase configuration (PostgreSQL 17)
│   ├── migrations/           # Database migration files (001 to 064)
│   └── rollbacks/            # Manual rollback scripts (outside auto-applied migrations/)
├── src/
│   ├── app/                  # Next.js App Router pages, layouts, and API Routes
│   ├── components/           # UI components (Storefront, Buyer, Seller, Admin, Auth/Turnstile)
│   └── lib/                  # Server services, auth, encryption, Sentry PII scrubbing, Google Drive
├── workers/download/         # Independent Cloudflare Download Streaming Worker + unit tests
└── tests/e2e/                # End-to-end Playwright tests (01 to 07)
```

## Local Setup & Running
1. Copy the environment file `.env.example` to `.env.local` and configure Supabase, Google OAuth, and encryption key variables:
   ```bash
   cp .env.example .env.local
   ```
2. Install packages and start the development server:
   ```bash
   pnpm install
   pnpm dev
   ```
3. To apply the database migrations to Supabase:
   ```bash
   pnpm db:push
   ```
4. To run End-to-End (Playwright E2E) tests:
   ```bash
   cp .env.test.example .env.test
   pnpm test:e2e
   ```

## Deployment notes

- Set `NEXT_PUBLIC_APP_URL` to the canonical `https://` origin. `next.config.mjs`
  includes a production-only HTTP→HTTPS fallback for requests carrying
  `x-forwarded-proto: http`; it is not a replacement for edge configuration.
- Configure HTTP→HTTPS redirection and the canonical host (apex or `www`) in the
  hosting platform for every custom domain. First-visit plaintext requests and
  alternate hostnames are handled at the edge, not reliably by application code.
- Verify with `curl -I http://<host>/` and `curl -I http://<alternate-host>/`;
  both should redirect to the same canonical HTTPS origin.

## Download Streaming Worker

The independent Cloudflare Worker lives in `workers/download`. For local dev, copy
`workers/download/.dev.vars.example` to `.dev.vars` and run `npx wrangler dev` from
that directory (it listens on `http://localhost:8787`); point `.env.local`'s
`DOWNLOAD_SERVICE_URL` at that origin. Deploy with `npx wrangler deploy` after setting
`DOWNLOAD_SERVICE_TOKEN` and `APP_INTERNAL_URL` as Worker secrets. See
[`docs/download-service-contract.md`](docs/download-service-contract.md).
