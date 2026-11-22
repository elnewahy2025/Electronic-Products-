import 'server-only';
import { google } from 'googleapis';

/**
 * Initiate a Google Drive resumable upload session.
 * Returns the session URI that the client uses to PUT file bytes directly to Google.
 * The file never passes through our servers.
 */
export async function initiateResumableUpload(params: {
  refreshToken: string;
  filename: string;
  mime: string;
  size: number;
  folderId?: string;
  origin?: string;
}): Promise<{ uploadUrl: string }> {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2.setCredentials({ refresh_token: params.refreshToken });
  const { token: accessToken } = await oauth2.getAccessToken();
  if (!accessToken) throw new Error('DRIVE_TOKEN_FAILED');

  const metadata: Record<string, unknown> = {
    name: params.filename,
    mimeType: params.mime,
  };
  if (params.folderId) metadata.parents = [params.folderId];

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json; charset=UTF-8',
    'X-Upload-Content-Type': params.mime,
    'X-Upload-Content-Length': String(params.size),
  };
  const origin = params.origin || process.env.NEXT_PUBLIC_APP_URL;
  if (origin) {
    headers.Origin = origin;
  }

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true',
    {
      method: 'POST',
      headers,
      body: JSON.stringify(metadata),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DRIVE_INIT_FAILED: ${res.status} ${text}`);
  }

  const location = res.headers.get('location');
  if (!location) throw new Error('DRIVE_INIT_NO_LOCATION');

  return { uploadUrl: location };
}

/**
 * Query the upload status with Google to resume after network errors.
 * Uses `Content-Range: bytes * / *` with empty body.
 */
export async function checkResumableUploadStatus(uploadUrl: string): Promise<{
  done: boolean;
  bytesReceived: number;
  driveFileId?: string;
}> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Range': 'bytes */*',
      'Content-Length': '0',
    },
  });

  if (res.status === 308) {
    const range = res.headers.get('range'); // e.g. "bytes=0-1234"
    const bytesReceived = range ? parseInt(range.split('-')[1], 10) + 1 : 0;
    return { done: false, bytesReceived };
  }

  if (res.status === 200 || res.status === 201) {
    const data = await res.json();
    return { done: true, bytesReceived: Number(data.size ?? 0), driveFileId: data.id };
  }

  throw new Error(`UPLOAD_STATUS_FAILED: ${res.status}`);
}