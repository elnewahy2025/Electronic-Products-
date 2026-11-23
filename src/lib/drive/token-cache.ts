import 'server-only';
import { google } from 'googleapis';
import { createAdminClient } from '@/lib/supabase/admin';
import { decrypt, encrypt } from '@/lib/crypto/encryption';

// Cache refreshed Google OAuth2 access tokens in PostgreSQL (AES-256-GCM encrypted)
// for 45 minutes (Google access tokens live 60 minutes) so all serverless instances
// share the same token without hammering Google's token-refresh endpoint.
const TOKEN_TTL_MS = 45 * 60 * 1000;
const EXPIRY_BUFFER_MS = 2 * 60 * 1000;

export async function getCachedDriveAccessToken(params: {
  driveAccountId: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<string> {
  const admin = createAdminClient();
  const now = Date.now();

  const { data: row } = await (admin.from('seller_drive_accounts') as any)
    .select('encrypted_access_token, access_token_expires_at')
    .eq('id', params.driveAccountId)
    .maybeSingle();

  if (row?.encrypted_access_token && row?.access_token_expires_at) {
    const expiresAtMs = new Date(row.access_token_expires_at).getTime();
    if (Number.isFinite(expiresAtMs) && expiresAtMs - EXPIRY_BUFFER_MS > now) {
      try {
        return decrypt(row.encrypted_access_token);
      } catch {
        // Corrupt or rotated key — fall through to fresh token fetch
      }
    }
  }

  const oauth2 = new google.auth.OAuth2(params.clientId, params.clientSecret);
  oauth2.setCredentials({ refresh_token: params.refreshToken });
  const { token } = await oauth2.getAccessToken();
  if (!token) {
    throw new Error('DRIVE_TOKEN_FAILED');
  }

  const expiresAtIso = new Date(now + TOKEN_TTL_MS).toISOString();
  await (admin.from('seller_drive_accounts') as any)
    .update({
      encrypted_access_token: encrypt(token),
      access_token_expires_at: expiresAtIso,
    })
    .eq('id', params.driveAccountId);

  return token;
}

export async function invalidateCachedDriveAccessToken(driveAccountId: string): Promise<void> {
  const admin = createAdminClient();
  await (admin.from('seller_drive_accounts') as any)
    .update({
      encrypted_access_token: null,
      access_token_expires_at: null,
    })
    .eq('id', driveAccountId);
}
