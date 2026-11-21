import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildDriveAuthUrl } from '@/lib/drive/oauth';

export async function POST() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

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