import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

const SEVERITY_BADGE: Record<string, { label: string; cls: string }> = {
  low: { label: 'منخفضة', cls: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300' },
  medium: { label: 'متوسطة', cls: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300' },
  high: { label: 'مرتفعة', cls: 'bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300' },
  critical: { label: 'حرجة', cls: 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300' },
};

export default async function AdminSecurityEventsPage({
  searchParams,
}: {
  searchParams: { severity?: string };
}) {
  const db = await createClient();
  const sev = searchParams.severity;

  let query = db
    .from('security_events')
    .select('id, type, severity, ip, user_agent, details, created_at, profiles!security_events_actor_id_fkey(email)')
    .order('created_at', { ascending: false })
    .limit(100);

  if (sev && ['low', 'medium', 'high', 'critical'].includes(sev)) {
    query = query.eq('severity', sev as any);
  }

  const { data: events } = await query;

  return (
    <main className="p-6 max-w-6xl space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">أحداث الأمان (`security_events`)</h1>
          <p className="text-sm text-muted-foreground mt-1">
            مراقبة الأحداث الأمنية والتنبيهات المسجّلة عبر المنصة.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          {[
            { k: '', label: 'الكل' },
            { k: 'critical', label: 'حرجة' },
            { k: 'high', label: 'مرتفعة' },
            { k: 'medium', label: 'متوسطة' },
            { k: 'low', label: 'منخفضة' },
          ].map(f => (
            <Link
              key={f.k}
              href={f.k ? `/admin/security-events?severity=${f.k}` : '/admin/security-events'}
              className={`px-3 py-1.5 rounded-lg border transition ${
                (sev ?? '') === f.k
                  ? 'bg-primary text-primary-foreground border-primary font-medium'
                  : 'border-border bg-card hover:bg-muted/60'
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-x-auto shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-muted/70">
            <tr>
              <th className="text-right p-3">التوقيت</th>
              <th className="text-right p-3">النوع</th>
              <th className="text-right p-3">الخطورة</th>
              <th className="text-right p-3">المستخدم</th>
              <th className="text-right p-3">IP</th>
              <th className="text-right p-3">التفاصيل</th>
            </tr>
          </thead>
          <tbody>
            {(events ?? []).map((ev: any) => {
              const badge = SEVERITY_BADGE[ev.severity] ?? SEVERITY_BADGE.medium;
              return (
                <tr key={ev.id} className="border-t border-border">
                  <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(ev.created_at).toLocaleString('ar')}
                  </td>
                  <td className="p-3 text-xs font-mono" dir="ltr">
                    {ev.type}
                  </td>
                  <td className="p-3 text-xs">
                    <span className={`px-2 py-0.5 rounded-full border ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </td>
                  <td className="p-3 text-xs font-mono text-muted-foreground" dir="ltr">
                    {ev.profiles?.email ?? '—'}
                  </td>
                  <td className="p-3 text-xs font-mono text-muted-foreground" dir="ltr">
                    {ev.ip ?? '—'}
                  </td>
                  <td className="p-3 text-xs font-mono text-muted-foreground max-w-xs truncate" dir="ltr">
                    {ev.details ? JSON.stringify(ev.details) : '—'}
                  </td>
                </tr>
              );
            })}
            {!events?.length && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground text-sm">
                  لا توجد أحداث أمان مسجّلة.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
