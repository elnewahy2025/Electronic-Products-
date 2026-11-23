# Screening & Preview Pipeline

> **Scope:** The `scan_jobs` pipeline performs **file type/signature screening**,
> not malware scanning. It checks the first 8 KiB against known magic bytes and
> the seller-declared extension. It does not run an antivirus engine, download
> whole objects, or expand archives. See `docs/file-screening-risk.md`.

## 1. Trigger
When a seller completes an upload (`/api/upload/complete`), the server:
1. Creates `files`, `file_storage_locations`, `file_versions` rows.
2. Inserts a `scan_jobs` row with `status='queued'`.

Nothing is visible to visitors until `file_versions.scan_status = 'ready'`.

## 2. Screening worker (daily cron)
`POST /api/internal/worker/scan` (Bearer `CRON_SECRET`, fallback `WORKER_SECRET`) **or** Vercel cron
calls `/api/internal/worker/scan-cron`. Both verify the same Bearer secret;
`x-vercel-cron: 1` is spoofable and is no longer accepted.

For each claimed job (max 3):
1. `claim_scan_jobs` atomically marks jobs `running`.
2. Download first 8 KB from Google Drive (ranged request).
3. `detectFileType` parses magic numbers → real ext/mime.
4. `isCompatibleWithExtension` compares to the seller's claimed extension.
5. **Pass** → `complete_scan_pass`:
   - `scan_jobs.status = 'passed'`
   - `file_versions.scan_status = 'processing'`
   - `file_previews` row created with `status='pending'`
   - Seller receives `file_scan_passed` notification.
6. **Fail** → `quarantine_file(reason)`:
   - `scan_jobs.status = 'failed'`
   - `file_versions.scan_status = 'quarantined'`
   - `quarantine_records` row created
   - Seller receives `file_quarantined` notification.

## 3. Preview worker (cron every 5 min)
`POST /api/internal/worker/preview` **or** `/api/internal/worker/preview-cron` (Bearer `CRON_SECRET`, fallback `WORKER_SECRET`).

For each claimed job (max 2):
1. `claim_preview_jobs` marks `pending → generating`.
2. Fetch seller's Drive refresh token, decrypt.
3. Based on the file extension:
   - **Images** (png, jpg, webp, gif): download full, resize to max 1400px,
     apply diagonal text watermark, upload to Supabase Storage `previews/`,
     call `finalize_preview` → `scan_status='ready'`.
   - **PDFs**: render first page with `pdf-to-img`, resize, watermark,
     upload, `finalize_preview`.
   - **Video / Office / ZIP**: generate a placeholder poster with the file
     extension + "معاينة غير متاحة بعد" + watermark. Full video watermarking
     requires ffmpeg and is deferred to a dedicated service.
4. On failure: `fail_preview(reason)`.

## 4. Watermark
Source: `watermark_settings.text_template` with `{platform_name}` replaced
by `general_settings.platform_name`.

Applied via `sharp` compositing an SVG text layer:
- Direction: `diagonal` (-35°) or `horizontal`
- Opacity: low (0.12) / medium (0.22) / high (0.35)
- Repeated in a grid pattern (step = ~40% of width/height)
- Double stroke for readability on any background

## 5. Quarantine lifecycle
- File is quarantined → seller notified → seller can contact support.
- Admin views list at `/admin/quarantine`.
- **Release** (requires `file.quarantine` permission): calls
  `release_from_quarantine(reason)` → status back to `processing` + preview job.
- **Permanent delete** (requires `file.delete` permission): refuses if the file
  is referenced by a `product_version`. Deletes from Drive (best-effort) and marks
  `scan_status='deleted'`.

## 6. Extending to malware scanning (ClamAV, VirusTotal)
Current behavior is type screening only. Adding real malware scanning requires an
isolated full-object scan with bounded size/time and archive expansion limits:
- Download the complete object (not just the first 8 KiB) into an isolated worker.
- Extract archives with file-count/size/depth limits; reject bombs and encrypted archives.
- Set `scan_jobs.engine` (for example `'clamav'`) and store the verdict in `scan_jobs.result` (JSONB).
- Quarantine on scanner error, timeout, or positive verdict — never fail open.
This is an external-service/product decision; it is not implemented by this pipeline.

## 7. What's NOT covered (Phase 2)
- **Video watermarking with ffmpeg**: needs a dedicated worker (Lambda, Cloudflare
  Workers with WASM, or a small VPS). The contract is:
  - `POST {VIDEO_PROCESSOR_URL}/watermark` with `{ drive_url, text, style }`
  - Returns `{ output_url, duration_seconds }`
  - Server uploads the output to previews bucket.
- **Docx/xlsx/pptx previews**: use LibreOffice headless in a worker container.
- **Advanced malware scanning**: ClamAV / VirusTotal integration.

## 8. Environment variables required
- `WORKER_SECRET` — bearer token for internal worker endpoints
- `SUPABASE_PREVIEWS_BUCKET` — name of the Supabase Storage bucket (default `previews`)
- (Phase 2) `VIDEO_PROCESSOR_URL` and `VIDEO_PROCESSOR_TOKEN`

## 9. Supabase Storage setup
Create the bucket once:
```sql
-- In Supabase Dashboard → Storage → New bucket: "previews" (public)
-- Or via CLI:
-- supabase storage create-bucket previews --public
```

RLS policy on the bucket:
- **Public read** (anyone can view previews).
- **No public write** (only `service_role` via worker).

## 10. Cron scheduling
`vercel.json`:
- `scan-cron` daily
- `preview-cron` daily

On Hobby plan, cron runs once per day only — use a free external cron
(cron-job.org) hitting the `/api/internal/worker/*` endpoints with the
`Authorization: Bearer` header instead.
