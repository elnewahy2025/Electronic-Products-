import 'server-only';
import { google } from 'googleapis';

type CachedToken = {
  accessToken: string;
  expiresAtMs: number;
};

// Cache refreshed Google OAuth2 access tokens per Drive account for 45 minutes
// (Google access tokens live 60 minutes) to avoid redundant token-refresh calls.
const TOKEN_TTL_MS = 45 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;
const tokenCache = new Map<string, CachedToken>();

export async function getCachedDriveAccessToken(params: {
  driveAccountId: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<string> {
  const now = Date.now();
  const cached = tokenCache.get(params.driveAccountId);
  if (cached && cached.expiresAtMs > now) {
    return cached.accessToken;
  }

  const oauth2 = new google.auth.OAuth2(params.clientId, params.clientSecret);
  oauth2.setCredentials({ refresh_token: params.refreshToken });
  const { token } = await oauth2.getAccessToken();
  if (!token) {
    throw new Error('DRIVE_TOKEN_FAILED');
  }

  if (tokenCache.size >= MAX_CACHE_ENTRIES) {
    // Evict oldest entry
    const firstKey = tokenCache.keys().next().value;
    if (firstKey) tokenCache.delete(firstKey);
  }

  tokenCache.set(params.driveAccountId, {
    accessToken: token,
    expiresAtMs: now + TOKEN_TTL_MS,
  });

  return token;
}

export function invalidateCachedDriveAccessToken(driveAccountId: string): void {
  tokenCache.delete(driveAccountId);
}
