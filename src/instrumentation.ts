import * as Sentry from '@sentry/nextjs';

function assertTrustedIpConfiguration() {
  if (process.env.NODE_ENV !== 'production') return;
  // `next build` also runs with NODE_ENV=production but does not serve traffic.
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  const trusted =
    process.env.VERCEL === '1' ||
    process.env.TRUST_CLOUDFLARE_IP === '1' ||
    process.env.TRUST_PROXY_HEADERS === '1';
  if (!trusted) {
    throw new Error(
      'No trusted client-IP source configured. Set VERCEL=1, TRUST_CLOUDFLARE_IP=1, ' +
        'or TRUST_PROXY_HEADERS=1 (only when your proxy overwrites x-real-ip/x-forwarded-for).',
    );
  }
}

export async function register() {
  assertTrustedIpConfiguration();
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
