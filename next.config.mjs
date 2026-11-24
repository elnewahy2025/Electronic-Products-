import sentryConfig from '@sentry/nextjs/config';

const { withSentryConfig } = sentryConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(process.platform !== 'win32' ? { output: 'standalone' } : {}),

  poweredByHeader: false, // removes X-Powered-By
  compress: true,

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.googleusercontent.com' },
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24, // 24h
  },

  serverExternalPackages: ['sharp', 'canvas', 'pdf-to-img', 'nodemailer'],

  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },

  async rewrites() {
    const target = process.env.SUPABASE_PROXY_TARGET;
    if (!target) return [];
    return [
      {
        source: '/supabase/:path*',
        destination: `${target.replace(/\/$/, '')}/:path*`,
      },
    ];
  },

  // Defense in depth only: the edge must still enforce HTTPS and the canonical
  // host. This redirect is intentionally disabled for local/http app URLs so
  // CI, previews and localhost development are not diverted.
  async redirects() {
    if (process.env.NODE_ENV !== 'production') return [];

    const configured = process.env.NEXT_PUBLIC_APP_URL;
    if (!configured) return [];

    let appUrl;
    try {
      appUrl = new URL(configured);
    } catch {
      return [];
    }
    if (appUrl.protocol !== 'https:') return [];

    return [
      {
        source: '/:path*',
        has: [{ type: 'header', key: 'x-forwarded-proto', value: '^http$' }],
        destination: `${appUrl.origin}/:path*`,
        permanent: true,
      },
    ];
  },

  async headers() {
    return [
      // Belt-and-braces: headers that are static (no nonce needed).
      // CSP itself is set in middleware to inject the per-request nonce.
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value:
              'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), interest-cohort=()',
          },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
          { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
          ...(process.env.NODE_ENV === 'production'
            ? [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=63072000; includeSubDomains; preload',
                },
              ]
            : []),
        ],
      },
      // API routes: no HTML, but ensure no sniffing
      {
        source: '/api/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  telemetry: false,
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
});
