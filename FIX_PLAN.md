# Security Fix Plan

Target: elnewahy2025/Electronic-Products- @ main 53629d0bb3918cc22924bf95a7fb65b6720cfcfb
Basis: source-verified audit report plus read-only peer review of the remote repository.
Note: deployment, RLS/grants, edge/provider settings and restore drills are NOT verified by source review.

## High

### 1. Purchase-request UPDATE authorization too broad
- Finding: staff with the read-only permission `request.read.any` can directly UPDATE status and unguarded contact/cancellation fields via the database API; buyers can also edit fields the trigger does not guard.
- Cause: migration 057 `pr_update` grants UPDATE to `request.read.any` and `is_admin_or_above()`; the BEFORE UPDATE trigger exempts those same principals from all field checks. This weakness was inherited from migration 011. Only buyer_id, financial fields and access_token_hash are guarded, and status only for buyer cancellations.
- Required fix: introduce a dedicated write permission (for example `request.update`); remove `request.read.any` from UPDATE policy; guard every sensitive column for every non-service-role principal; keep the delivered-code cancellation block; test direct PostgREST writes; align docs/08-rls-matrix.md.

### 2. No application-enforced login/password-reset throttling
- Finding: login and forgot-password flows call Supabase Auth directly with only UI busy-state; no app-side throttling or failed-login audit events.
- Cause: `login_rate_limit_per_hour` and `code_rate_limit_per_hour` exist in migration 009 but are unused; no server auth route or RPC enforces them. Provider-side limits are unknown.
- Required fix: enforce per-email and trusted-IP throttling server-side or at the provider; wire the settings table; log failures to security_events; preserve enumeration-safe recovery responses.

### 3. Costly seller/Drive endpoints lack throttles
- Finding: Drive import, token refresh, folder operations and auto-cover generation can consume quota/compute without request throttles.
- Cause: handlers have only batch/input caps and sequential processing; no rate limiter, concurrency cap or per-account quota exists in source.
- Required fix: add per-account and per-IP quotas, concurrency/job caps, token-refresh caching and cost-aware generation limits; add abuse monitoring.

### 4. Six moderate dependency advisories below CI's gate
- Finding: Next.js 15.5.28 (3 advisories), next-intl 3.26.5 (2) and transitive uuid 9.0.1 (1) are reported; zero high/critical. CI gates at high severity, so it passes.
- Cause: exact Next pin below the 15.5.29 fix, next-intl fixes only in 4.x, uuid 9.x via googleapis; CI uses `pnpm audit --prod --audit-level=high`.
- Required fix: upgrade Next to >=15.5.29, assess next-intl 4.x migration, override/upgrade uuid, refresh the lockfile, re-audit, and either lower the CI gate to moderate or record time-bound exceptions.

## Medium

### 5. Origin validation is partial and trusts forwarded host
- Finding: helper ignores scheme, trusts `x-forwarded-host`, and is applied only to admin/seller prefixes and two auth handlers.
- Cause: `src/lib/security/origin.ts` builds its allowlist from config plus request host plus forwarded host; `URL.host` does include non-default ports, so the report's "not port" wording is inaccurate. Ingress sanitization is unknown.
- Required fix: use a fixed canonical full-origin allowlist (scheme + host + port); strip or trust forwarded headers only behind a verified sanitizing proxy; verify live behavior.

### 6. CSRF coverage does not cover all cookie-authenticated mutations
- Finding: notification POSTs and other ordinary mutations are outside the guard; only admin/seller prefixes and sign-out/MFA are checked.
- Cause: guard lives in middleware path matching plus two direct handler calls; routes such as notifications, favorites, reviews and support are not covered. SameSite=Lax reduces but does not remove same-site risk.
- Required fix: centralize origin/CSRF checks for all unsafe cookie-authenticated methods; explicitly exempt token-authenticated machine routes; add negative E2E tests.

