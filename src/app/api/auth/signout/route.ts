import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { MFA_COOKIE, clearMfaCookieOptions } from '@/lib/auth/mfa-session';

export async function POST() {
  const db = await createClient();
  await db.auth.signOut({ scope: 'local' });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(MFA_COOKIE, '', clearMfaCookieOptions());
  return res;
}
