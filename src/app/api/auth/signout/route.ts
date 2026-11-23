import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { MFA_COOKIE, clearMfaCookieOptions } from '@/lib/auth/mfa-session';
import { assertSameOrigin } from '@/lib/security/origin';

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
  } catch {
    return NextResponse.json({ error: 'CSRF_INVALID_ORIGIN' }, { status: 403 });
  }

  const db = await createClient();
  await db.auth.signOut({ scope: 'local' });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(MFA_COOKIE, '', clearMfaCookieOptions());
  return res;
}
