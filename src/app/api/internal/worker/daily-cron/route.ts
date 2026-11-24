import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/auth/cron';
import { logServerError } from '@/lib/api/errors';
import { processPendingScans } from '@/lib/server/services/scan-service';
import { processPendingPreviews } from '@/lib/server/services/preview-service';
import { processEmailOutbox, sendAdminDigest } from '@/lib/server/services/email-service';

/**
 * Consolidated daily platform worker cron (Vercel Cron: 0 5 * * *).
 * Runs scan backlog, preview backlog, email outbox, and daily admin digest in a
 * single invocation so Vercel Hobby projects stay within the 2-cron limit.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req.headers)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const summary: Record<string, unknown> = {};
  let hadError = false;

  try {
    summary.scans = await processPendingScans(10);
  } catch (e) {
    hadError = true;
    logServerError('api/internal/worker/daily-cron:scan', e);
    summary.scans = { error: 'SCAN_FAILED' };
  }

  try {
    summary.previews = await processPendingPreviews(10);
  } catch (e) {
    hadError = true;
    logServerError('api/internal/worker/daily-cron:preview', e);
    summary.previews = { error: 'PREVIEW_FAILED' };
  }

  try {
    summary.emails = await processEmailOutbox(30);
  } catch (e) {
    hadError = true;
    logServerError('api/internal/worker/daily-cron:email', e);
    summary.emails = { error: 'EMAIL_OUTBOX_FAILED' };
  }

  try {
    summary.digest = await sendAdminDigest();
  } catch (e) {
    hadError = true;
    logServerError('api/internal/worker/daily-cron:digest', e);
    summary.digest = { error: 'ADMIN_DIGEST_FAILED' };
  }

  return NextResponse.json(
    { ok: !hadError, ...summary },
    { status: hadError ? 500 : 200 },
  );
}
