# Direct-to-Drive Upload — Flow

## 1. Linking a Drive account
1. Seller visits `/seller/drive-accounts`.
2. Clicks "ربط حساب جديد" → `POST /api/seller/drive/link`.
3. Server builds Google OAuth URL with:
   - `scope=https://www.googleapis.com/auth/drive.file + userinfo.email`
   - `access_type=offline` (to receive a `refresh_token`)
   - `prompt=consent` (to force `refresh_token` on every re-link)
   - `state` signed with HMAC (CSRF protection, expires in 10 min)
4. Seller authenticates with Google → redirected to `/api/seller/drive/callback?code=...&state=...`.
5. Callback verifies `state` (signature + timestamp + cookie match + user id).
6. Exchanges code for tokens, fetches user email, encrypts `refresh_token` with AES-256-GCM, stores in `seller_drive_accounts`.
7. Initial quota fetched via `about.get` and stored.

## 2. Upload flow
```text
Browser                    Next.js Server              Google Drive
  │                              │                          │
  │ POST /api/upload/init        │                          │
  ├─────────────────────────────►│                          │
  │ {name, size, mime, acc?}     │                          │
  │                              │ 1. validate ext + size   │
  │                              │ 2. pick drive account    │
  │                              │ 3. decrypt refresh token │
  │                              │ 4. POST resumable init   │
  │                              ├─────────────────────────►│
  │                              │◄─────────────────────────┤
  │                              │ Location: uploadUrl      │
  │◄─────────────────────────────┤                          │
  │ {sessionId, uploadUrl}       │                          │
  │                              │                          │
  │ PUT uploadUrl (file bytes)   │                          │
  ├─────────────────────────────────────────────────────────►
  │                              │                          │
  │◄─────────────────────────────────────────────────────────
  │ 200 {id: driveFileId, ...}   │                          │
  │                              │                          │
  │ POST /api/upload/complete    │                          │
  ├─────────────────────────────►│                          │
  │ {sessionId, driveFileId}     │                          │
  │                              │ 1. verify Drive metadata │
  │                              ├─────────────────────────►│
  │                              │ 2. create files/fv/stor. │
  │                              │ 3. queue scan job        │
  │                              │ 4. refresh quota         │
  │◄─────────────────────────────┤                          │
  │ {fileVersionId, fileId}      │                          │
```

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
| Google token expired | Server auto-refreshes via `refresh_token`; if revoked, returns `DRIVE_NOT_LINKED` |
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
