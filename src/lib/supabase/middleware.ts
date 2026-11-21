import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from './types';

const ADMIN_PREFIXES = ['/admin'];
const SELLER_PREFIXES = ['/seller'];
const BUYER_PREFIXES = ['/account'];
const MFA_WHITELIST = [
  '/verify-mfa',
  '/api/auth/mfa',
  '/login',
  '/register',
  '/auth/callback',
];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: do not add logic between createServerClient and auth.getUser()
  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;

  // 1) Unauthenticated users trying to reach protected routes
  const isProtected =
    ADMIN_PREFIXES.some(p => pathname.startsWith(p)) ||
    SELLER_PREFIXES.some(p => pathname.startsWith(p)) ||
    BUYER_PREFIXES.some(p => pathname.startsWith(p));

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (!user) return supabaseResponse;

  // 2) Fetch profile (account_type, status, mfa)
  const { data: profile } = await supabase
    .from('profiles')
    .select('account_type, status, mfa_enabled, mfa_enforced')
    .eq('id', user.id)
    .single();

  if (!profile || profile.status !== 'active') {
    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('reason', 'inactive');
    return NextResponse.redirect(url);
  }

  // 3) 2FA enforcement — full block for admin/staff if not enabled
  const needsMfa =
    (profile.mfa_enforced || profile.account_type === 'staff') &&
    !profile.mfa_enabled;

  if (needsMfa && !MFA_WHITELIST.some(p => pathname.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = '/verify-mfa';
    return NextResponse.redirect(url);
  }

  // 4) Role-based route guards
  const isAdminRoute = ADMIN_PREFIXES.some(p => pathname.startsWith(p));
  const isSellerRoute = SELLER_PREFIXES.some(p => pathname.startsWith(p));
  const isBuyerRoute = BUYER_PREFIXES.some(p => pathname.startsWith(p));

  // Admin routes: require staff/admin/super_admin (checked via RLS later)
  if (isAdminRoute) {
    const { data: membership } = await supabase
      .from('store_members')
      .select('role_id, roles!inner(code)')
      .eq('profile_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (!membership) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
  }

  // Seller routes: require approved seller
  if (isSellerRoute) {
    const { data: seller } = await supabase
      .from('seller_profiles')
      .select('status')
      .eq('profile_id', user.id)
      .maybeSingle();

    if (!seller || seller.status !== 'approved') {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      url.searchParams.set('reason', 'seller_pending');
      return NextResponse.redirect(url);
    }
  }

  // Buyer routes: any authenticated user is fine
  void isBuyerRoute;

  return supabaseResponse;
}