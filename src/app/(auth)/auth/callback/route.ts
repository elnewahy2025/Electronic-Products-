import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { MFA_COOKIE, clearMfaCookieOptions } from '@/lib/auth/mfa-session';

function getSafeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as
    | 'signup'
    | 'invite'
    | 'magiclink'
    | 'recovery'
    | 'email_change'
    | 'email'
    | null;
  const next = getSafeNext(searchParams.get('next'));

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(`${origin}/login?reason=exchange_failed`);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return NextResponse.redirect(`${origin}/login?reason=exchange_failed`);
  } else {
    return NextResponse.redirect(`${origin}/login?reason=no_code`);
  }

  // Post-login route decision. A fresh password/OAuth session is aal1:
  // clear any MFA token from a previous login and route through the
  // challenge when policy requires it.
  const clearMfa = (res: NextResponse) => {
    res.cookies.set(MFA_COOKIE, '', clearMfaCookieOptions());
    return res;
  };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return clearMfa(NextResponse.redirect(`${origin}/login`));

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_type, mfa_enforced, mfa_enabled')
    .eq('id', user.id)
    .single();

  const target =
    profile?.account_type === 'seller' ? '/seller'
      : profile?.account_type === 'staff' ? '/admin'
        : '/account';

  const destination = next !== '/' ? next : target;

  const mfaRequired = Boolean(
    profile?.mfa_enforced || profile?.mfa_enabled || profile?.account_type === 'staff'
  );
  if (mfaRequired) {
    return clearMfa(
      NextResponse.redirect(`${origin}/verify-mfa?next=${encodeURIComponent(destination)}`)
    );
  }

  return clearMfa(NextResponse.redirect(`${origin}${destination}`));
}
