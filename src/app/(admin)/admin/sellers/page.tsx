import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

const STATUS_LABELS: Record<string, string> = {
  pending: 'بانتظار الموافقة',
  approved: 'معتمد',
  rejected: 'مرفوض',
  suspended: 'موقوف',
};

export default async function SellersListPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const db = await createClient();
  let q = db
    .from('seller_profiles')
    .select('profile_id, display_name, status, created_at, profiles:profiles!seller_profiles_profile_id_fkey(email, phone)')
    .order('created_at', { ascending: false })
    .limit(100);

  if (searchParams.status) q = q.eq('status', searchParams.status);

  const { data } = await q;

  return (
    <main className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">البائعون</h1>
        <div className="flex gap-2">
          <Link href="/admin/sellers" className="text-sm border rounded px-3 py-1">الكل</Link>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <Link
              key={k}
              href={`/admin/sellers?status=${k}`}
              className={`text-sm border rounded px-3 py-1 ${searchParams.status === k ? 'bg-accent' : ''}`}
            >
              {v}
            </Link>
          ))}
        </div>
      </div>

      <div className="border rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-right p-3">الاسم</th>
              <th className="text-right p-3">البريد</th>
              <th className="text-right p-3">الهاتف</th>
              <th className="text-right p-3">الحالة</th>
              <th className="text-right p-3">تاريخ التقديم</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((row: any) => (
              <tr key={row.profile_id} className="border-t">
                <td className="p-3">{row.display_name}</td>
                <td className="p-3">{row.profiles.email}</td>
                <td className="p-3">{row.profiles.phone ?? '—'}</td>
                <td className="p-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    row.status === 'approved' ? 'bg-green-100 text-green-800'
                    : row.status === 'pending' ? 'bg-yellow-100 text-yellow-800'
                    : row.status === 'rejected' ? 'bg-red-100 text-red-800'
                    : 'bg-gray-100 text-gray-800'
                  }`}>
                    {STATUS_LABELS[row.status]}
                  </span>
                </td>
                <td className="p-3 text-muted-foreground">
                  {new Date(row.created_at).toLocaleDateString('ar')}
                </td>
                <td className="p-3">
                  <Link href={`/admin/sellers/${row.profile_id}`} className="text-primary text-sm">
                    عرض
                  </Link>
                </td>
              </tr>
            ))}
            {!data?.length && (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">لا يوجد بائعون</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}