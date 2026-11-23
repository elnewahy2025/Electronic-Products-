# E2E Tests — Playwright

## Prerequisites
1. A **dedicated test Supabase project** (never production).
2. `.env.test` with the variables from `.env.test.example`.
3. Migrations `001` → `061` applied to the test project.
4. A running Next.js dev server pointing at the test project (`pnpm dev`).

## First-time setup
```bash
cp .env.test.example .env.test   # fill in credentials
pnpm add -D @playwright/test dotenv
pnpm exec playwright install --with-deps chromium
```

## Running
```bash
# Ensure dev server is running on :3000
pnpm dev

# In another terminal
pnpm test:e2e            # headless
pnpm test:e2e:headed     # with browser visible
pnpm test:e2e:ui         # Playwright UI (interactive)
pnpm test:e2e -- --grep "full journey"   # run one spec
pnpm test:e2e -- --grep "security hardening"
```

In CI, set `CI=1` and Playwright will build/start the app automatically.

### CI high-security job
The `e2e-high-security` job in `.github/workflows/ci.yml` needs **no repository secrets**. It boots a disposable local Supabase with the CLI, applies all migrations, exports the generated anon/service-role keys into both the app and test environments, then runs the security gate specs (`05-high-security-fixes.spec.ts`, `06-medium-security-fixes.spec.ts`). The fake Google/token/encryption values in that job are shared by the app and Playwright so the origin guard and crypto helpers behave consistently.

## Test structure
| Spec | Covers |
|---|---|
| `01-full-journey.spec.ts` | Storefront → purchase request → admin approve → confirm delivery → redeem → download ZIP → review |
| `02-attempts-and-compensation.spec.ts` | Single-file attempts, session completion, compensation sessions (max 3 per `code_id`), super admin exception grants |
| `03-security.spec.ts` | Auth required, ownership checks, rate limits, code/session revocation blocks after delivery, seller isolation, audit append-only |
| `04-security-hardening.spec.ts` | Direct PostgREST admin RPC blocking, service-only RPC revocation, `files_update` `WITH CHECK` ownership protection, `seller_payouts` direct insert block, field-level protection on `notifications`, `reviews`, and `purchase_codes` |
| `05-high-security-fixes.spec.ts` | Reproducible H1–H4 verification: `purchase_requests` RLS/trigger guards, auth-route Origin guard + enumeration-safe recovery + atomic rate-limit RPC, and distributed concurrency-lock contention/anon denial |
| `06-medium-security-fixes.spec.ts` | Medium verification: CSRF origin guard coverage, support sender binding, payment attestation atomicity, and atomic upload-completion behavior |

## How seeding works
To avoid hitting Google Drive, scan workers, and preview generators during tests,
the helpers seed fully-ready records directly:
- `file_versions.scan_status = 'ready'`
- `file_previews.status = 'ready'` with a fake `public_url`
- `product_versions.status = 'published'`

This lets us test the **application logic** (orders, codes, downloads, RLS) without
coupling to external services. Drive upload and worker logic should be covered by
separate integration/unit tests with their own mocks.

## Cleanup
Each spec runs `cleanupTestData()` in `afterAll`, which identifies test data by the
`@test.local` email domain and deletes it in FK-safe order. Auth users are also
deleted via `adminDb.auth.admin.deleteUser`.

## Env note
`CODE_HASH_PEPPER` **must match** between the running Next.js app and Playwright.
If they diverge, codes seeded by the test won't hash to what the app expects.
