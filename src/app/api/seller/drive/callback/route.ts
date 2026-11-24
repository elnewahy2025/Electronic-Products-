import { NextRequest, NextResponse } from 'next/server';
import { publicError } from '@/lib/api/errors';
import { requireUser } from '@/lib/auth/session';
import { exchangeDriveCode, fetchGoogleUserEmail, verifyState } from '@/lib/drive/oauth';
import { linkDriveAccount } from '@/lib/server/services/drive-account-service';

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const cookieState = req.cookies.get('drive_oauth_state')?.value;

  if (!code || !state || state !== cookieState) {
    return NextResponse.redirect(`${origin}/seller/drive-accounts?error=state_mismatch`);
  }

  const verified = verifyState(state);
  if (!verified) {
    return NextResponse.redirect(`${origin}/seller/drive-accounts?error=state_invalid`);
  }

  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.redirect(`${origin}/seller/drive-accounts?error=session_mismatch`);
  }
  if (user.accountType !== 'seller' || user.id !== verified.sellerId) {
    return NextResponse.redirect(`${origin}/seller/drive-accounts?error=session_mismatch`);
  }

  try {
    const tokens = await exchangeDriveCode(code);
    const email = await fetchGoogleUserEmail(tokens.accessToken);
    await linkDriveAccount({
      sellerId: user.id,
      googleEmail: email,
      refreshToken: tokens.refreshToken,
      scope: tokens.scope,
    });
    const res = NextResponse.redirect(`${origin}/seller/drive-accounts?success=linked`);
    res.cookies.delete('drive_oauth_state');
    return res;
  } catch (e: any) {
    // Never reflect provider/PostgREST error text into a redirect URL.
    const reason = encodeURIComponent(publicError(e, 'DRIVE_LINK_FAILED'));
    return NextResponse.redirect(`${origin}/seller/drive-accounts?error=${reason}`);
  }
}