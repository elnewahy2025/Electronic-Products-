import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent } from '@/lib/observability/sentry-scrub';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    enabled: Boolean(dsn),
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    beforeSend: (event) => scrubSentryEvent(event),
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
