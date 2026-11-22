import { createClient } from '@/lib/supabase/server';
import { BackupActions } from './backup-actions';
import { BackupSettingsForm } from './backup-settings-form';

const SCHEDULE_LABELS: Record<string, string> = {
  daily: 'يومي',
  weekly: 'أسبوعي',
  manual_only: 'يدوي فقط',
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
    <main className="p-6 max-w-6xl space-y-6">
      <div className="border-b border-border pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          النسخ الاحتياطي واختبار الاستعادة
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          جدولة النسخ الاحتياطي التلقائي، سجل الأرشيفات الموثّقة بـ SHA-256، ونتائج اختبارات الاستعادة المعزولة.
        </p>
      </div>

      {/* Status Summary Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-1">
          <p className="text-xs text-muted-foreground">الجدول النشط</p>
          <p className="text-lg font-bold text-foreground">
            {SCHEDULE_LABELS[settings?.schedule ?? 'weekly'] ?? settings?.schedule}
          </p>
          <p className="text-xs text-muted-foreground">
            الاحتفاظ {settings?.retention_days ?? 90} يوماً — اختبار الاستعادة كل{' '}
            {settings?.restore_test_frequency_days ?? 30} يوماً
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-1">
          <p className="text-xs text-muted-foreground">آخر نسخة مكتملة</p>
          <p className="text-lg font-bold text-foreground">
            {lastCompletedJob
              ? new Date(lastCompletedJob.finished_at ?? lastCompletedJob.started_at).toLocaleDateString('ar')
              : 'لا توجد بعد'}
          </p>
          <p className="text-xs text-muted-foreground font-mono tabular-nums" dir="ltr">
            {lastCompletedJob ? formatBytes(lastCompletedJob.size_bytes) : '—'}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-1">
          <p className="text-xs text-muted-foreground">آخر اختبار استعادة معزول</p>
          <p
            className={`text-lg font-bold ${
              lastRestore?.status === 'completed'
                ? 'text-emerald-700'
                : lastRestore?.status === 'failed'
                  ? 'text-red-700'
                  : 'text-foreground'
            }`}
          >
            {lastRestore?.status === 'completed'
              ? 'ناجح وموثّق'
              : lastRestore?.status === 'failed'
                ? 'فشل الاختبار'
                : 'لم يُنفّذ بعد'}
          </p>
          <p className="text-xs text-muted-foreground">
            {lastRestore?.finished_at
              ? new Date(lastRestore.finished_at).toLocaleString('ar')
              : 'يعمل تلقائياً عبر GitHub Actions'}
          </p>
        </div>
      </div>

      {/* Settings & Manual Action */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-8 rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
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

        <section className="lg:col-span-4 rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
          <h2 className="text-base font-semibold text-foreground">تشغيل يدوي</h2>
          <BackupActions />
        </section>
      </div>

      {/* Backup Jobs & Archives Table */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">سجل عمليات النسخ الاحتياطي</h2>
        <div className="rounded-2xl border border-border bg-card overflow-x-auto shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/70">
              <tr>
                <th className="text-right p-3">البداية</th>
                <th className="text-right p-3">النوع</th>
                <th className="text-right p-3">الحالة</th>
                <th className="text-right p-3">الحجم</th>
                <th className="text-right p-3">بصمة SHA-256</th>
                <th className="text-right p-3">المنفّذ</th>
                <th className="text-right p-3">الموقع</th>
              </tr>
            </thead>
            <tbody>
              {(jobs ?? []).map((j: any) => {
                const archive = Array.isArray(j.backup_archives)
                  ? j.backup_archives[0]
                  : j.backup_archives;
                return (
                  <tr key={j.id} className="border-t border-border">
                    <td className="p-3 text-xs">{new Date(j.started_at).toLocaleString('ar')}</td>
                    <td className="p-3 text-xs">{j.type === 'auto' ? 'تلقائي' : 'يدوي'}</td>
                    <td className="p-3 text-xs">
                      <span
                        className={`px-2 py-0.5 rounded-full border ${
                          j.status === 'completed'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : j.status === 'failed'
                              ? 'bg-red-50 text-red-800 border-red-200'
                              : 'bg-amber-50 text-amber-800 border-amber-200'
                        }`}
                        title={j.error ?? undefined}
                      >
                        {j.status === 'completed'
                          ? 'مكتمل'
                          : j.status === 'failed'
                            ? 'فشل'
                            : 'قيد التنفيذ'}
                      </span>
                    </td>
                    <td className="p-3 text-xs font-mono tabular-nums" dir="ltr">
                      {formatBytes(j.size_bytes)}
                    </td>
                    <td className="p-3 text-xs font-mono text-muted-foreground" dir="ltr">
                      {archive?.checksum ? `${archive.checksum.slice(0, 12)}...` : '—'}
                    </td>
                    <td className="p-3 text-xs font-mono" dir="ltr">
                      {j.profiles?.email ?? 'cron'}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground font-mono" dir="ltr">
                      {j.storage_location ?? '—'}
                    </td>
                  </tr>
                );
              })}
              {!jobs?.length && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground text-sm">
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
        <h2 className="text-base font-semibold text-foreground">
          سجل اختبارات الاستعادة المعزولة (`restore_jobs`)
        </h2>
        <div className="rounded-2xl border border-border bg-card overflow-x-auto shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/70">
              <tr>
                <th className="text-right p-3">توقيت الاختبار</th>
                <th className="text-right p-3">النتيجة</th>
                <th className="text-right p-3">الأرشيف المختبَر</th>
                <th className="text-right p-3">بصمة SHA-256</th>
                <th className="text-right p-3">ملاحظات / خطأ</th>
              </tr>
            </thead>
            <tbody>
              {(restores ?? []).map((r: any) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="p-3 text-xs">
                    {new Date(r.finished_at ?? r.started_at).toLocaleString('ar')}
                  </td>
                  <td className="p-3 text-xs">
                    <span
                      className={`px-2 py-0.5 rounded-full border ${
                        r.status === 'completed'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : r.status === 'failed'
                            ? 'bg-red-50 text-red-800 border-red-200'
                            : 'bg-amber-50 text-amber-800 border-amber-200'
                      }`}
                    >
                      {r.status === 'completed'
                        ? 'نجح التحقق'
                        : r.status === 'failed'
                          ? 'فشل التحقق'
                          : 'قيد التنفيذ'}
                    </span>
                  </td>
                  <td className="p-3 text-xs font-mono text-muted-foreground" dir="ltr">
                    {r.backup_archives?.storage_location ?? '—'}
                  </td>
                  <td className="p-3 text-xs font-mono text-muted-foreground" dir="ltr">
                    {r.backup_archives?.checksum
                      ? `${r.backup_archives.checksum.slice(0, 12)}...`
                      : '—'}
                  </td>
                  <td className="p-3 text-xs text-red-700">
                    {r.error ?? 'تمت الاستعادة والتحقق من الجداول الأساسية بنجاح'}
                  </td>
                </tr>
              ))}
              {!restores?.length && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground text-sm">
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
