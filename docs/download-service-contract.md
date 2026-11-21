# Download Service — Contract

The Next.js app delegates all large file streaming to an external download service.
The service is responsible for:
1. Validating the signed token (HMAC via DOWNLOAD_SERVICE_TOKEN).
2. Requesting the resolve endpoint to obtain short-lived Drive URLs.
3. Streaming the file(s) or a ZIP to the client.
4. Calling the completion endpoint on success or failure.

## Environment (on download service)
- DOWNLOAD_SERVICE_TOKEN — shared secret with Next.js app
- APP_INTERNAL_URL — base URL of the Next.js app

## 1. Stream endpoint (client-facing)
GET {DOWNLOAD_SERVICE_URL}/stream?token=XXX

Behavior:
1. Verify token signature locally (HMAC-SHA256 with DOWNLOAD_SERVICE_TOKEN).
2. If valid and not expired:
   a. POST to `{APP_INTERNAL_URL}/api/internal/resolve-token` with:
      - Header: `x-internal-secret: {DOWNLOAD_SERVICE_TOKEN}`
      - Body: `{ "token": "XXX" }`
   b. Receive: `{ type, files: [{ file_version_id, drive_url, filename, mime, size_bytes }] }`
   c. For ZIP: create a ZIP stream in-memory or streaming (adm-zip, yazl).
   d. Stream the result to the client with proper Content-Disposition.
3. On successful completion:
   POST to `{APP_INTERNAL_URL}/api/download/{sessionId}/complete`:
   - Header: `x-internal-secret: {DOWNLOAD_SERVICE_TOKEN}`
   - Body: `{ "token": "XXX", "files": [{ "file_version_id": "...", "bytes_sent": 1234, "checksum": "sha256" }] }`

4. On failure (client disconnect, Drive error, etc.):
   - Do NOT call complete.
   - Log the failure with the token's `n` (nonce).

## 2. Failure modes
- Drive URL expired (>15 min): request a new token (client re-initiates).
- Session expired server-side: complete endpoint returns 410; client sees message.
- Attempts exhausted: init endpoint returns 409 before token is issued.
- File already delivered: init endpoint returns 409.

## 3. Reference implementation (Cloudflare Worker)
- Read token → verify HMAC → call resolve-token → fetch each Drive URL
  (auth via Bearer access_token embedded in the drive_url response) →
  stream (single) or build ZIP using fflate →
  on end, POST completion.
- No file ever passes through Vercel.