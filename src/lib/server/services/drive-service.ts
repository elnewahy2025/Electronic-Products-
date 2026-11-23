import 'server-only';

export type ResolvedFile = {
  driveUrl: string;
  filename: string;
  mime: string;
  sizeBytes: number;
  /** Short-lived OAuth bearer token for the internal download worker only. */
  accessToken: string;
  /** Set only when the stored checksum is a real SHA-256 hex digest. */
  expectedSha256: string | null;
};

/**
 * Resolves a short-lived (<=15 min) Google Drive download URL for a given
 * file_version_id. Must NOT be exposed to the client — only called server-side
 * by the internal resolver endpoint that the download service hits.
 */
export async function resolveDriveUrl(fileVersionId: string): Promise<ResolvedFile> {
  // Implementation depends on chosen auth model.
  // Minimal version: use a pre-registered service account with folder access.
  // Extended version: decrypt seller's refresh_token, refresh it, get file metadata.

  const { google } = await import('googleapis');
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const { decrypt } = await import('@/lib/crypto/encryption');

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('file_versions')
    .select(`
      id, mime, extension, size_bytes, checksum_sha256,
      files!inner(original_name, seller_id),
      file_storage_locations!inner(
        provider_file_id,
        seller_drive_account_id,
        seller_drive_accounts!inner(encrypted_refresh_token)
      )
    `)
    .eq('id', fileVersionId)
    .single();

  if (error || !data) throw new Error('FILE_NOT_FOUND');

  const loc = (data as any).file_storage_locations;
  const sellerDrive = loc?.seller_drive_accounts;
  if (!loc?.provider_file_id || !sellerDrive?.encrypted_refresh_token) {
    throw new Error('DRIVE_NOT_CONFIGURED');
  }

  const refreshToken = decrypt(sellerDrive.encrypted_refresh_token);

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  // Google Drive direct download URL (valid for ~1 hour with credentials)
  // We give the download service a one-time access: either a signed URL from
  // GCS (if mirrored) OR the download service authenticates with the same
  // refresh token via our resolve endpoint.
  //
  // The internal resolver returns the Drive alt=media URL together with this
  // short-lived bearer token. It never reaches the browser and is never logged.
  const accessTokenResp = await oauth2Client.getAccessToken();
  const accessToken = accessTokenResp.token;
  if (!accessToken) throw new Error('DRIVE_TOKEN_FAILED');

  const storedChecksum = typeof data.checksum_sha256 === 'string'
    ? data.checksum_sha256.toLowerCase()
    : null;
  const expectedSha256 = storedChecksum && /^[a-f0-9]{64}$/.test(storedChecksum)
    ? storedChecksum
    : null;

  return {
    driveUrl: `https://www.googleapis.com/drive/v3/files/${loc.provider_file_id}?alt=media`,
    filename: (data as any).files.original_name,
    mime: data.mime ?? 'application/octet-stream',
    sizeBytes: Number(data.size_bytes ?? 0),
    accessToken,
    expectedSha256,
  };
}