### 7. Support-message INSERT does not bind sender identity
- Finding: authenticated clients can insert a message with an arbitrary `sender_id` on their own ticket, bypassing application handlers.
- Cause: migration 057 `support_msgs_insert` checks ticket ownership and `is_internal` but not `sender_id = auth.uid()`; the column is nullable.
- Required fix: add `sender_id = auth.uid()` to WITH CHECK, make it NOT NULL where compatible, and test direct PostgREST inserts.

### 8. HTTPS redirect not enforced by application source
- Finding: HSTS exists in source, but HTTP-to-HTTPS redirection and canonical host behavior are delegated to Vercel/edge and unverified.
- Cause: no application redirect or `x-forwarded-proto` handling; no edge configuration in the repository.
- Required fix: verify or configure edge redirects for HTTP→HTTPS and canonical host, document custom-domain behavior, verify live headers.

### 9. Payment approval does not enforce or record settlement evidence
- Finding: approval creates access and seller earnings with no persisted payment attestation, amount, currency or reference.
- Cause: approve RPC accepts only request id and pepper; the off-platform payment model is undocumented in code; no schema column stores a reference.
- Required fix: define the attestation model; persist actor/time/amount/currency/reference atomically before issuing codes and credits, or formally define approval itself as the attestation with two-person approval and audit evidence.

### 10. Audit fail-closed option is unused by critical callers
- Finding: business mutations can succeed when audit insertion fails.
- Cause: `logAudit` supports `required: true`, but none of its 27 callers uses it; SQL-side `log_audit` calls are transactional, the app-layer ones are not.
- Required fix: couple each critical mutation and audit write in one guarded transaction/RPC, or add an outbox/retry; mark critical callers fail-closed.

### 11. Error response sanitization is inconsistent
- Finding: raw messages are still returned by some API routes; the two "locally fixed" leaks claimed in the report are absent from the reviewed revision.
- Cause: `publicError` exists and is widely used, but `support/tickets/route.ts:80`, `seller/drive/store-folder/route.ts:62` and `drive/callback/route.ts:39-42` still leak; commit 894794f sanitized different files.
- Required fix: apply `publicError` to every remaining raw return; add a CI grep/lint check; correct the report to state those fixes are not in 53629d0.

### 12. Upload completion has multi-write partial-failure risk
- Finding: file, location, version, scan and completion writes are separate; a failure can leave orphans.
- Cause: `upload-service.ts` performs five sequential PostgREST calls; catch only resets session status, with no compensating deletes; scan_jobs insert error is not checked. Session claiming via 'completing' does exist.
- Required fix: replace with a single guarded RPC using conditional session claim and atomic inserts, or implement reliable compensation and reconciliation; test mid-sequence failure and concurrent completion.

### 13. File scan is type/signature screening, not malware scanning
- Finding: scanner reads at most 8 KiB, checks magic bytes/extensions and accepts zip-based formats without opening them.
- Cause: `scan-service.ts` and `src/lib/files/signature.ts` implement only signature checks; no AV engine or archive extraction exists.
- Required fix: add isolated full-object scanning with quarantine on failure and archive expansion limits, or formally re-document as type-only screening with accepted-risk sign-off.

### 14. Backup verification can succeed without a verified archive
- Finding: missing archive or lookup error returns normally; checksum is conditional; independent storage is not wired.
- Cause: `scripts/backup-and-verify.mjs` logs and returns on missing archive, checks checksum only if metadata exists, and uses Supabase Storage only. docs/backups.md also says PostgreSQL 15 while the workflow uses 17.
- Required fix: fail closed on missing archive/checksum; verify restore evidence and row counts; wire independent provider/key/storage; align PG version; run an isolated restore drill.

### 15. Full-history secret exposure is undetermined
- Finding: no full-history secret scan was performed and no scanner is configured; the remote repo actually has 79 commits of full history.
- Cause: report assumed a shallow checkout; CI has no secret-scanning job, and only a source pattern check was done.
- Required fix: run gitleaks/trufflehog over the complete history, rotate anything found, add pre-commit/CI scanning, and correct the shallow-history claim.

## Low / conditional

### 16. Public product-search input validation incomplete
- Finding: page/offset and search inputs lack complete finite/range/length validation; no SQL injection was demonstrated.
- Cause: direct parsing of query parameters without full bounds.
- Required fix: validate with zod, bound page/offset and query length, reject non-finite values.

