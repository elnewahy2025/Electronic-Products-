import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/lib/supabase/types';

const ADMIN_PREFIXES = ['/admin'];
const SELLER_PREFIXES = ['/seller'];
const BUYER_PREFIXES = ['/account'];
const MFA_WHITELIST = ['/verify-mfa', '/api/auth/mfa', '/login', '/register', '/auth/callback'];

// ─── CSP builder ─────────────────────────────────────────
function buildCsp(nonce: string, isDev: boolean): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const supabaseHost = supabaseUrl ? new URL(supabaseUrl).host : '';
  const supabaseWs = supabaseHost ? `wss://${supabaseHost}` : '';

  const downloadServiceUrl = process.env.DOWNLOAD_SERVICE_URL ?? '';
  const downloadServiceHost = downloadServiceUrl
    ? new URL(downloadServiceUrl).host
    : '';

  const scriptSrc = isDev
    ? `'self' 'unsafe-eval' 'nonce-${nonce}' 'strict-dynamic'`
    : `'self' 'nonce-${nonce}' 'strict-dynamic'`;

  const connectSrc = [
    "'self'",
    supabaseUrl,
    supabaseWs,
    'https://*.supabase.co',
    'wss://*.supabase.co',
    'https://www.googleapis.com',
    'https://oauth2.googleapis.com',
    'https://accounts.google.com',
    downloadServiceUrl ? `https://${downloadServiceHost}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const imgSrc = [
    "'self'",
    'data:',
    'blob:',
    'https://*.supabase.co',
    'https://*.googleusercontent.com',
    'https://www.googleapis.com',
    // Cover images can point to arbitrary CDNs — this is intentionally broad.
    // Tighten to specific domains if you restrict sellers to upload to your bucket.
    'https:',
  ].join(' ');

  const directives = [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    // Tailwind + Next.js inline styles require 'unsafe-inline' for style-src.
    // This cannot be avoided without a significant build pipeline change.
    `style-src 'self' 'unsafe-inline'`,
    `img-src ${imgSrc}`,
    `font-src 'self' data:`,
    `connect-src ${connectSrc}`,
    `media-src 'self' https://*.supabase.co blob: data:`,
    `frame-src 'self' https://accounts.google.com`,
    `frame-ancestors 'none'`,
    `form-action 'self' https://accounts.google.com`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `worker-src 'self' blob:`,
    `manifest-src 'self'`,
    `upgrade-insecure-requests`,
  ];

  if (process.env.CSP_REPORT_URI) {
    directives.push(`report-uri ${process.env.CSP_REPORT_URI}`);
    directives.push(`report-to csp-endpoint`);
  }

  return directives.join('; ');
}

// ─── Main middleware ─────────────────────────────────────
export async function middleware(request: NextRequest) {
  // 1. Generate nonce
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const isDev = process.env.NODE_ENV !== 'production';
  const csp = buildCsp(nonce, isDev);

  // 2. Clone request headers to inject x-nonce
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);

  // 3. Prepare base response
  let response = NextResponse.next({ request: { headers: requestHeaders } });

  // 4. Supabase session handling (existing logic)
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;

  // 5. Route guards
  const isProtected =
    ADMIN_PREFIXES.some(p => pathname.startsWith(p)) ||
    SELLER_PREFIXES.some(p => pathname.startsWith(p)) ||
    BUYER_PREFIXES.some(p => pathname.startsWith(p));

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return redirectWithCsp(url, csp);
  }

  if (user) {
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
      return redirectWithCsp(url, csp);
    }

    const needsMfa =
      (profile.mfa_enforced || profile.account_type === 'staff') &&
      !profile.mfa_enabled;

    if (needsMfa && !MFA_WHITELIST.some(p => pathname.startsWith(p))) {
      const url = request.nextUrl.clone();
      url.pathname = '/verify-mfa';
      return redirectWithCsp(url, csp);
    }

    const isAdminRoute = ADMIN_PREFIXES.some(p => pathname.startsWith(p));
    const isSellerRoute = SELLER_PREFIXES.some(p => pathname.startsWith(p));

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
        return redirectWithCsp(url, csp);
      }
    }

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
        return redirectWithCsp(url, csp);
      }
    }
  }

  // 6. Attach security headers to the final response
  applySecurityHeaders(response, csp);
  return response;
}

// ─── Helpers ─────────────────────────────────────────────
function applySecurityHeaders(response: NextResponse, csp: string) {
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), interest-cohort=()'
  );
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none');
  response.headers.set('X-DNS-Prefetch-Control', 'on');

  // HSTS only in production (localhost would break dev over HTTP)
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload'
    );
  }
}

function redirectWithCsp(url: URL, csp: string): NextResponse {
  const res = NextResponse.redirect(url);
  applySecurityHeaders(res, csp);
  return res;
}

export const config = {
  matcher: [
    /*
     * Match everything except:
     *  - _next/static, _next/image (framework assets)
     *  - favicon.ico, robots.txt, sitemap.xml
     *  - static image/font files
     *  - API routes (no HTML served, headers harmless but skip anyway)
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|api/.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf)$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf)$).*)',
  ],
};
