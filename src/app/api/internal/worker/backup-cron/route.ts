import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAuthorizedCron } from '@/lib/auth/cron';
import { logServerError } from '@/lib/api/errors';

/**
 * Daily backup watchdog cron (Vercel Cron: 0 4 * * *).
 * M-13: Fails closed (HTTP 500 + staff alert) if the due-check RPCs fail,
 * instead of returning `{ ok: true }` silently.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req.headers)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const db = createAdminClient();
  const [backupCheck, restoreCheck] = await Promise.all([
    db.rpc('is_backup_due'),
    db.rpc('is_restore_test_due'),
  ]);

  if (backupCheck.error || restoreCheck.error) {
    const err = backupCheck.error ?? restoreCheck.error;
    logServerError('api/internal/worker/backup-cron:due-check', err, { status: 500 });
    await db
      .rpc('notify_staff_with_permission', {
        p_permission: 'backup.read',
        p_type: 'backup_watchdog_failed',
        p_category: 'backups',
        p_title: 'تنبيه: تعذر التحقق من حالة النسخ الاحتياطي',
        p_body: 'فشل استعلام المراقب اليومي للنسخ الاحتياطي. يرجى مراجعة صفحة النسخ الاحتياطي فوراً.',
        p_link: '/admin/backups',
        p_data: { reason: 'DUE_CHECK_FAILED' },
      })
      .then(() => undefined, () => undefined);
    return NextResponse.json({ ok: false, error: 'DUE_CHECK_FAILED' }, { status: 500 });
  }

  const backupDue = Boolean(backupCheck.data);
  const restoreDue = Boolean(restoreCheck.data);

  let dispatched = false;
  let dispatchError: string | null = null;

  const ghRepo = process.env.BACKUP_GITHUB_REPO;
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
              force_backup: String(backupDue),
              force_verify: String(restoreDue),
            },
          }),
        },
      );
      if (res.ok) {
        dispatched = true;
      } else {
        logServerError(
          'api/internal/worker/backup-cron:dispatch',
          new Error('GITHUB_DISPATCH_FAILED'),
          { status: res.status },
        );
        dispatchError = 'DISPATCH_FAILED';
      }
    } catch (err) {
      logServerError('api/internal/worker/backup-cron:dispatch', err, { status: 502 });
      dispatchError = 'DISPATCH_FAILED';
    }
  }

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

  return NextResponse.json(
    {
      ok: dispatchError === null,
      backup_due: backupDue,
      restore_test_due: restoreDue,
      dispatched,
      dispatch_error: dispatchError,
    },
    { status: dispatchError ? 502 : 200 },
  );
}
