# E2E Tests — Playwright

## Prerequisites
1. A **dedicated test Supabase project** (never production).
2. `.env.test` with the variables from `.env.test.example`.
3. Migrations `001` → `024` applied to the test project.
4. A running Next.js dev server pointing at the test project (`pnpm dev`).

## First-time setup
```bash
cp .env.test.example .env.test   # fill in credentials
pnpm add -D @playwright/test dotenv
pnpm exec playwright install --with-deps chromium