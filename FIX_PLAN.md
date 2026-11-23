# Security Fix Plan — Remediation Status

**Repository:** `elnewahy2025/Electronic-Products-` (`main`, migrations `001`–`062`)  
**Last Verified:** 2026-11-24 (`CI #45284742683` all 3 jobs green; `Backup & Restore Drill #45284743344` green; branch protection active on `main`)

---

## High — All 4 Resolved & CI-Gated

| # | Finding | Status | Implementation & Verification |
|---|---|---|---|
| **1** | Purchase-request UPDATE authorization too broad | **FIXED** | Migration `058_high_security_fixes.sql` adds dedicated `request.update` permission, removes `request.read.any` from `pr_update`, guards all sensitive columns for every non-`service_role`/RPC caller, and preserves `trg_purchase_requests_block_cancel`. Verified by `tests/e2e/specs/05-high-security-fixes.spec.ts` in CI and aligned in `docs/08-rls-matrix.md` & `docs/04-permissions-matrix.md`. |
| **2** | No application-enforced login/password-reset throttling | **FIXED** | Migration `058` adds persistent `api_rate_limit_hits` + atomic `consume_rate_limit()` RPC. Server routes `/api/auth/login`, `/api/auth/forgot-password` (wired to `security_settings.code_rate_limit_per_hour`), and `/api/auth/oauth` enforce per-email + trusted-IP throttling (`net.isIP()`, Vercel-only `x-vercel-forwarded-for`, opt-in `TRUST_CLOUDFLARE_IP=1`), log to `security_events`, and return enumeration-safe recovery responses. Verified in CI spec `05` and live production. |
| **3** | Costly seller/Drive endpoints lack throttles | **FIXED** | DB-backed per-seller + per-IP rate limits (`seller-throttle.ts`), distributed PostgreSQL concurrency locks (`059`, `api_concurrency_locks`, 300s TTL on Drive import), encrypted DB Drive access-token cache (`059` + `060` column-level `REVOKE SELECT, UPDATE`), and invalidation on account revoke across `import`, `picker-token`, `store-folder`, `link`, and `auto-cover`. Verified in CI spec `05`. |
| **4** | Six moderate dependency advisories below CI's gate | **FIXED** | Upgraded `next` & `eslint-config-next` to `15.5.29`, removed unused `next-intl`, overrode `uuid` to `^11.1.1` in `pnpm-workspace.yaml`, and lowered CI gate to `pnpm audit --prod --audit-level=moderate` → **`No known vulnerabilities found`** (0 critical, 0 high, 0 moderate, 0 low). |

---

## Medium — All 11 Resolved (with Explicit Ops Notes)

