import { createClient } from '@/lib/supabase/server';
import { BackupActions } from './backup-actions';
import { BackupSettingsForm } from './backup-settings-form';

const SCHEDULE_LABELS: Record<string, string> = {
  daily: 'يومي',
  weekly: 'أسبوعي',
  manual_only: 'يدوي فقط',
};

const JOB_STATUS: Record<string, { label: string; cls: string }> = {
  completed: { label: 'مكتمل', cls: 'ui-badge-green' },
  failed: { label: 'فشل', cls: 'ui-badge-red' },
};

const RESTORE_STATUS: Record<string, { label: string; cls: string }> = {
  completed: { label: 'نجح التحقق', cls: 'ui-badge-green' },
  failed: { label: 'فشل التحقق', cls: 'ui-badge-red' },
};

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default async function BackupsPage() {
  const db = await createClient();
  const [{ data: settings }, { data: jobs }, { data: restores }] = await Promise.all([
    db.from('backup_settings').select('*').eq('id', 1).single(),
    db.from('backup_jobs')
      .select(`
        id, type, status, started_at, finished_at, size_bytes, storage_location, error,
        profiles!backup_jobs_triggered_by_fkey(email),
        backup_archives(id, checksum, created_at)
      `)
      .order('started_at', { ascending: false })
      .limit(50),
    db.from('restore_jobs')
      .select(`
        id, status, started_at, finished_at, error,
        backup_archives(storage_location, checksum)
      `)
      .order('started_at', { ascending: false })
      .limit(20),
  ]);

  const lastCompletedJob = (jobs ?? []).find((j: any) => j.status === 'completed');
  const lastRestore = (restores ?? [])[0] as any | undefined;

  return (
    <main className="p-6 md:p-8 space-y-6">
      <header className="pb-5 border-b border-border">
        <p className="text-xs font-medium text-primary mb-1">النسخ الاحتياطي واستمرارية العمل</p>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
          النسخ الاحتياطي واختبار الاستعادة
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          جدولة النسخ الاحتياطي التلقائي، سجل الأرشيفات الموثّقة بـ SHA-256، ونتائج اختبارات الاستعادة المعزولة.
        </p>
      </header>

      {/* Status Summary Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="ui-stat space-y-1">
          <p className="text-xs text-muted-foreground">الجدول النشط</p>
          <p className="text-lg font-bold text-foreground">
            {SCHEDULE_LABELS[settings?.schedule ?? 'weekly'] ?? settings?.schedule}
          </p>
          <p className="text-xs text-muted-foreground">
            الاحتفاظ <span className="ui-num">{settings?.retention_days ?? 90}</span> يوماً — اختبار الاستعادة كل{' '}
            <span className="ui-num">{settings?.restore_test_frequency_days ?? 30}</span> يوماً
          </p>
        </div>

        <div className="ui-stat space-y-1">
          <p className="text-xs text-muted-foreground">آخر نسخة مكتملة</p>
          <p className="text-lg font-bold text-foreground">
            {lastCompletedJob ? (
              <span className="ui-num">
                {new Date(lastCompletedJob.finished_at ?? lastCompletedJob.started_at).toLocaleDateString('ar')}
              </span>
            ) : (
              'لا توجد بعد'
            )}
          </p>
          <p className="text-xs text-muted-foreground ui-num" dir="ltr">
            {lastCompletedJob ? formatBytes(lastCompletedJob.size_bytes) : '—'}
          </p>
        </div>

        <div className="ui-stat space-y-1">
          <p className="text-xs text-muted-foreground">آخر اختبار استعادة معزول</p>
          <p className="text-lg font-bold text-foreground">
            {lastRestore?.status === 'completed' ? (
              <span className="ui-badge ui-badge-green">ناجح وموثّق</span>
            ) : lastRestore?.status === 'failed' ? (
              <span className="ui-badge ui-badge-red">فشل الاختبار</span>
            ) : (
              'لم يُنفّذ بعد'
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {lastRestore?.finished_at ? (
              <span className="ui-num">{new Date(lastRestore.finished_at).toLocaleString('ar')}</span>
            ) : (
              'يعمل تلقائياً عبر GitHub Actions'
            )}
          </p>
        </div>
      </section>

      {/* Settings & Manual Action */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-8 space-y-3">
          <h2 className="text-base font-semibold text-foreground">إعدادات الجدولة والاحتفاظ</h2>
          <BackupSettingsForm
            initial={{
              schedule: (settings?.schedule ?? 'weekly') as 'daily' | 'weekly' | 'manual_only',
              retention_days: Number(settings?.retention_days ?? 90),
              restore_test_frequency_days: Number(settings?.restore_test_frequency_days ?? 30),
              include_files: Boolean(settings?.include_files ?? true),
              manual_enabled: Boolean(settings?.manual_enabled ?? true),
            }}
          />
        </section>

        <section className="lg:col-span-4 space-y-3">
          <h2 className="text-base font-semibold text-foreground">تشغيل يدوي</h2>
          <BackupActions />
        </section>
      </div>

      {/* Backup Jobs & Archives Table */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-base font-semibold text-foreground">سجل عمليات النسخ الاحتياطي</h2>
          <p className="text-xs text-muted-foreground">أحدث 50 عملية</p>
        </div>
        <div className="ui-table-wrap">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr>
                <th className="text-right font-semibold px-3.5 py-2.5">البداية</th>
                <th className="text-right font-semibold px-3.5 py-2.5">النوع</th>
                <th className="text-right font-semibold px-3.5 py-2.5">الحالة</th>
                <th className="text-right font-semibold px-3.5 py-2.5">الحجم</th>
                <th className="text-right font-semibold px-3.5 py-2.5">بصمة SHA-256</th>
                <th className="text-right font-semibold px-3.5 py-2.5">المنفّذ</th>
                <th className="text-right font-semibold px-3.5 py-2.5">الموقع</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {(jobs ?? []).map((j: any) => {
                const archive = Array.isArray(j.backup_archives)
                  ? j.backup_archives[0]
                  : j.backup_archives;
                const status = JOB_STATUS[j.status] ?? { label: 'قيد التنفيذ', cls: 'ui-badge-amber' };
                return (
                  <tr key={j.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-3.5 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      <span className="ui-num">{new Date(j.started_at).toLocaleString('ar')}</span>
                    </td>
                    <td className="px-3.5 py-3 text-xs">{j.type === 'auto' ? 'تلقائي' : 'يدوي'}</td>
                    <td className="px-3.5 py-3 text-xs">
                      <span className={`ui-badge ${status.cls}`} title={j.error ?? undefined}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-3.5 py-3 text-xs text-muted-foreground ui-num" dir="ltr">
                      {formatBytes(j.size_bytes)}
                    </td>
                    <td className="px-3.5 py-3 text-xs text-muted-foreground ui-num" dir="ltr">
                      {archive?.checksum ? `${archive.checksum.slice(0, 12)}...` : '—'}
                    </td>
                    <td className="px-3.5 py-3 text-xs font-mono" dir="ltr">
                      {j.profiles?.email ?? 'cron'}
                    </td>
                    <td className="px-3.5 py-3 text-xs text-muted-foreground font-mono" dir="ltr">
                      {j.storage_location ?? '—'}
                    </td>
                  </tr>
                );
              })}
              {!jobs?.length && (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-sm text-muted-foreground">
                    لا توجد عمليات نسخ احتياطي مسجّلة بعد.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Restore Verification History */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-base font-semibold text-foreground">
            سجل اختبارات الاستعادة المعزولة
          </h2>
          <p className="text-xs text-muted-foreground">أحدث 20 اختباراً</p>
        </div>
        <div className="ui-table-wrap">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr>
                <th className="text-right font-semibold px-3.5 py-2.5">توقيت الاختبار</th>
                <th className="text-right font-semibold px-3.5 py-2.5">النتيجة</th>
                <th className="text-right font-semibold px-3.5 py-2.5">الأرشيف المختبَر</th>
                <th className="text-right font-semibold px-3.5 py-2.5">بصمة SHA-256</th>
                <th className="text-right font-semibold px-3.5 py-2.5">ملاحظات / خطأ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {(restores ?? []).map((r: any) => {
                const status = RESTORE_STATUS[r.status] ?? { label: 'قيد التنفيذ', cls: 'ui-badge-amber' };
                return (
                  <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-3.5 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      <span className="ui-num">{new Date(r.finished_at ?? r.started_at).toLocaleString('ar')}</span>
                    </td>
                    <td className="px-3.5 py-3 text-xs">
                      <span className={`ui-badge ${status.cls}`}>{status.label}</span>
                    </td>
                    <td className="px-3.5 py-3 text-xs text-muted-foreground font-mono" dir="ltr">
                      {r.backup_archives?.storage_location ?? '—'}
                    </td>
                    <td className="px-3.5 py-3 text-xs text-muted-foreground ui-num" dir="ltr">
                      {r.backup_archives?.checksum
                        ? `${r.backup_archives.checksum.slice(0, 12)}...`
                        : '—'}
                    </td>
                    <td className={`px-3.5 py-3 text-xs ${r.error ? 'text-destructive' : 'text-success'}`}>
                      {r.error ?? 'تمت الاستعادة والتحقق من الجداول الأساسية بنجاح'}
                    </td>
                  </tr>
                );
              })}
              {!restores?.length && (
                <tr>
                  <td colSpan={5} className="p-10 text-center text-sm text-muted-foreground">
                    لم يُنفّذ اختبار استعادة بعد.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
