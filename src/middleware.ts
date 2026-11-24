import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { asTypedSupabaseClient } from '@/lib/supabase/types';
import { MFA_COOKIE, readMfaSessionToken, sessionIdFromJwt } from '@/lib/auth/mfa-session';
import { THEME_INIT_SCRIPT_HASH } from '@/lib/theme-init';
import { assertSameOrigin } from '@/lib/security/origin';

const ADMIN_PREFIXES = ['/admin'];
const SELLER_PREFIXES = ['/seller'];
const BUYER_PREFIXES = ['/account'];

// Machine-to-machine routes authenticate with bearer/webhook secrets or are
// browser navigations protected by their own signed state; they are not
// cookie-authenticated mutations and must stay outside the CSRF guard.
const CSRF_EXEMPT_API_PREFIXES = ['/api/internal/'];
const CSRF_EXEMPT_API_PATHS = new Set([
  '/api/csp-report',
  '/api/seller/drive/callback',
]);

function isCsrfExemptApiRoute(pathname: string): boolean {
  return (
    CSRF_EXEMPT_API_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    CSRF_EXEMPT_API_PATHS.has(pathname) ||
    /^\/api\/download\/[^/]+\/complete$/.test(pathname)
  );
}

const MFA_WHITELIST = [
  '/verify-mfa',
  '/api/auth/login',
  '/api/auth/oauth',
  '/api/auth/forgot-password',
  '/api/auth/mfa',
  '/api/auth/signout',
  '/api/csp-report',
  '/login',
  '/register',
  '/auth/callback',
  '/forgot-password',
  '/reset-password',
  '/offline',
  // Framework/static assets must never be redirected through the MFA gate,
  // otherwise the challenge page itself cannot load its JS/CSS.
  '/_next',
  '/favicon.ico',
  '/manifest.webmanifest',
  '/sw.js',
];

function safeOrigin(raw: string | undefined, httpsOnly = false): string {
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (httpsOnly && parsed.protocol !== 'https:') return '';
    return parsed.origin;
  } catch {
    return '';
  }
}

// ─── CSP builder (single canonical source) ────────────────
function buildCsp(nonce: string, isDev: boolean): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  let supabaseWs = '';
  try {
    if (supabaseUrl) supabaseWs = `wss://${new URL(supabaseUrl).host}`;
  } catch {
    supabaseWs = '';
  }

  const downloadOrigin = safeOrigin(process.env.DOWNLOAD_SERVICE_URL);
  const sentryOrigin = safeOrigin(process.env.NEXT_PUBLIC_SENTRY_DSN, true);
  const hasTurnstile = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

  const scriptSrc = [
    "'self'",
    ...(isDev ? ["'unsafe-eval'"] : []),
    `'nonce-${nonce}'`,
    `'${THEME_INIT_SCRIPT_HASH}'`,
    "'strict-dynamic'",
    ...(hasTurnstile ? ['https://challenges.cloudflare.com'] : []),
  ].join(' ');

  const connectSrc = Array.from(
    new Set(
      [
        "'self'",
        supabaseUrl,
        supabaseWs,
        'https://*.supabase.co',
        'wss://*.supabase.co',
        'https://www.googleapis.com',
        'https://oauth2.googleapis.com',
        'https://accounts.google.com',
        'https://apis.google.com',
        'https://docs.google.com',
        downloadOrigin,
        sentryOrigin,
        ...(hasTurnstile ? ['https://challenges.cloudflare.com'] : []),
      ].filter(Boolean),
    ),
  ).join(' ');

  const imgSrc = [
    "'self'",
    'data:',
    'blob:',
    supabaseUrl,
    'https://*.supabase.co',
    'https://*.googleusercontent.com',
    'https://www.googleapis.com',
  ]
    .filter(Boolean)
    .join(' ');

  const frameSrc = [
    "'self'",
    'https://accounts.google.com',
    'https://docs.google.com',
    'https://drive.google.com',
    ...(hasTurnstile ? ['https://challenges.cloudflare.com'] : []),
  ].join(' ');

  const directives = [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    // Tailwind + Next.js inline styles require 'unsafe-inline' for style-src.
    `style-src 'self' 'unsafe-inline'`,
    `img-src ${imgSrc}`,
    `font-src 'self' data:`,
    `connect-src ${connectSrc}`,
    `media-src 'self' https://*.supabase.co blob: data:`,
    `frame-src ${frameSrc}`,
    `frame-ancestors 'none'`,
    `form-action 'self' https://accounts.google.com`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `worker-src 'self' blob:`,
    `manifest-src 'self'`,
    ...(isDev ? [] : [`upgrade-insecure-requests`]),
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

  // 3b. Centralized CSRF guard for every unsafe /api/** request except
  // explicitly token-authenticated machine routes. Runs before Supabase work.
  if (request.nextUrl.pathname.startsWith('/api/') && !isCsrfExemptApiRoute(request.nextUrl.pathname)) {
    try {
      assertSameOrigin(request);
    } catch {
      const forbidden = NextResponse.json(
        { error: 'CSRF_INVALID_ORIGIN' },
        { status: 403 },
      );
      applySecurityHeaders(forbidden, csp);
      return forbidden;
    }
  }

  // 4. Supabase session handling
  const supabase = asTypedSupabaseClient(createServerClient(
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
  ));

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

    const mfaRequired = Boolean(
      profile.mfa_enforced || profile.mfa_enabled || profile.account_type === 'staff'
    );

    if (mfaRequired && !MFA_WHITELIST.some(p => pathname.startsWith(p))) {
      const { data: sessionData } = await supabase.auth.getSession();
      const sid = sessionIdFromJwt(sessionData.session?.access_token ?? '');
      const token = await readMfaSessionToken(request.cookies.get(MFA_COOKIE)?.value);
      const mfaSatisfied = Boolean(sid && token && token.sub === user.id && token.sid === sid);

      if (!mfaSatisfied) {
        const url = request.nextUrl.clone();
        url.pathname = '/verify-mfa';
        url.searchParams.set('next', pathname);
        return redirectWithCsp(url, csp);
      }
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

    if (isSellerRoute && !pathname.startsWith('/seller/pending')) {
      const { data: seller } = await supabase
        .from('seller_profiles')
        .select('status')
        .eq('profile_id', user.id)
        .maybeSingle();

      if (!seller || seller.status !== 'approved') {
        const url = request.nextUrl.clone();
        url.pathname = seller ? '/seller/pending' : '/';
        return redirectWithCsp(url, csp);
      }
    }
  }

  // 6. Attach security headers to the final response
  applySecurityHeaders(response, csp);
  return response;
}

function applySecurityHeaders(response: NextResponse, csp: string) {
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()'
  );
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none');
  response.headers.set('X-DNS-Prefetch-Control', 'on');

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
    '/((?!_next/static|_next/image|supabase/|favicon.ico|robots.txt|sitemap.xml|sw.js|manifest.webmanifest|api/.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf)$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf)$).*)',
  ],
};
