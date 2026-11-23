'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  initial: {
    schedule: 'daily' | 'weekly' | 'manual_only';
    retention_days: number;
    restore_test_frequency_days: number;
    include_files: boolean;
    manual_enabled: boolean;
  };
};

export function BackupSettingsForm({ initial }: Props) {
  const router = useRouter();
  const [schedule, setSchedule] = useState(initial.schedule);
  const [retentionDays, setRetentionDays] = useState(initial.retention_days);
  const [restoreFreq, setRestoreFreq] = useState(initial.restore_test_frequency_days);
  const [includeFiles, setIncludeFiles] = useState(initial.include_files);
  const [manualEnabled, setManualEnabled] = useState(initial.manual_enabled);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/admin/backup/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schedule,
          retention_days: Number(retentionDays),
          restore_test_frequency_days: Number(restoreFreq),
          include_files: includeFiles,
          manual_enabled: manualEnabled,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setNotice({ type: 'err', text: json.error ?? 'فشل حفظ الإعدادات' });
      } else {
        setNotice({ type: 'ok', text: 'تم حفظ إعدادات الجدولة والنسخ الاحتياطي.' });
        router.refresh();
      }
    } catch {
      setNotice({ type: 'err', text: 'تعذّر الاتصال بالخادم.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="ui-box space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground block">
            الجدول التلقائي
          </label>
          <select
            value={schedule}
            onChange={e => setSchedule(e.target.value as any)}
            className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          >
            <option value="daily">يومي (كل 24 ساعة)</option>
            <option value="weekly">أسبوعي (كل 7 أيام)</option>
            <option value="manual_only">يدوي فقط</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground block">
            مدة الاحتفاظ (بالأيام)
          </label>
          <input
            type="number"
            min={7}
            max={3650}
            value={retentionDays}
            onChange={e => setRetentionDays(Number(e.target.value))}
            className="ui-num w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            dir="ltr"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground block">
            اختبار الاستعادة التلقائي (كل X يوم)
          </label>
          <input
            type="number"
            min={1}
            max={365}
            value={restoreFreq}
            onChange={e => setRestoreFreq(Number(e.target.value))}
            className="ui-num w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            dir="ltr"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-6 text-sm pt-1">
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={includeFiles}
            onChange={e => setIncludeFiles(e.target.checked)}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          <span>تضمين بيانات الملفات</span>
        </label>

        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={manualEnabled}
            onChange={e => setManualEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          <span>تفعيل التشغيل اليدوي</span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? 'جارٍ الحفظ...' : 'حفظ إعدادات النسخ الاحتياطي'}
        </button>
        {notice && (
          <p className={`text-sm ${notice.type === 'ok' ? 'text-success' : 'text-destructive'}`}>
            {notice.text}
          </p>
        )}
      </div>
    </form>
  );
}
