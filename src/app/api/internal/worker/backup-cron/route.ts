import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAuthorizedCron } from '@/lib/auth/cron';

/**
 * Daily backup watchdog cron (Vercel Cron: 0 4 * * *).
 * Checks whether a scheduled backup or restore test is due per backup_settings.
 * Optionally triggers an external runner webhook (e.g. GitHub Actions workflow_dispatch)
 * and alerts admins if a scheduled backup is overdue.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req.headers)) {
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
        // Keep provider details in server logs only; API/notification consumers
        // receive a fixed sentinel instead of a raw GitHub response body.
        console.error('[backup-cron] dispatch failed', { status: res.status, body: (await res.text()).slice(0, 200) });
        dispatchError = 'DISPATCH_FAILED';
      }
    } catch (err: any) {
      console.error('[backup-cron] dispatch threw', { message: err?.message ?? String(err) });
      dispatchError = 'DISPATCH_FAILED';
    }
  }

  // If overdue and not dispatched, raise an admin notification so missed backups are never silent
  if (backupDue && !dispatched) {
    await db.rpc('notify_staff_with_permission', {
      p_permission: 'backup.read',
      p_type: 'backup_overdue',
      p_category: 'backups',
      p_title: 'تنبيه: نسخة احتياطية مجدولة متأخرة',
      p_body: 'تجاوزت المنصة موعد النسخة الاحتياطية المجدولة في backup_settings. يرجى التحقق من تشغيل GitHub Actions أو تنفيذ النسخة يدوياً.',
      p_link: '/admin/backups',
      p_data: { backupDue, restoreDue, dispatchError },
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
