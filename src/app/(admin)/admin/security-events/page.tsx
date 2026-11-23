import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

const SEVERITY_BADGE: Record<string, { label: string; cls: string }> = {
  low: { label: 'منخفضة', cls: 'ui-badge-neutral' },
  medium: { label: 'متوسطة', cls: 'ui-badge-blue' },
  high: { label: 'مرتفعة', cls: 'ui-badge-amber' },
  critical: { label: 'حرجة', cls: 'ui-badge-red' },
};

export default async function AdminSecurityEventsPage(
  props: {
    searchParams: Promise<{ severity?: string }>;
  }
) {
  const searchParams = await props.searchParams;
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
    <main className="p-6 md:p-8 space-y-6">
      <header className="pb-5 border-b border-border">
        <p className="text-xs font-medium text-primary mb-1">المراقبة والأمان</p>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
          أحداث الأمان
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          مراقبة الأحداث الأمنية والتنبيهات المسجّلة عبر المنصة.
        </p>
      </header>

      <section className="ui-box">
        <nav className="flex flex-wrap items-center gap-2" aria-label="تصفية الأحداث حسب الخطورة">
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
              className={`ui-chip ${(sev ?? '') === f.k ? 'ui-chip-active' : ''}`}
            >
              {f.label}
            </Link>
          ))}
        </nav>
      </section>

      <section className="ui-table-wrap">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th className="text-right font-semibold px-3.5 py-2.5">التوقيت</th>
              <th className="text-right font-semibold px-3.5 py-2.5">النوع</th>
              <th className="text-right font-semibold px-3.5 py-2.5">الخطورة</th>
              <th className="text-right font-semibold px-3.5 py-2.5">المستخدم</th>
              <th className="text-right font-semibold px-3.5 py-2.5">IP</th>
              <th className="text-right font-semibold px-3.5 py-2.5">التفاصيل</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {(events ?? []).map((ev: any) => {
              const badge = SEVERITY_BADGE[ev.severity] ?? SEVERITY_BADGE.medium;
              return (
                <tr key={ev.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-3.5 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    <span className="ui-num">{new Date(ev.created_at).toLocaleString('ar')}</span>
                  </td>
                  <td className="px-3.5 py-3 text-xs font-mono" dir="ltr">
                    {ev.type}
                  </td>
                  <td className="px-3.5 py-3 text-xs">
                    <span className={`ui-badge ${badge.cls}`}>{badge.label}</span>
                  </td>
                  <td className="px-3.5 py-3 text-xs font-mono text-muted-foreground" dir="ltr">
                    {ev.profiles?.email ?? '—'}
                  </td>
                  <td className="px-3.5 py-3 text-xs text-muted-foreground ui-num" dir="ltr">
                    {ev.ip ?? '—'}
                  </td>
                  <td className="px-3.5 py-3 text-xs font-mono text-muted-foreground max-w-xs truncate" dir="ltr">
                    {ev.details ? JSON.stringify(ev.details) : '—'}
                  </td>
                </tr>
              );
            })}
            {!events?.length && (
              <tr>
                <td colSpan={6} className="p-10 text-center text-sm text-muted-foreground">
                  لا توجد أحداث أمان مسجّلة.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
