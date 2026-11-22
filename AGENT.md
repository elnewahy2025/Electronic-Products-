# AGENT.md — AI Agent Rules, Architecture & Skills Guide

This file is the authoritative instruction manual for any AI coding agent (Antigravity, Claude Code, Codex, Cursor, Gemini CLI, etc.) working on the **Electronic Products Platform** repository. Read and follow every rule in this file before making any code, database, or configuration change.

---

## 1. Platform Identity & Core Domain

- **Product:** Arabic RTL multi-vendor digital products marketplace (educational materials, lesson plans, presentations, documents, videos, and downloadable digital assets).
- **Identity Rule (Non-Negotiable):** Always preserve 100% of the platform's digital-products marketplace identity (`NEXT_PUBLIC_APP_NAME`). Never introduce unrelated hardware/PCB/electronics copy from reference prototypes.
- **UI Language:** User-facing storefront, buyer, seller, and admin UI copy is **Arabic (`lang="ar" dir="rtl"`)**, while internal engineering documentation (`AGENT.md`, `README.md`, `DESIGN.md`, `docs/07-implementation-plan.md`), code, SQL, and commit messages are in **English**.
- **Payment Model:** Payments happen **outside the platform** (manual/off-platform settlement). The platform does not process card payments or offer refunds; its role is purchase request approval, unique `HMAC-SHA256` purchase code issuance, and protected download session delivery.

---

## 2. Tech Stack & Repository Structure

- **Framework:** Next.js `14.2.15` (App Router, React 18, TypeScript 5.6, Tailwind CSS 3.4)
- **Database & Auth:** Supabase (PostgreSQL + Auth + RLS + Storage)
- **File Storage:** Direct-to-Google-Drive Resumable Uploads (`googleapis`) per seller account (`AES-256-GCM` encrypted refresh tokens) + Supabase Storage buckets (`product-images`, `previews`, `database-backups`)
- **Media Processing:** `sharp` (WebP optimization, EXIF stripping, SVG watermarking, first-page cover compositing), `pdf-to-img`, `@google/genai` (optional AI cover generation)
- **Email & Notifications:** Transactional outbox (`email_outbox`) via `nodemailer` (SMTP) or Resend API + real-time in-app `notifications`
- **Testing:** Playwright E2E (`tests/e2e/specs/01..04`)

```text
├── AGENT.md                  # This file — AI agent rules, invariants & skills
├── DESIGN.md                 # Visual design system & Light/Dark tokens
├── README.md                 # Project overview & local setup (English)
├── docs/                     # Requirements, ERD, RLS matrix, security, performance, implementation plan
├── supabase/
│   ├── config.toml           # Local Supabase configuration (project_id = "electronic-products")
│   └── migrations/           # Ordered SQL migrations (001 through 039+)
├── src/
│   ├── middleware.ts         # Per-request CSP Nonce, HSTS, security headers, route guards
│   ├── app/
│   │   ├── (public)/         # Storefront: /, /products, /products/[slug], /categories, /redeem, /support
│   │   ├── (auth)/           # /login, /register, /forgot-password, /reset-password, /verify-mfa, /auth/callback
│   │   ├── (buyer)/          # /account, /account/orders, /account/favorites, /account/downloads
│   │   ├── (seller)/         # /seller, /seller/products, /seller/upload, /seller/drive-accounts, /seller/orders, /seller/wallet, /seller/reviews
│   │   ├── (admin)/          # /admin, /admin/sellers, /admin/requests, /admin/compensations, /admin/exceptions, /admin/payouts, /admin/settings, /admin/backups, /admin/staff, /admin/audit-logs, /admin/security-events
│   │   ├── seller/pending/   # Standalone pending-approval route (MUST stay outside (seller) layout to prevent redirect loops)
│   │   └── api/              # REST API routes & internal worker/cron endpoints
│   ├── components/           # Shared, Storefront, Buyer, Seller, Admin UI components
│   └── lib/                  # Server services, auth/session, crypto, Google Drive, Supabase clients
├── scripts/                  # Operational scripts (e.g., scripts/backup-and-verify.mjs)
└── tests/e2e/                # Playwright E2E test suites
```

---

## 3. Non-Negotiable Engineering Rules

