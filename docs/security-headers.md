# Security Headers

Every response is wrapped with security headers set in `middleware.ts` (dynamic)
and `next.config.mjs` (static). The two layers cover HTML pages, redirects,
and static assets.

## Headers applied

| Header | Value | Purpose |
|---|---|---|
| `Content-Security-Policy` | see below | Prevents XSS via inline scripts, unauthorized resource loads |
| `X-Content-Type-Options` | `nosniff` | Blocks MIME-sniffing attacks |
| `X-Frame-Options` | `DENY` | Blocks embedding in iframes (clickjacking) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limits referrer leakage |
| `Permissions-Policy` | (see below) | Disables camera, mic, geolocation, payment, etc. |
| `Cross-Origin-Opener-Policy` | `same-origin` | Isolates browsing context |
| `Cross-Origin-Resource-Policy` | `same-origin` | Prevents other origins from embedding our resources |
| `X-Permitted-Cross-Domain-Policies` | `none` | Blocks Flash/PDF cross-domain policies |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Forces HTTPS for 2 years (production only) |
| `X-DNS-Prefetch-Control` | `on` | Allows DNS prefetch (performance) |
| `X-Powered-By` | (removed) | No version disclosure |

## CSP policy breakdown

### `default-src 'self'`
Fallback for any directive not listed below. Deny external by default.

### `script-src 'self' 'nonce-{nonce}' 'strict-dynamic'`
- `'nonce-{nonce}'` — a fresh base64 nonce per request, generated in middleware.
  All `<Script nonce={nonce}>` and Next.js framework scripts receive it.
- `'strict-dynamic'` — trusted scripts (those with the nonce) can dynamically
  load additional scripts. This makes `'self'` irrelevant for scripts (as
  designed by the spec), but keeps compat with older browsers that ignore it.
- `'unsafe-eval'` in **development only** (React Fast Refresh).

### `style-src 'self' 'unsafe-inline'`
Tailwind and Next.js inject inline `<style>` blocks. Removing `'unsafe-inline'`
would require switching to CSS files + CSS modules, which breaks the current
design system. This is the one accepted relaxation.

### `img-src 'self' data: blob: {supabaseUrl} https://*.supabase.co https://*.googleusercontent.com https://www.googleapis.com`
- `data:` — QR codes (MFA setup)
- `blob:` — client-side image previews before upload
- `{supabaseUrl}` / `https://*.supabase.co` — Supabase Storage buckets (`previews` and `product-images`)
- `https://*.googleusercontent.com` — user avatars from Google
- `https://www.googleapis.com` — Drive thumbnails (if used)
- Broad `https:` wildcard has been **removed** (Migration `034_product_images_storage.sql`) now that sellers upload product cover & gallery images directly to Supabase Storage (`product-images`) with server-side `sharp` WebP conversion.

### `connect-src 'self' {supabase} wss://{supabase} ...Google OAuth... {download service}`
Allows API calls to:
- Our app (`'self'`)
- Supabase REST + Realtime (`wss://`)
- Google OAuth token exchange
- The external download service (from `DOWNLOAD_SERVICE_URL`)

### `media-src 'self' https://*.supabase.co blob: data:`
For `<video>` and `<audio>` playback of previews.

### `frame-src 'self' https://accounts.google.com`
Google OAuth modal only.

### `frame-ancestors 'none'`
Redundant with `X-Frame-Options: DENY` but CSP-native (preferred).

### `form-action 'self' https://accounts.google.com`
Form submissions can only target us or Google OAuth.

### `base-uri 'self'`
Prevents `<base href>` injection.

### `object-src 'none'`
Blocks Flash/Java/embed plugins.

### `worker-src 'self' blob:`
Service workers (if added) must be same-origin.

### `upgrade-insecure-requests`
Rewrites http:// subresources to https://.

## Development vs production

- **Dev** (`NODE_ENV != production`): `script-src` includes `'unsafe-eval'`
  for React Fast Refresh. HSTS is disabled (breaks localhost).
- **Production**: strict CSP, HSTS with `preload`.

## Reporting

Set `CSP_REPORT_URI=/api/csp-report` in env to enable violation reporting.
The endpoint logs to stdout. In production, forward these to Sentry/Datadog/CloudWatch.

Reports are essential to catch misconfigurations before users do. Monitor
`[csp-report]` logs after each deploy that touches third-party integrations.

## Testing

### Manual: verify headers on a response
```bash
curl -sI https://your-domain.com | grep -E "Content-Security|Strict-Transport|X-Frame|Referrer|Permissions"
```

### Verify nonce matches between HTML and header
```bash
curl -s https://your-domain.com | grep -o 'nonce="[^"]*"' | head -3
curl -sI https://your-domain.com | grep -o "'nonce-[^']*'"
```
Both should show the same base64 string.

### Automated: Playwright
```typescript
test('CSP header present and nonce matches inline scripts', async ({ page }) => {
  const response = await page.goto('/');
  const csp = response?.headers()['content-security-policy'] ?? '';
  expect(csp).toContain("default-src 'self'");
  expect(csp).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
  expect(csp).toContain("frame-ancestors 'none'");
});
```

## Common issues & fixes

| Symptom | Cause | Fix |
|---|---|---|
| Blank page in production | Scripts blocked by CSP | Check console for `Refused to execute script`. Ensure `x-nonce` is passed through middleware. |
| Images from seller CDN blocked | `img-src` too tight | Add domain or use `https:` (broad). |
| Supabase Realtime disconnected | Missing `wss://` in `connect-src` | Already included via `wss://{supabaseHost}`. |
| Google OAuth iframe blank | `frame-src` missing | Already includes `accounts.google.com`. |
| PDF in `<object>` blocked | `object-src 'none'` | Use `<iframe>` + `frame-src`, or download via fetch. |
| Fonts from Google Fonts fail | `font-src` restrictive | We use `next/font` (self-hosted at build time) → no issue. |
| Inline `<style>` blocked | `style-src` missing `'unsafe-inline'` | Tailwind requires it. Documented above. |

## What is NOT covered

- **HTTP → HTTPS redirect**: must be handled at the edge (Vercel does this
  automatically; or configure nginx/Cloudflare).
- **Cookie flags**: set per-cookie via Supabase + our own (`httpOnly`, `secure`,
  `sameSite`).
- **Subresource Integrity (SRI)**: relevant only for external scripts; we don't
  load any.
- **Certificate Transparency reporting**: out of scope.
- **Trusted Types**: not yet enforced; consider adding
  `require-trusted-types-for 'script'` in a future iteration.

## Maintenance

After adding a new external service:
1. Add its domains to `connect-src` (for XHR/fetch) or `img-src` (for images).
2. Add it to `frame-src` if embedded.
3. Deploy to staging first, watch for CSP violations.
4. Promote to production.

After upgrading Next.js:
1. Re-run the nonce test above — the framework's nonce handling has changed
   between versions.
2. Check that `experimental` flags used here are still supported.
