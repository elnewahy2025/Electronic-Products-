import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { ResolveForm } from './resolve-form';

type BadgeTone = 'green' | 'amber' | 'red' | 'blue' | 'neutral';

const STATUS_META: Record<string, { label: string; tone: BadgeTone }> = {
  open: { label: 'مفتوحة', tone: 'green' },
  resolved: { label: 'معالجة', tone: 'green' },
  dismissed: { label: 'مرفوضة', tone: 'red' },
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

export default async function ReportDetailPage({ params }: { params: { id: string } }) {
  const db = await createClient();
  const { data: report } = await db
    .from('content_reports')
    .select('*, profiles!content_reports_reporter_id_fkey(email)')
    .eq('id', params.id)
    .single();

  if (!report) notFound();

  // Try to resolve the entity
  let target: { title: string; href?: string; extra?: string } | null = null;
  if (report.entity_type === 'product') {
    const { data: p } = await db
      .from('products')
      .select('title, slug')
      .eq('id', report.entity_id)
      .maybeSingle();
    if (p) target = { title: p.title, href: `/products/${p.slug}` };
  } else if (report.entity_type === 'review') {
    const { data: r } = await db
      .from('reviews')
      .select('rating, body, products!inner(title, slug)')
      .eq('id', report.entity_id)
      .maybeSingle();
    if (r) target = {
      title: `تقييم على «${(r as any).products.title}»`,
      extra: `${'★'.repeat(r.rating)} — ${r.body ?? 'بدون نص'}`,
    };
  }

  const statusMeta = STATUS_META[report.status] ?? { label: 'غير محددة', tone: 'neutral' as const };

  return (
    <main className="p-6 md:p-8 space-y-6">
      <header className="pb-5 border-b border-border">
        <p className="text-xs font-medium text-primary mb-1">الإشراف على المحتوى</p>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
          تفاصيل البلاغ <span className="ui-num">#{report.id.slice(0, 8)}</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          مراجعة سبب البلاغ والكيان المُبلَّغ عنه واتخاذ القرار المناسب.
        </p>
        <Link
          href="/admin/reports"
          className="mt-3 inline-flex items-center text-xs font-medium text-primary hover:underline"
        >
          العودة إلى البلاغات
        </Link>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="ui-box">
          <p className="text-xs text-muted-foreground">النوع</p>
          <p className="mt-1.5 text-sm font-medium text-foreground">
            {ENTITY_LABEL[report.entity_type] ?? (
              <span className="ui-num" dir="ltr">{report.entity_type}</span>
            )}
          </p>
        </div>
        <div className="ui-box">
          <p className="text-xs text-muted-foreground">المُبلّغ</p>
          <p className="mt-1.5 text-sm font-medium text-foreground">
            {(report as any).profiles?.email ? (
              <span className="ui-num" dir="ltr">{(report as any).profiles?.email}</span>
            ) : (
              'زائر'
            )}
          </p>
        </div>
        <div className="ui-box">
          <p className="text-xs text-muted-foreground">الحالة</p>
          <div className="mt-2">
            <span className={`ui-badge ui-badge-${statusMeta.tone}`}>{statusMeta.label}</span>
          </div>
        </div>
        <div className="ui-box">
          <p className="text-xs text-muted-foreground">التاريخ</p>
          <p className="mt-1.5 text-sm font-medium text-foreground ui-num">
            {new Date(report.created_at).toLocaleString('ar')}
          </p>
        </div>
      </section>

      <section className="ui-box">
        <p className="text-xs font-medium text-muted-foreground mb-1">السبب</p>
        <p className="whitespace-pre-wrap text-sm text-foreground">{report.reason}</p>
      </section>

      {target && (
        <section className="ui-box space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">الكيان المُبلَّغ عنه</p>
          <p className="text-sm font-semibold text-foreground">{target.title}</p>
          {target.extra && <p className="text-sm text-muted-foreground">{target.extra}</p>}
          {target.href && (
            <a href={target.href} target="_blank" className="text-primary text-xs mt-2 inline-block hover:underline">
              فتح في تبويب جديد ↗
            </a>
          )}
        </section>
      )}

      {report.status === 'open' && <ResolveForm reportId={report.id} />}

      {report.status !== 'open' && report.resolution_note && (
        <section className="ui-box">
          <p className="text-xs font-medium text-muted-foreground mb-1">قرار المعالجة</p>
          <p className="text-sm text-foreground">{report.resolution_note}</p>
        </section>
      )}
    </main>
  );
}
