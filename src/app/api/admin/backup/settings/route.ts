import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/auth/admin-guard';

const VALID_SCHEDULES = new Set(['daily', 'weekly', 'manual_only']);

export async function PATCH(req: Request) {
  try {
    await requireSuperAdmin();
    const body = await req.json();

    const schedule = String(body.schedule ?? '');
    const retentionDays = Number(body.retention_days);
    const restoreFreqDays = Number(body.restore_test_frequency_days);
    const includeFiles = Boolean(body.include_files);
    const manualEnabled = Boolean(body.manual_enabled);

    if (!VALID_SCHEDULES.has(schedule)) {
      return NextResponse.json({ error: 'قيمة الجدولة غير صالحة.' }, { status: 400 });
    }
    if (!Number.isInteger(retentionDays) || retentionDays < 7 || retentionDays > 3650) {
      return NextResponse.json({ error: 'مدة الاحتفاظ يجب أن تكون بين 7 و3650 يوماً.' }, { status: 400 });
    }
    if (!Number.isInteger(restoreFreqDays) || restoreFreqDays < 1 || restoreFreqDays > 365) {
      return NextResponse.json({ error: 'تكرار اختبار الاستعادة يجب أن يكون بين 1 و365 يوماً.' }, { status: 400 });
    }

    const db = await createClient();
    const { error } = await db.rpc('update_backup_settings', {
      p_schedule: schedule,
      p_retention_days: retentionDays,
      p_restore_test_frequency_days: restoreFreqDays,
      p_include_files: includeFiles,
      p_manual_enabled: manualEnabled,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 403 });
  }
}
