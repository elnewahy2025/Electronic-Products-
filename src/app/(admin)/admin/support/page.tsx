import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

const STATUS_META: Record<string, { label: string; badge: string }> = {
  open: { label: 'مفتوحة', badge: 'ui-badge ui-badge-green' },
  pending: { label: 'قيد المتابعة', badge: 'ui-badge ui-badge-amber' },
  closed: { label: 'مغلقة', badge: 'ui-badge ui-badge-neutral' },
};

const FILTERS = [
  { k: '', label: 'الكل' },
  { k: 'open', label: 'مفتوحة' },
  { k: 'pending', label: 'قيد المتابعة' },
  { k: 'closed', label: 'مغلقة' },
];

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const db = await createClient();
  const statusFilter = searchParams.status;

  let query = db
    .from('support_tickets')
    .select('id, subject, status, created_at, updated_at, profiles!support_tickets_owner_id_fkey(email, full_name, account_type)')
    .order('updated_at', { ascending: false })
    .limit(100);

  if (statusFilter && ['open', 'pending', 'closed'].includes(statusFilter)) {
    query = query.eq('status', statusFilter as any);
  }

  const { data: tickets } = await query;

  return (
    <main className="p-6 md:p-8 space-y-6">
      <header className="pb-5 border-b border-border">
        <p className="text-xs font-medium text-primary mb-1">خدمة العملاء</p>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
          تذاكر الدعم الفني
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          متابعة والرد على استفسارات المشترين والبائعين.
        </p>
      </header>

      <section className="ui-box flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <nav className="flex flex-wrap items-center gap-2" aria-label="تصفية التذاكر حسب الحالة">
          {FILTERS.map(f => (
            <Link
              key={f.k}
              href={f.k ? `/admin/support?status=${f.k}` : '/admin/support'}
              className={`ui-chip ${(statusFilter ?? '') === f.k ? 'ui-chip-active' : ''}`}
            >
              {f.label}
            </Link>
          ))}
        </nav>
        <p className="text-xs text-muted-foreground">
          التذاكر المعروضة:{' '}
          <span className="ui-num font-semibold text-foreground">{tickets?.length ?? 0}</span>
        </p>
      </section>

      <section className="ui-table-wrap">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th className="text-right font-semibold px-3.5 py-2.5">الموضوع</th>
              <th className="text-right font-semibold px-3.5 py-2.5">صاحب التذكرة</th>
              <th className="text-right font-semibold px-3.5 py-2.5">الحالة</th>
              <th className="text-right font-semibold px-3.5 py-2.5">آخر تحديث</th>
              <th className="px-3.5 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {(tickets ?? []).map((t: any) => {
              const st = STATUS_META[t.status] ?? STATUS_META.open;
              return (
                <tr key={t.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-3.5 py-3 font-medium text-foreground">{t.subject}</td>
                  <td className="px-3.5 py-3 text-xs">
                    <div className="font-medium text-foreground">
                      {t.profiles?.full_name ?? '—'}
                    </div>
                    <div className="text-muted-foreground ui-num" dir="ltr">
                      {t.profiles?.email ?? '—'}
                    </div>
                  </td>
                  <td className="px-3.5 py-3">
                    <span className={st.badge}>{st.label}</span>
                  </td>
                  <td className="px-3.5 py-3 text-xs text-muted-foreground ui-num">
                    {new Date(t.updated_at).toLocaleString('ar')}
                  </td>
                  <td className="px-3.5 py-3 text-left">
                    <Link
                      href={`/admin/support/${t.id}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-muted"
                    >
                      عرض والرد ←
                    </Link>
                  </td>
                </tr>
              );
            })}
            {!tickets?.length && (
              <tr>
                <td colSpan={5} className="p-10 text-center text-sm text-muted-foreground">
                  لا توجد تذاكر مطابقة للفلاتر الحالية.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
