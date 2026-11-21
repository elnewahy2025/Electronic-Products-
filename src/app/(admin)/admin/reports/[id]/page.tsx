import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { ResolveForm } from './resolve-form';

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

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">بلاغ #{report.id.slice(0, 8)}</h1>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="border rounded p-3">
          <p className="text-xs text-muted-foreground">النوع</p>
          <p>{report.entity_type}</p>
        </div>
        <div className="border rounded p-3">
          <p className="text-xs text-muted-foreground">المُبلّغ</p>
          <p>{(report as any).profiles?.email ?? 'زائر'}</p>
        </div>
        <div className="border rounded p-3">
          <p className="text-xs text-muted-foreground">الحالة</p>
          <p>{report.status}</p>
        </div>
        <div className="border rounded p-3">
          <p className="text-xs text-muted-foreground">التاريخ</p>
          <p>{new Date(report.created_at).toLocaleString('ar')}</p>
        </div>
      </div>

      <div className="border rounded p-3">
        <p className="text-xs text-muted-foreground mb-1">السبب</p>
        <p className="whitespace-pre-wrap text-sm">{report.reason}</p>
      </div>

      {target && (
        <div className="border rounded p-3">
          <p className="text-xs text-muted-foreground mb-1">الكيان المُبلَّغ عنه</p>
          <p className="font-medium">{target.title}</p>
          {target.extra && <p className="text-sm text-muted-foreground mt-1">{target.extra}</p>}
          {target.href && (
            <a href={target.href} target="_blank" className="text-primary text-xs mt-2 inline-block">
              فتح في تبويب جديد ↗
            </a>
          )}
        </div>
      )}

      {report.status === 'open' && <ResolveForm reportId={report.id} />}

      {report.status !== 'open' && report.resolution_note && (
        <div className="border rounded p-3 bg-muted/30">
          <p className="text-xs text-muted-foreground mb-1">قرار المعالجة</p>
          <p className="text-sm">{report.resolution_note}</p>
        </div>
      )}
    </main>
  );
}