import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Daily backup watchdog cron (Vercel Cron: 0 4 * * *).
 * Checks whether a scheduled backup or restore test is due per backup_settings.
 * Optionally triggers an external runner webhook (e.g. GitHub Actions workflow_dispatch)
 * and alerts admins if a scheduled backup is overdue.
 */
function isAuthorized(req: NextRequest): boolean {
  if (req.headers.get('x-vercel-cron') === '1') return true;
  const secret = process.env.CRON_SECRET || process.env.WORKER_SECRET;
  return Boolean(secret && req.headers.get('authorization') === `Bearer ${secret}`);
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const db = createAdminClient();
  const [{ data: backupDue }, { data: restoreDue }] = await Promise.all([
    db.rpc('is_backup_due'),
    db.rpc('is_restore_test_due'),
  ]);

  let dispatched = false;
  let dispatchError: string | null = null;

  // Optional GitHub Actions workflow_dispatch trigger if configured
  const ghRepo = process.env.BACKUP_GITHUB_REPO; // e.g. "owner/repo"
  const ghToken = process.env.BACKUP_GITHUB_TOKEN;
  if ((backupDue || restoreDue) && ghRepo && ghToken) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${ghRepo}/actions/workflows/backup-and-verify.yml/dispatches`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${ghToken}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ref: 'main',
            inputs: {
              force_backup: String(Boolean(backupDue)),
              force_verify: String(Boolean(restoreDue)),
            },
          }),
        },
      );
      if (res.ok) {
        dispatched = true;
      } else {
        dispatchError = `GitHub API ${res.status}: ${(await res.text()).slice(0, 200)}`;
      }
    } catch (err: any) {
      dispatchError = err?.message ?? 'dispatch_failed';
    }
  }

  // If overdue and not dispatched, raise an admin notification so missed backups are never silent
  if (backupDue && !dispatched) {
    await db.rpc('notify_staff_with_permission', {
      p_permission: 'backup.read',
      p_type: 'backup_overdue',
      p_title: 'تنبيه: نسخة احتياطية مجدولة متأخرة',
      p_body: 'تجاوزت المنصة موعد النسخة الاحتياطية المجدولة في backup_settings. يرجى التحقق من تشغيل GitHub Actions أو تنفيذ النسخة يدوياً.',
      p_metadata: { backupDue, restoreDue, dispatchError },
    });
  }

  return NextResponse.json({
    ok: true,
    backup_due: Boolean(backupDue),
    restore_test_due: Boolean(restoreDue),
    dispatched,
    dispatch_error: dispatchError,
  });
}
