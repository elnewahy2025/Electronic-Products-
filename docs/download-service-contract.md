# Download Service — Contract

The Next.js app delegates all large file streaming to an independent Cloudflare
Worker. Reference implementation: [`workers/download`](../workers/download/README.md).
The worker keeps every downloaded byte outside Vercel; only short JSON control
calls go back to the app.

## 1. Environment

### Next.js app (`src/lib/crypto/download-token.ts`)
- `DOWNLOAD_SERVICE_TOKEN` — shared HMAC secret (also the worker's `x-internal-secret`).
- `DOWNLOAD_SERVICE_URL` — **worker origin only**, e.g. `http://localhost:8787`
  locally or `https://download.example.com` in production. Do **not** append
  `/stream`; the app appends `/stream?token=...` itself.

### Worker (`workers/download/wrangler.toml` / `.dev.vars`)
- `DOWNLOAD_SERVICE_TOKEN` — secret, must match the app value byte-for-byte.
- `APP_INTERNAL_URL` — app origin (e.g. `http://localhost:3010`), no trailing path.
  In production set it with `wrangler secret put APP_INTERNAL_URL`; locally put it
  in `.dev.vars`.

Never place real secrets in `wrangler.toml`, `.env.example`, source code, logs,
response bodies, or browser-visible headers.

## 2. Token format

`base64url(JSON payload) + "." + base64url(HMAC_SHA256(encodedPayload, DOWNLOAD_SERVICE_TOKEN))`

```json
{ "sid": "<uuid>", "fid": "<uuid>", "typ": "single", "exp": 1730000000, "n": "<nonce>" }
```

- `fid` is required for `single` and absent for `zip`.
- `exp` is Unix **seconds**; the worker rejects `exp < now` (matching the Node verifier).
- `n` is a nonce used only for safe log correlation.
- The worker decodes the 32-byte signature and compares **all 32 bytes** with the
  locally computed HMAC (no early exit on mismatch), then validates payload shape.
  It accepts a token only if the signature, type and expiry are all valid.

## 3. Client-facing endpoint

```http
GET {DOWNLOAD_SERVICE_URL}/stream?token=<token>
OPTIONS {DOWNLOAD_SERVICE_URL}/stream   (CORS preflight, 204)
```

`DOWNLOAD_SERVICE_URL` is an origin. Every browser request must carry the token
in the query string; the worker never accepts it in a header or body.

## 4. Internal resolve call (token is single-use)

The worker POSTs to the app:

```http
POST {APP_INTERNAL_URL}/api/internal/resolve-token
x-internal-secret: <DOWNLOAD_SERVICE_TOKEN>
content-type: application/json
```

```json
{ "token": "<token>" }
```

The resolver owns token consumption (single-use) and session/file authorization.
It returns `200`:

```json
{
  "type": "single | zip",
  "session_id": "<uuid>",
  "files": [
    {
      "file_version_id": "<uuid>",
      "drive_url": "https://...",
      "filename": "lesson.pdf",
      "mime": "application/pdf",
      "size_bytes": 12345,
      "sha256": "<64 hex> | null",
      "access_token": "<short-lived bearer token for THIS file only>"
    }
  ]
}
```

**Bearer tokens are per file.** Files in one product version may belong to
different seller Drive accounts. The worker must send
`Authorization: Bearer <that file's access_token>` only to that file's
`drive_url`. It must never reuse a token across files, requests, or logs, and
must never return it to the browser. `sha256` is optional; if present it must be
64 hex characters.

The worker cross-checks that `session_id === payload.sid`, `type === payload.typ`,
and (for `single`) the one returned file's `file_version_id === payload.fid`.
Any mismatch fails closed.

## 5. Streaming and byte/checksum semantics

For each file the worker fetches `drive_url` with that file's own bearer token
and streams the response through an auditing transform:

- Count **actual source bytes read** (not `content-length`, not `size_bytes`).
- Compute SHA-256 incrementally over those exact bytes (WebCrypto is one-shot, so
  the worker uses a small incremental implementation; file content is never buffered).
- Fail closed if total bytes differ from `size_bytes`.
- If `sha256` was supplied, fail closed if the computed hex digest differs.
- For `single`, send the audited bytes directly with `Content-Type` from `mime`,
  a sanitized `Content-Disposition: attachment`, and `Content-Length` from
  `size_bytes`.
- For `zip`, build a store-only ZIP in a `TransformStream`: local file headers
  with general-purpose bit 3 (data descriptors), CRC-32/sizes in descriptors, a
  central directory at the end, and an EOCD record. Names are sanitized
  (`../`, backslashes, absolute paths and control characters removed) and
  deduplicated. Only central-directory metadata is buffered.
- The ZIP's per-file completion checksum is the **SHA-256 of the original file
  bytes**, not the ZIP CRC-32.
- Streams are backpressured and bounded; `client abort` stops the source and
  suppresses completion.

## 6. Completion callback (worker-only)

Only after the full output stream has been handed off / flushed, and only if
every file's byte count and checksum passed, the worker POSTs:

```http
POST {APP_INTERNAL_URL}/api/download/{session_id}/complete
x-internal-secret: <DOWNLOAD_SERVICE_TOKEN>
content-type: application/json
```

```json
{
  "token": "<token>",
  "files": [
    { "file_version_id": "<uuid>", "bytes_sent": 12345, "checksum": "<sha256 hex>" }
  ]
}
```

Retry rules, run via `ctx.waitUntil`:
- Transport errors and `5xx`: retry up to **3 attempts total** with 100 ms then
  200 ms backoff.
- `4xx` is terminal (no retry).
- Failure after 3 attempts is logged as a code only; the download is not retried
  by the worker.

Completion is **internal-secret only**. Buyers cannot self-report completion;
any buyer-facing completion route is removed on the app side. The resolver's
`claim` and the callback's `mark completed` are two separate atomic steps in
`download_tokens` (migration 055). The app rejects a replayed callback with
`409 {"error":"TOKEN_ALREADY_USED"}`. The worker MUST NOT call the completion
endpoint on: invalid/expired token, resolve failure, Drive failure, byte-count
or checksum mismatch, or client abort.

## 7. Status mapping (client responses)

| Condition | Worker status | Public body |
|---|---|---|
| Wrong path / method | 404 / 405 | `{"error":"NOT_FOUND"}` / `{"error":"METHOD_NOT_ALLOWED"}` |
| Missing, malformed, tampered or expired token | 401 | `{"error":"INVALID_TOKEN"}` |
| Missing worker configuration | 500 | `{"error":"CONFIG_ERROR"}` |
| Resolver returns 409/410 (already used/expired session) | 410 | `{"error":"RESOLVE_REJECTED"}` |
| Resolver returns 429 | 429 | `{"error":"RESOLVE_REJECTED"}` |
| Resolver returns other 4xx or token/session mismatch | 403 | `{"error":"RESOLVE_REJECTED"}` |
| Resolver transport error, 5xx, or malformed response | 502 | `{"error":"RESOLVE_UNAVAILABLE"}` / `{"error":"RESOLVE_BAD_RESPONSE"}` |
| Drive transport error / non-2xx | 502 | `{"error":"DRIVE_FAILED"}` |
| Byte count or SHA-256 mismatch | 502 | `{"error":"SIZE_MISMATCH"}` / `{"error":"CHECKSUM_MISMATCH"}` |
| Unexpected error | 500 | `{"error":"INTERNAL"}` |

Once a response has started streaming, transport-level failures terminate the
body; no completion callback is sent.

## 8. Browser CSP

`src/middleware.ts` adds the **full configured `DOWNLOAD_SERVICE_URL` origin**
(scheme, host and port) to `connect-src`. The old `https://${host}` construction
broke local `http://localhost:8787` workers. Keep `upgrade-insecure-requests`
production-only; all other security headers and dev behavior are unchanged.

## 9. Logging

Worker logs contain only stable error codes and the token nonce `n`. No token,
signature, shared secret, per-file `access_token`, resolver response body,
Drive URL, filename, or file bytes are ever logged or returned in an error
response. Cloudflare observability is enabled for operations, so configure
Workers Logs secret redaction for the `token` query parameter and for the
`x-internal-secret` / `Authorization` headers; otherwise the platform's own
request log would include the token URL.

## 10. Local development

```bash
cp workers/download/.dev.vars.example workers/download/.dev.vars
# edit .dev.vars with the real shared secret and app origin
cd workers/download
npx wrangler dev        # http://localhost:8787
npm test                # deterministic token / ZIP / callback tests
npm run typecheck
```

Set the app's `DOWNLOAD_SERVICE_URL=http://localhost:8787` so `connect-src`
matches the local worker origin.
