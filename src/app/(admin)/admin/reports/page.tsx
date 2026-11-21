import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

export default async function ReportsPage({ searchParams }: { searchParams: { status?: string } }) {
  const db = await createClient();
  let q = db
    .from('content_reports')
    .select('id, entity_type, entity_id, reason, status, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (searchParams.status) q = q.eq('status', searchParams.status);

  const { data } = await q;

  return (
    <main className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">البلاغات</h1>
        <div className="flex gap-2 text-sm">
          <Link href="/admin/reports?status=open" className="border rounded px-3 py-1">مفتوحة</Link>
          <Link href="/admin/reports?status=resolved" className="border rounded px-3 py-1">معالجة</Link>
          <Link href="/admin/reports?status=dismissed" className="border rounded px-3 py-1">مرفوضة</Link>
          <Link href="/admin/reports" className="border rounded px-3 py-1">الكل</Link>
        </div>
      </div>

      <div className="border rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-right p-3">النوع</th>
              <th className="text-right p-3">السبب</th>
              <th className="text-right p-3">الحالة</th>
              <th className="text-right p-3">التاريخ</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map(r => (
              <tr key={r.id} className="border-t">
                <td className="p-3 text-xs">{r.entity_type}</td>
                <td className="p-3 text-xs max-w-xs truncate">{r.reason}</td>
                <td className="p-3 text-xs">
                  <span className={
                    r.status === 'open' ? 'text-red-600'
                    : r.status === 'resolved' ? 'text-green-600'
                    : 'text-gray-600'
                  }>
                    {r.status}
                  </span>
                </td>
                <td className="p-3 text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleDateString('ar')}
                </td>
                <td className="p-3">
                  <Link href={`/admin/reports/${r.id}`} className="text-primary text-xs">
                    عرض
                  </Link>
                </td>
              </tr>
            ))}
            {!data?.length && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">لا توجد بلاغات</td></tr>}
          </tbody>
        </table>
      </div>
    </main>
  );
}