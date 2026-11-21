import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (!code) return NextResponse.redirect(`${origin}/login?reason=no_code`);

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/login?reason=exchange_failed`);

  // Post-login route decision (MFA handled by middleware)
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_type, mfa_enforced, mfa_enabled')
    .eq('id', user.id)
    .single();

  if (profile?.mfa_enforced && !profile?.mfa_enabled) {
    return NextResponse.redirect(`${origin}/verify-mfa`);
  }

  const target =
    profile?.account_type === 'seller' ? '/seller'
    : profile?.account_type === 'staff' ? '/admin'
    : '/account';

  return NextResponse.redirect(`${origin}${next !== '/' ? next : target}`);
}