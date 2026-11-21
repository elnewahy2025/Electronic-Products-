# Direct-to-Drive Upload — Flow

## 1. Linking a Drive account
1. Seller visits `/seller/drive-accounts`.
2. Clicks "ربط حساب جديد" → `POST /api/seller/drive/link`.
3. Server builds Google OAuth URL with:
   - `scope=https://www.googleapis.com/auth/drive.file + userinfo.email`
   - `access_type=offline` (to receive a refresh_token)
   - `prompt=consent` (to force refresh_token on every re-link)
   - `state` signed with HMAC (CSRF protection, expires in 10 min)
4. Seller authenticates with Google → redirected to `/api/seller/drive/callback?code=...&state=...`.
5. Callback verifies `state` (signature + timestamp + cookie match + user id).
6. Exchanges code for tokens, fetches user email, encrypts `refresh_token` with AES-256-GCM, stores in `seller_drive_accounts`.
7. Initial quota fetched via `about.get` and stored.

## 2. Upload flow
1. Seller selects file in `/seller/upload`.
2. Client calls `POST /api/upload/init` with `{ original_name, mime, size, checksum, drive_account_id }`.
3. Server validates extension against `allowed_file_types`, picks an active Drive account with sufficient quota, initiates a Google Drive resumable upload session, and returns `{ sessionId, uploadUrl }`.
4. Client uploads file bytes directly to `uploadUrl` via `PUT`.
5. On completion, client calls `POST /api/upload/complete` with `{ session_id, drive_file_id }`.

**Key security property:** The file bytes never touch our server. Only Google sees them.

## 3. Resume after network failure
1. Client detects upload failure (XHR `onerror`).
2. Client calls `GET /api/upload/[sessionId]/status`.
3. Server queries Google with `Content-Range: bytes */*` → returns 308 + `Range` header showing bytes received.
4. Client sends `PUT uploadUrl` with `Content-Range: bytes {start}-{end-1}/{total}` + remaining bytes.
5. Continues until complete.

## 4. Quota management
- After every successful upload, server calls `about.get` and updates `quota_total`/`quota_used`.
- Function `update_drive_quota` flips status to `quota_exceeded` when <1% remaining, and back to `active` when >5%.
- Before each upload, `pick_drive_account` filters out accounts with insufficient space.

## 5. Failure handling
| Failure | Result |
|---|---|
| No active Drive account | `init` returns 409 `NO_DRIVE_ACCOUNT` |
| Quota insufficient | `init` returns 507 `DRIVE_QUOTA_EXCEEDED` |
| Google token expired | Server auto-refreshes via refresh_token; if revoked, returns `DRIVE_NOT_LINKED` |
| Network drop mid-upload | Client resumes via status endpoint |
| Drive file doesn't exist at complete | `complete` returns `DRIVE_FILE_NOT_FOUND` |
| File rejected by scan later | `scan_jobs` status = `failed`, file moved to `quarantined` |

## 6. What NOT to do
- **Do NOT** store the upload URL long-term. It's cleared on completion.
- **Do NOT** expose `provider_file_id` or `provider_upload_url` to anyone except the owning seller during an active session.
- **Do NOT** trust the client's reported file size at complete; verify with Drive metadata.
- **Do NOT** allow uploads when `allowed_file_types` doesn't include the extension.

## 7. Future: bringing existing Drive files
The current scope (`drive.file`) only allows files created by this app.
To allow linking pre-existing seller files, switch to `drive.readonly` + implement
Google Picker for selection. This is out of scope for phase 1.
