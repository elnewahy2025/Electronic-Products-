import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { AuditFilters } from './audit-filters';

export default async function AuditPage({
  searchParams,
}: {
  searchParams: { action?: string; actor?: string; from?: string; to?: string; page?: string };
}) {
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
    <main className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">سجل التدقيق</h1>
        <Link href="/api/admin/audit/export" className="text-sm border rounded px-3 py-1">
          تصدير CSV
        </Link>
      </div>

      <AuditFilters />

      <div className="border rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-right p-3">التاريخ</th>
              <th className="text-right p-3">الحدث</th>
              <th className="text-right p-3">المنفّذ</th>
              <th className="text-right p-3">الكيان</th>
              <th className="text-right p-3">السبب</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map(row => (
              <tr key={row.id} className="border-t">
                <td className="p-3 text-xs text-muted-foreground">
                  {new Date(row.created_at).toLocaleString('ar')}
                </td>
                <td className="p-3 font-mono text-xs">{row.action}</td>
                <td className="p-3 text-xs">{row.actor_role ?? '—'}</td>
                <td className="p-3 text-xs">
                  {row.entity_type ?? '—'}
                  {row.entity_id && ` (${row.entity_id.slice(0, 8)})`}
                </td>
                <td className="p-3 text-xs max-w-xs truncate">{row.reason ?? '—'}</td>
                <td className="p-3">
                  <Link href={`/admin/audit/${row.id}`} className="text-primary text-xs">تفاصيل</Link>
                </td>
              </tr>
            ))}
            {!data?.length && (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">لا توجد أحداث</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between text-sm">
        <span>الصفحة {page} من {totalPages || 1}</span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link
              href={`/admin/audit?${new URLSearchParams({ ...searchParams, page: String(page - 1) })}`}
              className="border rounded px-3 py-1"
            >
              السابق
            </Link>
          )}
          {page < totalPages && (
            <Link
              href={`/admin/audit?${new URLSearchParams({ ...searchParams, page: String(page + 1) })}`}
              className="border rounded px-3 py-1"
            >
              التالي
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}