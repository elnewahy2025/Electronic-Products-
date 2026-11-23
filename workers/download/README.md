# Download Streaming Worker

Cloudflare Worker implementing [the download service contract](../../docs/download-service-contract.md).
It verifies short-lived HMAC tokens, asks the Next.js app to resolve them, streams
Google Drive files (or a store-only ZIP) to the buyer, and reports delivery back
to the app. Zero runtime npm dependencies.

## Local development

```bash
cp .dev.vars.example .dev.vars      # fill in real values locally; .dev.vars is gitignored
npx wrangler dev                    # http://localhost:8787
```

Set the app's `DOWNLOAD_SERVICE_URL=http://localhost:8787` (origin only, no
`/stream`). The middleware allows that exact origin in CSP `connect-src`.

## Secrets and deployment

```bash
npx wrangler secret put DOWNLOAD_SERVICE_TOKEN   # must match the app's secret
npx wrangler secret put APP_INTERNAL_URL         # deployed app origin
npx wrangler deploy
```

`DOWNLOAD_SERVICE_TOKEN` is also the value sent as `x-internal-secret` to the
app. Never put real secrets in `wrangler.toml`, this README, or `.dev.vars.example`.
`npx wrangler` is invoked on demand; wrangler is intentionally not a package
dependency.

## Verification

```bash
npm run typecheck   # tsc --noEmit
npm test            # Node test runner: token, ZIP, streaming audit, callbacks
```

Tests require Node 22.18+ for built-in TypeScript type stripping.

## Safety notes

- Tokens are verified with WebCrypto HMAC-SHA256; the 32-byte signature is
  compared over all bytes. Expired or tampered tokens never reach the resolver.
- Each file is fetched with **its own** short-lived `access_token`; tokens are
  never shared between files, logged, or exposed to the browser.
- Actual source bytes are counted and incrementally SHA-256 hashed. Size or
  checksum mismatch, Drive failure and client abort all suppress the completion
  callback.
- Completion is retried only for transport errors/5xx (max 3 attempts, backoff)
  in `ctx.waitUntil`; `4xx` is terminal. There is no buyer self-completion.
- Logs contain only error codes and the token nonce. Because Cloudflare
  observability is enabled, configure Workers Logs secret redaction for the
  `token` query parameter and the `x-internal-secret` / `Authorization` headers
  so platform request logs cannot leak them.