### 3.1 Zero Fake Implementations
- Never mock, stub, hardcode, or fake business logic, database queries, API responses, scans, emails, backups, or image processing.
- Every feature must read/write real PostgreSQL tables, real Supabase Storage buckets, real Google Drive APIs, and real settings tables (`watermark_settings`, `general_settings`, etc.).

### 3.2 Security, Auth & Database Invariants
1. **RLS & `SECURITY DEFINER`:**
   - Every table must have Row-Level Security (`RLS`) enabled.
   - Every administrative `SECURITY DEFINER` RPC must explicitly verify caller permissions inside the function body and revoke `EXECUTE` from `public` / `authenticated` when restricted to `service_role`.
   - Never expose sensitive buyer identity (`email`, `phone`) to sellers; always use masked views/RPCs (`ab***@domain.com`).
2. **Irreversible Delivery & Code Rules:**
   - Purchase codes are stored ONLY as `HMAC-SHA256` hashes (`CODE_HASH_PEPPER`). Plaintext codes exist only in the temporary `code_plaintext_handoff` mechanism.
   - Once code delivery is confirmed or a download has started, **no one (not even `Super Admin`)** can revoke/cancel the code or download session. Enforced via database triggers.
   - Download attempts are capped at **3 completed attempts** per product using row-level locking (`FOR UPDATE`).
   - Compensation sessions are capped at **3 per `code_id`** and only cover remaining undownloaded files. Attempt exception requests require exclusive `Super Admin` approval.
3. **Immutable Audit & Settings:**
   - `audit_logs` is strictly `Append-Only` (`REVOKE UPDATE, DELETE` + trigger). Never bypass or weaken it.
   - `mfa_enforced_roles` and `append_only_enforced` in singleton settings tables (`id = 1`) are immutable.
   - All staff/admin accounts MUST have `2FA (TOTP)` enabled before accessing `/admin/*`.
4. **PostgREST Ambiguous Foreign Keys (`PGRST201`):**
   - When a table has multiple foreign keys to `profiles` (e.g., `seller_profiles`, `reviews`), always use explicit FK hints in Supabase `.select()` queries (e.g., `profiles:profiles!seller_profiles_profile_id_fkey(...)`, `profiles:profiles!reviews_buyer_id_fkey(...)`).
5. **Auth Profile Creation Trigger:**
   - New signups automatically create `public.profiles` (and pending `seller_profiles` when registering as a seller) via `on_auth_user_created` (`038_auth_user_profile_trigger.sql`).
6. **CSP & Middleware (`src/middleware.ts`):**
   - Emit `upgrade-insecure-requests` ONLY in production (`!isDev`), never in local HTTP development.
   - Keep `img-src` tightly scoped (no open `https:` wildcard); allow Supabase Storage URLs and `data:`/`blob:` previews only where required.
   - Never place `/seller/pending` inside `src/app/(seller)/layout.tsx` (it causes an infinite redirect loop for unapproved sellers).
   - Never create duplicate `/auth/callback` route handlers — the canonical handler is `src/app/(auth)/auth/callback/route.ts`.

### 3.3 Google Drive Uploads, Scanning, Previews & Watermarking
1. **Direct-to-Drive Resumable Upload (`src/lib/drive/resumable.ts`):**
   - Files upload directly from the seller's browser to Google Drive (never proxied through Next.js/Vercel).
   - Always forward the browser `Origin` header in `initiateResumableUpload` so Google Drive returns valid CORS headers.
   - Never manually set the forbidden `Content-Length` header on browser XHR requests.
2. **Immediate Local Scan Kick:**
   - `/api/upload/complete` triggers `processPendingScans(3)` immediately after upload completion so magic-byte verification transitions files to `ready` without waiting for external cron.
3. **Watermark Service (`src/lib/server/services/watermark-service.ts`):**
   - Always read real settings from `public.watermark_settings` (`id = 1`: `text_template`, `opacity_level`, `direction`) and `public.general_settings` (`platform_name`).
   - Use dual-contrast SVG stroke + fill (`surface: 'light' | 'dark' | 'auto'`) so watermarks remain legible on both white document pages (`DOCX/PDF/PPTX`) and dark backgrounds.
   - Delivered buyer files remain clean (unwatermarked) unless `apply_to_delivered_files` is explicitly enabled and implemented.