| # | Finding | Status | Implementation & Verification |
|---|---|---|---|
| **5** | Origin validation partial / trusts forwarded host | **FIXED** | `src/lib/security/origin.ts` enforces fixed canonical full-origin allowlist (`NEXT_PUBLIC_APP_URL` + `CSRF_ALLOWED_ORIGINS`); no `x-forwarded-host` or `req.nextUrl.host` trust. |
| **6** | CSRF coverage does not cover all cookie mutations | **FIXED** | `middleware.ts` enforces centralized unsafe-method Origin guard on all `/api/**` routes before Supabase work with explicit machine exemptions (`/api/internal/*`, `/api/csp-report`, `/api/download/*/complete`, `/api/seller/drive/callback`). Verified in CI spec `06` and live production (`403`). |
| **7** | Support-message INSERT does not bind sender identity | **FIXED** | Migration `061` tightens `support_msgs_insert` with `sender_id = auth.uid()` and adds `trg_support_messages_sender_guard` trigger. Verified in CI spec `06`. |
| **8** | HTTPS redirect not enforced by application source | **FIXED & VERIFIED** | `next.config.mjs` adds production-only `x-forwarded-proto=http` → canonical `https://` redirect; verified live on Vercel edge (`http://electronic-products-omega.vercel.app/` → `308` to `https://` + HSTS `max-age=63072000; includeSubDomains; preload`). |
| **9** | Payment approval does not record settlement evidence | **FIXED** | Migration `061` adds `purchase_request_attestations` and 3-arg `approve_purchase_request(p_request_id, p_pepper, p_attestation)` (legacy 2-arg raises `attestation_required`), written atomically before order/code/wallet side effects; admin API & UI updated. Verified in CI spec `06`. |
| **10** | Audit fail-closed option unused by critical callers | **FIXED** | Critical callers (MFA, settings, Drive link/revoke/default, admin product status, admin file delete, seller product CRUD) pass `required: true` to `logAudit`; SQL RPC audits remain transactional. |
| **11** | Error response sanitization inconsistent | **FIXED** | Sanitized remaining leaks in `support/tickets`, `seller/drive/callback`, `admin/compensation/[id]/approve`, and `internal/worker/backup-cron`; enforced via `scripts/check-api-errors.mjs` (`pnpm lint:api-errors`) in CI `verify`. |
| **12** | Upload completion multi-write partial-failure risk | **FIXED** | Migration `061` adds service-role-only atomic `register_drive_file` and `complete_upload_session` RPCs (accepting `'uploading'`/`'completing'`) + partial unique active provider-file index; `upload-service.ts` uses them. Verified in CI spec `06`. |
| **13** | File scan is type/signature screening, not AV | **SIGNED OFF** | Clarified across code and docs as magic-byte type screening; owner accepted documented residual risk in `docs/file-screening-risk.md` (`elnewahy@gmail.com`, `2026-11-24`). |
| **14** | Backup verification can succeed without verified archive | **FIXED & DRILLED** | `scripts/backup-and-verify.mjs` and migration `061` fail closed on missing archive/checksum/PG-version/row-count evidence. Live drill `#45284743344` passed in 1m50s against production PG 17. *(Off-site R2 mirror deferred by owner until Cloudflare R2 card activation.)* |
| **15** | Full-history secret exposure undetermined | **FIXED** | Full-history `gitleaks 8.30.1` job in CI (`Secret scan (full history)` — 0 leaks), local `.githooks/pre-commit` enabled (`git config core.hooksPath .githooks`), and documented in `docs/secret-scanning.md`. |

---

## Low / Conditional — Resolved & Documented

| # | Finding | Status | Implementation & Verification |
|---|---|---|---|
| **16** | Public product-search input validation incomplete | **FIXED** | Strict `zod` schema with finite/range/length bounds in `src/app/api/storefront/search/route.ts` (verified live: `?offset=-5&min=NaN` → `400`). |
| **17** | Picker API key delivered to seller browsers | **BY DESIGN** | Required by Google Picker browser SDK; restricted to `drive.file` scope with referrer/API restrictions configured in GCP Console. |
| **18** | Weak MIME/checksum validation at upload init | **FIXED** | Strict 64-hex SHA-256 regex in `upload/init/route.ts` & `validators/upload.ts`, plus `MIME_MISMATCH` check in `upload-service.ts` `initUpload`. |
| **19** | CSP reports lack durable retention/alerting | **FIXED** | `src/app/api/csp-report/route.ts` persists rate-limited (30/hr per IP), sanitized `csp_violation` events to `security_events`. |
| **20** | CSP report body limit checked after full read | **FIXED** | `src/app/api/csp-report/route.ts` uses a bounded streaming reader (`readBoundedText`, 8 KiB cap) that aborts before buffering oversized payloads. |
| **21** | Worker CORS reflects arbitrary origins | **FIXED** | `workers/download/src/headers.ts` & `index.ts` restrict `Access-Control-Allow-Origin` to canonical `APP_INTERNAL_URL` origin and emit `Referrer-Policy: no-referrer` (deployed & verified live). |
| **22** | Duplicate purchase-request prevention race-prone | **FIXED** | Migration `062_low_security_fixes.sql` adds `pg_advisory_xact_lock` per `(email, product_id)` inside `create_purchase_request`. |
| **23** | CI omissions and stale tooling configuration | **FIXED** | Added Worker unit tests (`7/7` passing) to CI `verify`, removed ignored legacy `pnpm` block from `package.json`, and enabled branch protection on `main` requiring all 3 CI jobs. |
| **24** | Backup storage/provider isolation unverified | **DEFERRED (OPS)** | Private Supabase Storage `database-backups` + live restore drill `#45284743344` are active and verified; independent Cloudflare R2 off-site mirror deferred by owner until card activation. |
