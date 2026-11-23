import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { buildDriveAuthUrl } from '@/lib/drive/oauth';
import { enforceSellerThrottle } from '@/lib/security/seller-throttle';

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch (e: any) {
    const status = e?.message === 'UNAUTHENTICATED' ? 401 : 403;
    return NextResponse.json({ error: status === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN' }, { status });
  }
  if (user.accountType !== 'seller') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const throttled = await enforceSellerThrottle({
    req,
    sellerId: user.id,
    scope: 'seller:drive:link',
    sellerLimit: 10,
    ipLimit: 20,
    windowSeconds: 3600,
  });
  if (throttled) return throttled;

  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      {
        error: 'GOOGLE_DRIVE_NOT_CONFIGURED',
        message: 'لم يتم ضبط مفاتيح Google Drive OAuth على مستوى المنصة بعد. يرجى ضبط GOOGLE_DRIVE_CLIENT_ID وGOOGLE_DRIVE_CLIENT_SECRET في متغيرات البيئة.',
      },
      { status: 503 },
    );
  }

  const { url, state } = buildDriveAuthUrl({ sellerId: user.id });
  const res = NextResponse.json({ url });
  // Store state in HttpOnly cookie for CSRF verification on callback
  res.cookies.set('drive_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });
  return res;
}