4. **Document Previews & Automatic First-Page Covers:**
   - `preview-service.ts` uses Google Drive's high-res `thumbnailLink` (`=s1200`) + `applyWatermarkToImage` for `docx`, `pptx`, `xlsx`, `mp4`, `webm`, falling back to a watermarked placeholder only if Drive has not generated a thumbnail yet.
   - `product-image-service.ts` (`extractFirstPageCoverFromDrive`) extracts Page 1 from Drive, applies an **optional seller-controlled watermark toggle** (`apply_watermark`, default `true`), composites onto a `1200×750` WebP preview, and requires explicit seller approval (`action: 'approve'`) before uploading to `product-images`.

### 3.4 UI, Design System, Dark Mode & RTL Rules
- Follow [DESIGN.md](DESIGN.md) strictly.
- **Full-Width Responsive Layout:** `.container` in `tailwind.config.ts` is configured to `100%` width across desktop breakpoints with responsive padding (`1rem` → `2.5rem`). Keep login/register forms centered with `max-w-md`; do NOT artificially narrow main storefront or dashboard pages with `max-w-5xl` / `1140px`.
- **Semantic Tokens Only (No Hardcoded White/Gray):**
  - Never use hardcoded `bg-white`, `bg-gray-50`, or `text-gray-900` on cards/surfaces. Always use semantic tokens: `bg-background`, `bg-card`, `bg-muted`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-brand`, `text-brand-foreground`.
- **Dark Mode Inputs & Autofill:**
  - `globals.css` enforces `color-scheme: light/dark` and `:-webkit-autofill` styling. Always include proper `autoComplete` attributes on auth/profile forms so browsers never autofill emails into phone inputs.
- **RTL & Numeric Isolation:**
  - Root HTML is `<html lang="ar" dir="rtl">`.
  - Wrap prices, percentages, IDs, dates, file sizes, and codes in `.ui-num` or `.tabular-nums` (`direction: ltr; unicode-bidi: isolate`).
- **Hydration Safety:**
  - Never branch initial render text on client-only values (`window`, `searchParams` read only client-side, `localStorage`, `Date.now()`) without a mounted guard or server-passed prop.

---

## 4. Local Development, Commands & Platform Quirks (Windows)

### 4.1 Local Environment Endpoints
- **Next.js Dev Server:** `http://localhost:3010`
- **Local Supabase (Docker Desktop, `project_id = "electronic-products"`):**
  - API: `http://127.0.0.1:55321`
  - PostgreSQL: `postgresql://postgres:postgres@127.0.0.1:55322/postgres` (container: `supabase_db_electronic-products`)
  - Supabase Studio: `http://127.0.0.1:55323`
  - Mailpit UI: `http://127.0.0.1:55324`

### 4.2 Windows Command Rules (Critical)
- **Typecheck:** Always run `.\node_modules\.bin\tsc.cmd --noEmit` directly (avoids pnpm v11 `ERR_PNPM_IGNORED_BUILDS` script issues on Windows).
- **Dev Server:** `.\node_modules\.bin\next.cmd dev -p 3010`
- **Production Build:** `.\node_modules\.bin\next.cmd build` (note: `next.config.mjs` includes `serverComponentsExternalPackages: ['sharp', 'canvas', 'pdf-to-img', 'nodemailer']`).
- **Installing Packages:** Use `pnpm add --config.ignore-scripts=true <pkg>` when native build scripts fail under pnpm v11 on Windows.
- **Git Push on Windows:** If OpenSSL resets connections to `github.com:443`, push using Windows native TLS:
  ```powershell
  git -c http.sslBackend=schannel -c http.version=HTTP/1.1 push origin main
  ```
- **SQL Inspection (Local Docker DB):**
  ```powershell
  docker exec supabase_db_electronic-products psql -U postgres -d postgres -c "<SQL>"
  ```
- **Untracked Reference Directory:** Do NOT commit `Html/` unless explicitly requested by the user.

---

## 5. Verification & Testing Workflow

