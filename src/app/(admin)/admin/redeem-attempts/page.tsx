import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

const RESULT_LABELS: Record<string, { label: string; cls: string }> = {
  success: { label: 'نجح', cls: 'bg-green-100 text-green-800' },
  not_found: { label: 'كود خاطئ', cls: 'bg-red-100 text-red-800' },
  expired: { label: 'منتهي', cls: 'bg-orange-100 text-orange-800' },
  revoked: { label: 'ملغى', cls: 'bg-red-100 text-red-800' },
  already_redeemed: { label: 'مُفعّل مسبقًا', cls: 'bg-yellow-100 text-yellow-800' },
  not_delivered: { label: 'لم يُسلَّم', cls: 'bg-gray-100 text-gray-800' },
  forbidden: { label: 'غير مصرح', cls: 'bg-red-100 text-red-800' },
  rate_limited: { label: 'Rate limited', cls: 'bg-purple-100 text-purple-800' },
  error: { label: 'خطأ', cls: 'bg-gray-100 text-gray-800' },
};

export default async function RedeemAttemptsPage({
  searchParams,
}: {
  searchParams: { result?: string; page?: string };
}) {
  const db = await createClient();
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10));
  const perPage = 50;

  let q = db
    .from('redeem_attempts')
    .select('id, ip, user_id, email, code_hash_prefix, result, reason, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * perPage, page * perPage - 1);

  if (searchParams.result) q = q.eq('result', searchParams.result);

  const { data, count } = await q;
  const totalPages = Math.ceil((count ?? 0) / perPage);

  // Quick stats
  const { data: stats } = await db
    .from('redeem_attempts')
    .select('result')
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  const failures24h = (stats ?? []).filter((r: any) => r.result !== 'success').length;
  const successes24h = (stats ?? []).filter((r: any) => r.result === 'success').length;

  return (
    <main className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">محاولات تفعيل الأكواد</h1>
        <p className="text-sm text-muted-foreground mt-1">
          آخر 24 ساعة: {successes24h} ناجحة، {failures24h} فاشلة
        </p>
      </div>

      <div className="flex gap-2 flex-wrap text-sm">
        <Link href="/admin/redeem-attempts" className="border rounded px-3 py-1">الكل</Link>
        {Object.entries(RESULT_LABELS).map(([k, v]) => (
          <Link
            key={k}
            href={`/admin/redeem-attempts?result=${k}`}
            className={`border rounded px-3 py-1 ${searchParams.result === k ? 'bg-accent' : ''}`}
          >
            {v.label}
          </Link>
        ))}
      </div>

      <div className="border rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-right p-3">التاريخ</th>
              <th className="text-right p-3">النتيجة</th>
              <th className="text-right p-3">المستخدم</th>
              <th className="text-right p-3">IP</th>
              <th className="text-right p-3">بادئة الكود</th>
              <th className="text-right p-3">السبب</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((row: any) => {
              const r = RESULT_LABELS[row.result] ?? { label: row.result, cls: 'bg-gray-100' };
              return (
                <tr key={row.id} className="border-t">
                  <td className="p-3 text-xs text-muted-foreground">
                    {new Date(row.created_at).toLocaleString('ar')}
                  </td>
                  <td className="p-3">
                    <span className={`text-xs px-2 py-0.5 rounded ${r.cls}`}>{r.label}</span>
                  </td>
                  <td className="p-3 text-xs" dir="ltr">{row.email ?? '—'}</td>
                  <td className="p-3 text-xs font-mono" dir="ltr">{row.ip ?? '—'}</td>
                  <td className="p-3 text-xs font-mono" dir="ltr">{row.code_hash_prefix ?? '—'}</td>
                  <td className="p-3 text-xs text-muted-foreground max-w-xs truncate">
                    {row.reason ?? '—'}
                  </td>
                </tr>
              );
            })}
            {!data?.length && (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">لا توجد محاولات</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-between text-sm">
          <span>الصفحة {page} من {totalPages}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/admin/redeem-attempts?${new URLSearchParams({ ...searchParams, page: String(page - 1) })}`}
                className="border rounded px-3 py-1"
              >
                السابق
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/admin/redeem-attempts?${new URLSearchParams({ ...searchParams, page: String(page + 1) })}`}
                className="border rounded px-3 py-1"
              >
                التالي
              </Link>
            )}
          </div>
        </div>
      )}
    </main>
  );
}