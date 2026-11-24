import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { Enums } from '@/lib/types/database';

const STATUS_META: Record<string, { label: string; badge: string }> = {
  published: { label: 'منشور', badge: 'ui-badge ui-badge-green' },
  deleted: { label: 'محذوف', badge: 'ui-badge ui-badge-red' },
};

const FILTERS = [
  { k: '', label: 'الكل' },
  { k: 'published', label: 'منشور' },
  { k: 'deleted', label: 'محذوف' },
];

export default async function ReviewsPage(props: { searchParams: Promise<{ status?: string }> }) {
  const searchParams = await props.searchParams;
  const db = await createClient();
  let q = db
    .from('reviews')
    .select(`
      id, rating, body, status, created_at, delete_reason,
      products!inner(id, title, slug, seller_id),
      profiles:profiles!reviews_buyer_id_fkey(email)
    `)
    .order('created_at', { ascending: false })
    .limit(100);

  if (searchParams.status) q = q.eq('status', searchParams.status as Enums<'review_status_enum'>);

  const { data } = await q;

  return (
    <main className="p-6 md:p-8 space-y-6">
      <header className="pb-5 border-b border-border">
        <p className="text-xs font-medium text-primary mb-1">الإشراف على التقييمات</p>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
          التقييمات
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          يتم حذف التقييم من{' '}
          <Link href="/admin/support" className="font-medium text-primary hover:underline">
            تذاكر الدعم المرتبطة بطلبات البائعين
          </Link>{' '}
          فقط، بعد التأكد من عدم وجود حالة مفتوحة للمشتري.
        </p>
      </header>

      <section className="ui-box flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <nav className="flex flex-wrap items-center gap-2" aria-label="تصفية التقييمات حسب الحالة">
          {FILTERS.map(f => (
            <Link
              key={f.k}
              href={f.k ? `/admin/reviews?status=${f.k}` : '/admin/reviews'}
              className={`ui-chip ${(searchParams.status ?? '') === f.k ? 'ui-chip-active' : ''}`}
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
              <th className="text-right font-semibold px-3.5 py-2.5">المنتج</th>
              <th className="text-right font-semibold px-3.5 py-2.5">المشتري</th>
              <th className="text-right font-semibold px-3.5 py-2.5">النجوم</th>
              <th className="text-right font-semibold px-3.5 py-2.5">النص</th>
              <th className="text-right font-semibold px-3.5 py-2.5">الحالة</th>
              <th className="px-3.5 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {(data ?? []).map((row: any) => {
              const meta = STATUS_META[row.status] ?? STATUS_META.deleted;
              return (
                <tr key={row.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-3.5 py-3 font-medium text-foreground">{row.products.title}</td>
                  <td className="px-3.5 py-3 text-xs text-muted-foreground ui-num" dir="ltr">
                    {row.profiles.email}
                  </td>
                  <td className="px-3.5 py-3 text-sm text-warning ui-num" dir="ltr">
                    {'★'.repeat(row.rating)}{'☆'.repeat(5 - row.rating)}
                  </td>
                  <td className="px-3.5 py-3 text-xs text-muted-foreground max-w-xs truncate">
                    {row.body ?? '—'}
                  </td>
                  <td className="px-3.5 py-3">
                    <span className={meta.badge}>{meta.label}</span>
                  </td>
                  <td className="px-3.5 py-3 text-xs text-muted-foreground">
                    {row.status === 'published' ? 'عبر تذكرة البائع' : '—'}
                  </td>
                </tr>
              );
            })}
            {!data?.length && (
              <tr>
                <td colSpan={6} className="p-10 text-center text-sm text-muted-foreground">
                  لا توجد تقييمات مطابقة للفلاتر الحالية.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
