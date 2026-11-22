import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

async function getAdminOverview() {
  const db = await createClient();
  const [
    { count: pendingSellers },
    { count: openRequests },
    { count: pendingComp },
    { count: pendingPayouts },
    { count: openReports },
    { count: openTickets },
    { count: activeSessions },
    { data: recentAudit },
  ] = await Promise.all([
    db.from('seller_profiles').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    db.from('purchase_requests').select('*', { count: 'exact', head: true }).in('status', ['created', 'pending']),
    db.from('compensation_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    db.from('seller_payouts').select('*', { count: 'exact', head: true }).eq('status', 'requested'),
    db.from('content_reports').select('*', { count: 'exact', head: true }).eq('status', 'open'),
    db.from('support_tickets').select('*', { count: 'exact', head: true }).eq('status', 'open'),
    db.from('download_sessions').select('*', { count: 'exact', head: true }).in('status', ['active', 'compensation_active']),
    db.from('audit_logs')
      .select('id, action, entity_type, entity_id, created_at, profiles!audit_logs_actor_id_fkey(email)')
      .order('created_at', { ascending: false })
      .limit(8),
  ]);

  return {
    pendingSellers: pendingSellers ?? 0,
    openRequests: openRequests ?? 0,
    pendingComp: pendingComp ?? 0,
    pendingPayouts: pendingPayouts ?? 0,
    openReports: openReports ?? 0,
    openTickets: openTickets ?? 0,
    activeSessions: activeSessions ?? 0,
    recentAudit: recentAudit ?? [],
  };
}

export default async function AdminHome() {
  const s = await getAdminOverview();

  const cards = [
    { href: '/admin/requests?status=pending', label: 'طلبات شراء بانتظار المراجعة', value: s.openRequests },
    { href: '/admin/sellers?status=pending', label: 'بائعون بانتظار الاعتماد', value: s.pendingSellers },
    { href: '/admin/compensation?status=pending', label: 'طلبات تعويض معلّقة', value: s.pendingComp },
    { href: '/admin/payouts?status=requested', label: 'طلبات سحب بانتظار الصرف', value: s.pendingPayouts },
    { href: '/admin/reports?status=open', label: 'بلاغات مفتوحة', value: s.openReports },
    { href: '/admin/support?status=open', label: 'تذاكر دعم مفتوحة', value: s.openTickets },
    { href: '/admin/downloads?status=active', label: 'جلسات تنزيل نشطة', value: s.activeSessions, calm: true },
  ];

  return (
    <main className="p-6 max-w-6xl space-y-7">
      <div>
        <h1 className="text-[22px] font-bold text-foreground">لوحة التحكم</h1>
        <p className="text-sm text-muted-foreground mt-0.5">ما يحتاج قرارك الآن.</p>
      </div>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(c => (
          <Link
            key={c.href}
            href={c.href}
            className="ui-stat hover:border-primary block"
          >
            <div
              className={`text-[28px] font-bold leading-tight ui-num ${
                c.value === 0
                  ? 'text-muted-foreground'
                  : c.calm
                    ? 'text-success'
                    : 'text-warning'
              }`}
            >
              {c.value}
            </div>
            <span className="text-[13px] text-muted-foreground mt-1 block">{c.label}</span>
          </Link>
        ))}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-foreground">آخر الإجراءات</h2>
          <Link href="/admin/audit" className="text-xs font-medium text-primary hover:underline">
            سجل التدقيق الكامل ←
          </Link>
        </div>

        <div className="ui-table-wrap">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="text-right font-semibold px-3.5 py-2.5">الوقت</th>
                <th className="text-right font-semibold px-3.5 py-2.5">المنفّذ</th>
                <th className="text-right font-semibold px-3.5 py-2.5">الإجراء</th>
                <th className="text-right font-semibold px-3.5 py-2.5">الكيان</th>
              </tr>
            </thead>
            <tbody>
              {s.recentAudit.map((row: any) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="px-3.5 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(row.created_at).toLocaleString('ar')}
                  </td>
                  <td className="px-3.5 py-2.5 text-xs font-mono" dir="ltr">
                    {row.profiles?.email ?? 'system'}
                  </td>
                  <td className="px-3.5 py-2.5 text-xs font-mono" dir="ltr">
                    {row.action}
                  </td>
                  <td className="px-3.5 py-2.5 text-xs text-muted-foreground font-mono" dir="ltr">
                    {row.entity_type}
                    {row.entity_id ? ` · ${String(row.entity_id).slice(0, 8)}` : ''}
                  </td>
                </tr>
              ))}
              {s.recentAudit.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-muted-foreground text-sm">
                    لا توجد إجراءات مسجّلة بعد.
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
