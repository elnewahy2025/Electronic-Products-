import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

const RESULT_LABELS: Record<string, { label: string; cls: string }> = {
  success: { label: 'نجح', cls: 'ui-badge-green' },
  not_found: { label: 'كود خاطئ', cls: 'ui-badge-red' },
  expired: { label: 'منتهي', cls: 'ui-badge-red' },
  revoked: { label: 'ملغى', cls: 'ui-badge-red' },
  already_redeemed: { label: 'مُفعّل مسبقًا', cls: 'ui-badge-amber' },
  not_delivered: { label: 'لم يُسلَّم', cls: 'ui-badge-amber' },
  forbidden: { label: 'غير مصرح', cls: 'ui-badge-red' },
  rate_limited: { label: 'تجاوز حد المحاولات', cls: 'ui-badge-amber' },
  error: { label: 'خطأ', cls: 'ui-badge-red' },
};

export default async function RedeemAttemptsPage(
  props: {
    searchParams: Promise<{ result?: string; page?: string }>;
  }
) {
  const searchParams = await props.searchParams;
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
    <main className="p-6 md:p-8 space-y-6">
      <header className="pb-5 border-b border-border">
        <p className="text-xs font-medium text-primary mb-1">الأمان ومحاولات التفعيل</p>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
          محاولات تفعيل الأكواد
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          سجل محاولات تفعيل أكواد الشراء، مع مؤشرات سريعة لآخر 24 ساعة.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
          <div className="ui-stat">
            <div className="text-2xl font-bold leading-tight ui-num text-success">{successes24h}</div>
            <span className="text-[13px] text-muted-foreground mt-1 block">محاولات ناجحة (24 ساعة)</span>
          </div>
          <div className="ui-stat">
            <div className="text-2xl font-bold leading-tight ui-num text-destructive">{failures24h}</div>
            <span className="text-[13px] text-muted-foreground mt-1 block">محاولات فاشلة (24 ساعة)</span>
          </div>
        </div>
      </header>

      <section className="ui-box">
        <nav className="flex flex-wrap items-center gap-2" aria-label="تصفية المحاولات حسب النتيجة">
          <Link
            href="/admin/redeem-attempts"
            className={`ui-chip ${!searchParams.result ? 'ui-chip-active' : ''}`}
          >
            الكل
          </Link>
          {Object.entries(RESULT_LABELS).map(([k, v]) => (
            <Link
              key={k}
              href={`/admin/redeem-attempts?result=${k}`}
              className={`ui-chip ${searchParams.result === k ? 'ui-chip-active' : ''}`}
            >
              {v.label}
            </Link>
          ))}
        </nav>
      </section>

      <section className="ui-table-wrap">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th className="text-right font-semibold px-3.5 py-2.5">التاريخ</th>
              <th className="text-right font-semibold px-3.5 py-2.5">النتيجة</th>
              <th className="text-right font-semibold px-3.5 py-2.5">المستخدم</th>
              <th className="text-right font-semibold px-3.5 py-2.5">IP</th>
              <th className="text-right font-semibold px-3.5 py-2.5">بادئة الكود</th>
              <th className="text-right font-semibold px-3.5 py-2.5">السبب</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {(data ?? []).map((row: any) => {
              const r = RESULT_LABELS[row.result] ?? { label: row.result, cls: 'ui-badge-neutral' };
              return (
                <tr key={row.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-3.5 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    <span className="ui-num">{new Date(row.created_at).toLocaleString('ar')}</span>
                  </td>
                  <td className="px-3.5 py-3 text-xs">
                    <span className={`ui-badge ${r.cls}`}>{r.label}</span>
                  </td>
                  <td className="px-3.5 py-3 text-xs font-mono" dir="ltr">{row.email ?? '—'}</td>
                  <td className="px-3.5 py-3 text-xs text-muted-foreground ui-num" dir="ltr">{row.ip ?? '—'}</td>
                  <td className="px-3.5 py-3 text-xs text-muted-foreground ui-num" dir="ltr">
                    {row.code_hash_prefix ?? '—'}
                  </td>
                  <td className="px-3.5 py-3 text-xs text-muted-foreground max-w-xs truncate">
                    {row.reason ?? '—'}
                  </td>
                </tr>
              );
            })}
            {!data?.length && (
              <tr>
                <td colSpan={6} className="p-10 text-center text-sm text-muted-foreground">
                  لا توجد محاولات تفعيل لعرضها.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {totalPages > 1 && (
        <section className="ui-box flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            الصفحة <span className="ui-num">{page}</span> من <span className="ui-num">{totalPages}</span>
          </p>
          <nav className="flex items-center gap-2" aria-label="التنقل بين الصفحات">
            {page > 1 && (
              <Link
                href={`/admin/redeem-attempts?${new URLSearchParams({ ...searchParams, page: String(page - 1) })}`}
                className="ui-chip"
              >
                السابق
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/admin/redeem-attempts?${new URLSearchParams({ ...searchParams, page: String(page + 1) })}`}
                className="ui-chip"
              >
                التالي
              </Link>
            )}
          </nav>
        </section>
      )}
    </main>
  );
}
