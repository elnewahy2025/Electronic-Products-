import { NextRequest, NextResponse } from 'next/server';
import { publicError } from '@/lib/api/errors';
import { requireUser } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { decrypt } from '@/lib/crypto/encryption';
import { ensureStoreFolder } from '@/lib/drive/client';
import { getCachedDriveAccessToken } from '@/lib/drive/token-cache';
import { enforceSellerThrottle } from '@/lib/security/seller-throttle';

/**
 * Returns a short-lived Google OAuth2 access token (drive.file scope) plus
 * the Google Picker API key and GCP App ID so the seller can pick existing
 * files from their linked Google Drive account via the official Google Picker.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (user.accountType !== 'seller') {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
    }

    const throttled = await enforceSellerThrottle({
      req,
      sellerId: user.id,
      scope: 'seller:drive:picker_token',
      sellerLimit: 30,
      ipLimit: 60,
      windowSeconds: 600,
    });
    if (throttled) return throttled;

    const developerKey = process.env.GOOGLE_PICKER_API_KEY;
    const appId = process.env.GOOGLE_PICKER_APP_ID;
    if (!developerKey || !appId) {
      return NextResponse.json({ error: 'GOOGLE_PICKER_NOT_CONFIGURED' }, { status: 503 });
    }

    const requestedAccountId = req.nextUrl.searchParams.get('account_id');
    const admin = createAdminClient();

    let query = admin
      .from('seller_drive_accounts')
      .select('id, google_account_email, encrypted_refresh_token, status, is_default, store_folder_id')
      .eq('seller_id', user.id)
      .eq('status', 'active');

    if (requestedAccountId) {
      query = query.eq('id', requestedAccountId);
    } else {
      query = query.order('is_default', { ascending: false }).order('created_at', { ascending: true });
    }

    const { data: accounts } = await query.limit(1);
    const acc = accounts?.[0];
    if (!acc?.encrypted_refresh_token) {
      return NextResponse.json({ error: 'NO_ACTIVE_DRIVE_ACCOUNT' }, { status: 404 });
    }

    const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: 'GOOGLE_DRIVE_NOT_CONFIGURED' }, { status: 503 });
    }

    const refreshToken = decrypt(acc.encrypted_refresh_token);
    const token = await getCachedDriveAccessToken({
      driveAccountId: acc.id,
      refreshToken,
      clientId,
      clientSecret,
    });

    const mode = req.nextUrl.searchParams.get('mode');
    let storeFolderId: string | null = (acc as any).store_folder_id ?? null;

    // Only auto-create Store folder when opening file picker (not when seller wants to link their existing Store folder)
    if (mode !== 'select_folder' && !storeFolderId) {
      storeFolderId = await ensureStoreFolder(refreshToken, null);
      await admin
        .from('seller_drive_accounts')
        .update({ store_folder_id: storeFolderId } as any)
        .eq('id', acc.id);
    }

    return NextResponse.json({
      accessToken: token,
      developerKey,
      appId,
      driveAccountId: acc.id,
      googleAccountEmail: acc.google_account_email,
      storeFolderId,
    });
  } catch (e: any) {
    const error = publicError(e, 'PICKER_TOKEN_FAILED');
    return NextResponse.json(
      { error },
      { status: error === 'UNAUTHENTICATED' ? 401 : 400 },
    );
  }
}
