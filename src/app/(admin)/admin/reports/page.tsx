import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

const STATUS_META: Record<string, { label: string; badge: string }> = {
  open: { label: 'مفتوحة', badge: 'ui-badge ui-badge-green' },
  resolved: { label: 'معالجة', badge: 'ui-badge ui-badge-green' },
  dismissed: { label: 'مرفوضة', badge: 'ui-badge ui-badge-red' },
};

const ENTITY_LABEL: Record<string, string> = {
  product: 'منتج',
  products: 'منتج',
  review: 'تقييم',
  reviews: 'تقييم',
  seller: 'بائع',
  seller_profile: 'بائع',
  buyer: 'مشتري',
  user: 'مستخدم',
  order: 'طلب',
  purchase_request: 'طلب شراء',
  ticket: 'تذكرة',
  report: 'بلاغ',
};

const FILTERS = [
  { k: 'open', label: 'مفتوحة' },
  { k: 'resolved', label: 'معالجة' },
  { k: 'dismissed', label: 'مرفوضة' },
  { k: '', label: 'الكل' },
];

export default async function ReportsPage(props: { searchParams: Promise<{ status?: string }> }) {
  const searchParams = await props.searchParams;
  const db = await createClient();
  let q = db
    .from('content_reports')
    .select('id, entity_type, entity_id, reason, status, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (searchParams.status) q = q.eq('status', searchParams.status);

  const { data } = await q;

  return (
    <main className="p-6 md:p-8 space-y-6">
      <header className="pb-5 border-b border-border">
        <p className="text-xs font-medium text-primary mb-1">الإشراف على المحتوى</p>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
          البلاغات
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          مراجعة البلاغات الواردة على المنتجات والتقييمات واتخاذ القرار المناسب بشأنها.
        </p>
      </header>

      <section className="ui-box flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <nav className="flex flex-wrap items-center gap-2" aria-label="تصفية البلاغات حسب الحالة">
          {FILTERS.map(f => (
            <Link
              key={f.k}
              href={f.k ? `/admin/reports?status=${f.k}` : '/admin/reports'}
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
              <th className="text-right font-semibold px-3.5 py-2.5">النوع</th>
              <th className="text-right font-semibold px-3.5 py-2.5">السبب</th>
              <th className="text-right font-semibold px-3.5 py-2.5">الحالة</th>
              <th className="text-right font-semibold px-3.5 py-2.5">التاريخ</th>
              <th className="px-3.5 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {(data ?? []).map(r => {
              const meta = STATUS_META[r.status] ?? { label: 'غير محددة', badge: 'ui-badge ui-badge-neutral' };
              return (
                <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-3.5 py-3 text-xs text-foreground">
                    {ENTITY_LABEL[r.entity_type] ?? r.entity_type}
                  </td>
                  <td className="px-3.5 py-3 text-xs text-muted-foreground max-w-xs truncate">
                    {r.reason}
                  </td>
                  <td className="px-3.5 py-3">
                    <span className={meta.badge}>{meta.label}</span>
                  </td>
                  <td className="px-3.5 py-3 text-xs text-muted-foreground ui-num">
                    {new Date(r.created_at).toLocaleDateString('ar')}
                  </td>
                  <td className="px-3.5 py-3">
                    <Link
                      href={`/admin/reports/${r.id}`}
                      className="inline-flex items-center rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-muted"
                    >
                      عرض
                    </Link>
                  </td>
                </tr>
              );
            })}
            {!data?.length && (
              <tr>
                <td colSpan={5} className="p-10 text-center text-sm text-muted-foreground">
                  لا توجد بلاغات مطابقة للفلاتر الحالية.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
