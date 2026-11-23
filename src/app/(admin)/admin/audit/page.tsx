import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { AuditFilters } from './audit-filters';

export default async function AuditPage(
  props: {
    searchParams: Promise<{ action?: string; actor?: string; from?: string; to?: string; page?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const db = await createClient();
  const page = parseInt(searchParams.page ?? '1', 10);
  const perPage = 50;
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  let q = db
    .from('audit_logs')
    .select('id, actor_id, actor_role, action, entity_type, entity_id, reason, created_at, ip', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (searchParams.action) q = q.ilike('action', `%${searchParams.action}%`);
  if (searchParams.actor) q = q.eq('actor_id', searchParams.actor);
  if (searchParams.from) q = q.gte('created_at', searchParams.from);
  if (searchParams.to) q = q.lte('created_at', searchParams.to);

  const { data, count } = await q;
  const totalPages = Math.ceil((count ?? 0) / perPage);

  return (
    <main className="p-6 md:p-8 space-y-6">
      <header className="pb-5 border-b border-border">
        <p className="text-xs font-medium text-primary mb-1">الحوكمة والشفافية</p>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
              سجل التدقيق
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              تتبّع جميع الإجراءات الإدارية المسجّلة مع بيانات المنفّذ والكيان المرتبط بها.
            </p>
          </div>
          <Link
            href="/api/admin/audit/export"
            className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            تصدير CSV
          </Link>
        </div>
      </header>

      <AuditFilters />

      <section className="ui-table-wrap">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th className="text-right font-semibold px-3.5 py-2.5">التاريخ</th>
              <th className="text-right font-semibold px-3.5 py-2.5">الحدث</th>
              <th className="text-right font-semibold px-3.5 py-2.5">المنفّذ</th>
              <th className="text-right font-semibold px-3.5 py-2.5">الكيان</th>
              <th className="text-right font-semibold px-3.5 py-2.5">السبب</th>
              <th className="px-3.5 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {(data ?? []).map(row => (
              <tr key={row.id} className="hover:bg-muted/20 transition-colors">
                <td className="px-3.5 py-3 text-xs text-muted-foreground ui-num">
                  {new Date(row.created_at).toLocaleString('ar')}
                </td>
                <td className="px-3.5 py-3 text-xs font-mono ui-num" dir="ltr">
                  {row.action}
                </td>
                <td className="px-3.5 py-3 text-xs text-foreground">{row.actor_role ?? '—'}</td>
                <td className="px-3.5 py-3 text-xs text-foreground">
                  {row.entity_type ?? '—'}
                  {row.entity_id && (
                    <span className="ui-num text-muted-foreground"> ({row.entity_id.slice(0, 8)})</span>
                  )}
                </td>
                <td className="px-3.5 py-3 text-xs text-muted-foreground max-w-xs truncate">
                  {row.reason ?? '—'}
                </td>
                <td className="px-3.5 py-3">
                  <Link
                    href={`/admin/audit/${row.id}`}
                    className="inline-flex items-center rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-muted"
                  >
                    تفاصيل
                  </Link>
                </td>
              </tr>
            ))}
            {!data?.length && (
              <tr>
                <td colSpan={6} className="p-10 text-center text-sm text-muted-foreground">
                  لا توجد أحداث مسجّلة مطابقة للفلاتر الحالية.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <nav className="ui-box flex flex-wrap items-center justify-between gap-3" aria-label="صفحات سجل التدقيق">
        <span className="text-xs text-muted-foreground">
          الصفحة <span className="ui-num font-semibold text-foreground">{page}</span> من{' '}
          <span className="ui-num font-semibold text-foreground">{totalPages || 1}</span>
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {page > 1 && (
            <Link
              href={`/admin/audit?${new URLSearchParams({ ...searchParams, page: String(page - 1) })}`}
              className="rounded-xl border border-border px-3.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              السابق
            </Link>
          )}
          {page < totalPages && (
            <Link
              href={`/admin/audit?${new URLSearchParams({ ...searchParams, page: String(page + 1) })}`}
              className="rounded-xl border border-border px-3.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              التالي
            </Link>
          )}
        </div>
      </nav>
    </main>
  );
}