### 17. Picker API key delivered to seller browsers
- Finding: key is intentionally browser-visible; risk depends on provider restrictions and quotas, which are unverified.
- Cause: Google Picker API design; no provider console evidence in source.
- Required fix: confirm narrow API/referrer restrictions, quotas and monitoring; record explicit risk acceptance.

### 18. Weak MIME/checksum validation at upload initialization
- Finding: claimed MIME/checksum are weakly validated at init; finalization checks do prevent a demonstrated type bypass.
- Cause: init trusts client metadata; finalization independently checks MIME/size/signatures.
- Required fix: validate MIME against extension and checksum syntax at initialization.

### 19. CSP reports and security logging lack durable alerting
- Finding: reports log to stdout, reporting endpoint is conditional, no durable event writer or alert dispatch found.
- Cause: source route has no retention/alert integration; external forwarding unknown.
- Required fix: add bounded ingestion, durable retention and alert thresholds; verify external integrations operationally.

### 20. CSP report body limit checked after full read
- Finding: oversized unauthenticated bodies may be buffered before rejection unless an upstream cap exists.
- Cause: `await req.text()` precedes the 8 KiB size check in `csp-report/route.ts`.
- Required fix: use bounded streaming reads and verify an edge request-size cap.

### 21. Worker CORS policy reflects arbitrary origins
- Finding: no "no CORS policy" — `workers/download/src/headers.ts` reflects any Origin; no credentials header is set, so this is not a credentialed bypass. Token also travels in the URL query string with no Referrer-Policy.
- Cause: worker header helper uses request Origin directly; token URL design.
- Required fix: restrict allowed origins to the canonical app origin or document server-only usage; set Referrer-Policy; minimize token exposure in URLs/logs.

### 22. Recent duplicate purchase-request prevention is race-prone
- Finding: concurrent submissions may create multiple pending requests; not concurrency-tested.
- Cause: check-then-insert without uniqueness constraint or idempotency key.
- Required fix: add a database uniqueness constraint/locking or idempotency key and test concurrent submissions.

### 23. CI omissions and stale tooling configuration
- Finding: no worker unit tests or E2E in CI; pnpm 11 ignores the legacy package.json build-policy block; `next lint` is deprecated. CI at 53629d0 passed, but the parent commit's CI run failed.
- Cause: CI only runs install, typecheck, lint, build and high-threshold audit; config left from older tooling.
- Required fix: add worker unit tests to CI, decide E2E gating, remove the stale block and migrate the lint command.

### 24. Backup storage/provider isolation unverified
- Finding: runner uses Supabase Storage; documented separate provider/key/IAM expectations are not implemented; object lock, encryption, replication and restore drills unverified.
- Cause: docs describe external tasks; workflow supplies no storage-provider variables.
- Required fix: implement/verify independent storage and keys, object lock, encryption, replication and restore evidence.

## Report corrections (documentation only)

### R1. "No direct error leaks found" claim is false at reviewed HEAD
- Finding: line 69 of the report claims a clean targeted search; two raw responses remain at 53629d0.
- Cause: search/verification presumably performed in a different uncommitted worktree.
- Required fix: amend the report to say the sanitization fixes are not in the reviewed revision.

### R2. "Admin pages and API handlers have server-side checks" is overstated
- Finding: all admin API files have guards and middleware covers /admin, but only 1 of 31 admin pages has an explicit permission check.
- Cause: generalization from API guard coverage.
- Required fix: qualify the claim; add page-level permission checks where intended.

### R3. Origin helper described as ignoring port
- Finding: report says host only, not scheme/port; scheme is ignored but `URL.host` includes non-default ports.
- Cause: imprecise reading of `new URL(value).host`.
- Required fix: correct the wording in the report.

### R4. Checklist map misses findings 17 and 20
- Finding: no explicit row for Picker key exposure or CSP body-limit ordering.
- Cause: mapping gap between 24 findings and 27 checklist rows.
- Required fix: add or cross-reference rows for both findings.