Before marking any task complete:
1. **Typecheck:** Run `.\node_modules\.bin\tsc.cmd --noEmit` and ensure zero errors.
2. **Database Migrations:** When adding a migration (`supabase/migrations/0XX_name.sql`), apply it cleanly to local PostgreSQL and verify constraints, triggers, return types, and RLS policies.
3. **Runtime / UI Verification:** Verify affected pages or API endpoints against the live local server (`http://localhost:3010`) — check HTTP status, hydration warnings, Dark/Light contrast, RTL alignment, and real DB state.
4. **E2E Suite:** When modifying critical flows (auth, purchase, redeem, downloads, compensation, RLS/RPC security), run the relevant Playwright E2E spec in `tests/e2e/specs/`:
   - `01-full-journey.spec.ts`
   - `02-attempts-and-compensation.spec.ts`
   - `03-security.spec.ts`
   - `04-security-hardening.spec.ts`

---

## 6. Recommended Agent Skills & Capabilities

When an AI agent runtime supports modular skills, activate and apply the following skills whenever their domain matches the task:

| Domain | Skill(s) to Apply | When to Use |
|---|---|---|
| **React & Next.js Performance** | `react-best-practices` | Writing or refactoring React Server Components, App Router pages, data fetching, caching (`unstable_cache`, `Suspense`), and eliminating waterfalls. |
| **UI Components & Styling** | `shadcn-ui`, `design-md`, `taste-design` | Building accessible UI primitives, maintaining `DESIGN.md` semantic tokens, and preserving RTL visual hierarchy. |
| **End-to-End Verification** | `verification`, `chrome-devtools`, `a11y-debugging`, `cookie-debugging` | Verifying complete browser → API → database flows, auditing WCAG/RTL accessibility, and debugging auth cookies/sessions or CSP headers. |
| **Vercel Deployment & Infra** | `deployments-cicd`, `env-vars`, `vercel-functions`, `vercel-schedules`, `vercel-firewall`, `cdn-caching`, `routing-middleware` | Deploying to Vercel, managing environment variables, configuring cron jobs/schedules, WAF/firewall rules, and middleware headers. |
| **Google Drive & Media** | `gdrive`, `gemini-api-cli` | Working with Google Drive APIs, OAuth, file thumbnails, or Gemini API media generation. |
| **Backend & Workflows** | `create-a-backend`, `workflow`, `queues`, `auth` | Designing durable background workers (email outbox, scan/preview queues, backup verification) and auth/MFA flows. |
| **Security & Data** | `docs/security-review.md`, `docs/08-rls-matrix.md`, `docs/04-permissions-matrix.md` | Mandatory project reference docs to consult before editing any RPC, RLS policy, permission check, or download/redeem route. |

---

## 7. Key Reference Documentation Index

Always consult the relevant spec in `docs/` before changing core domain logic:
- [docs/01-requirements-final.md](docs/01-requirements-final.md) — Final requirements & locked executive decisions
- [docs/02-erd-dictionary.md](docs/02-erd-dictionary.md) — Mermaid ERD, data dictionary & state machines
- [docs/03-settings-tables.md](docs/03-settings-tables.md) — 11 singleton settings tables
- [docs/04-permissions-matrix.md](docs/04-permissions-matrix.md) — Full RBAC, download, compensation & exception matrix
- [docs/05-audit-events.md](docs/05-audit-events.md) — Append-only `audit_logs` events & retention
- [docs/07-implementation-plan.md](docs/07-implementation-plan.md) — Phased implementation plan & migration map
- [docs/08-rls-matrix.md](docs/08-rls-matrix.md) — Table-by-table RLS policies & `SECURITY DEFINER` hardening
- [docs/security-review.md](docs/security-review.md) & [docs/security-headers.md](docs/security-headers.md) — Security audit & CSP/HSTS headers
- [docs/drive-upload-flow.md](docs/drive-upload-flow.md) & [docs/scan-preview-flow.md](docs/scan-preview-flow.md) — Direct-to-Drive upload, scan, preview & watermark pipeline
- [docs/download-service-contract.md](docs/download-service-contract.md) & [docs/redeem-hardening.md](docs/redeem-hardening.md) — Download streaming contract & redeem rate-limiting
- [docs/backups.md](docs/backups.md) & [docs/email-notifications.md](docs/email-notifications.md) — Automated backup verification & email outbox
