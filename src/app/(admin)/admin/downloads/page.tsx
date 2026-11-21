import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

export default async function DownloadsPage({ searchParams }: { searchParams: { status?: string } }) {
  const db = await createClient();
  let q = db
    .from('download_sessions')
    .select(`
      id, status, started_at, expires_at, is_compensation,
      order_items!inner(products!inner(title))
    `)
    .order('started_at', { ascending: false })
    .limit(100);

  if (searchParams.status) q = q.eq('status', searchParams.status);

  const { data } = await q;

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold mb-6">جلسات التنزيل</h1>

      <div className="flex gap-2 mb-4 text-sm">
        <Link href="/admin/downloads" className="border rounded px-3 py-1">الكل</Link>
        <Link href="/admin/downloads?status=active" className="border rounded px-3 py-1">نشطة</Link>
        <Link href="/admin/downloads?status=expired_partial" className="border rounded px-3 py-1">جزئية</Link>
        <Link href="/admin/downloads?status=compensation_active" className="border rounded px-3 py-1">تعويضية</Link>
      </div>

      <div className="border rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-right p-3">المنتج</th>
              <th className="text-right p-3">الحالة</th>
              <th className="text-right p-3">البداية</th>
              <th className="text-right p-3">الانتهاء</th>
              <th className="text-right p-3">النوع</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((row: any) => (
              <tr key={row.id} className="border-t">
                <td className="p-3">{row.order_items.products.title}</td>
                <td className="p-3 text-xs">{row.status}</td>
                <td className="p-3 text-xs text-muted-foreground">{new Date(row.started_at).toLocaleString('ar')}</td>
                <td className="p-3 text-xs text-muted-foreground">{new Date(row.expires_at).toLocaleString('ar')}</td>
                <td className="p-3 text-xs">{row.is_compensation ? 'تعويضية' : 'عادية'}</td>
                <td className="p-3"><Link href={`/admin/downloads/${row.id}`} className="text-primary text-sm">عرض</Link></td>
              </tr>
            ))}
            {!data?.length && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">لا توجد جلسات</td></tr>}
          </tbody>
        </table>
      </div>
    </main>
  );
}