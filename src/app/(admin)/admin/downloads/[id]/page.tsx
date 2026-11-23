import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { SessionActions } from './session-actions';

type BadgeTone = 'green' | 'amber' | 'red' | 'blue' | 'neutral';

const STATUS_META: Record<string, { label: string; tone: BadgeTone }> = {
  active: { label: 'نشطة', tone: 'green' },
  compensation_active: { label: 'تعويضية نشطة', tone: 'blue' },
  expired_partial: { label: 'منتهية جزئيًا', tone: 'amber' },
  expired: { label: 'منتهية', tone: 'red' },
  exhausted: { label: 'مستنفدة', tone: 'red' },
  completed: { label: 'مكتملة', tone: 'green' },
  revoked: { label: 'ملغاة', tone: 'red' },
};

const DELIVERY_TYPE_LABELS: Record<string, string> = {
  zip: 'ملف مضغوط',
  single: 'ملف مفرد',
  individual: 'ملف مفرد',
};

export default async function SessionDetailPage({ params }: { params: { id: string } }) {
  const db = await createClient();
  const { data: session } = await db
    .from('download_sessions')
    .select(`
      *,
      order_items!inner(
        products!inner(title),
        orders!inner(purchase_requests!inner(customer_email, buyer_id))
      )
    `)
    .eq('id', params.id)
    .single();

  if (!session) notFound();

  const { data: deliveries } = await db
    .from('download_deliveries')
    .select('file_version_id, delivered_at, completed, delivery_type')
    .eq('session_id', params.id);

  const hasDelivery = (deliveries ?? []).some(d => d.completed);
  const statusMeta = STATUS_META[session.status] ?? { label: 'غير معروف', tone: 'neutral' as const };

  return (
    <main className="p-6 md:p-8 space-y-6">
      <header className="pb-5 border-b border-border">
        <p className="text-xs font-medium text-primary mb-1">التسليم</p>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
          تفاصيل جلسة التنزيل
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          المنتج: <span className="font-medium text-foreground">{session.order_items.products.title}</span>
          {' — '}
          <span className="ui-num" dir="ltr">
            {session.order_items.orders.purchase_requests.customer_email ?? '—'}
          </span>
        </p>
        <Link
          href="/admin/downloads"
          className="mt-3 inline-flex items-center text-xs font-medium text-primary hover:underline"
        >
          العودة إلى جلسات التنزيل
        </Link>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="ui-box">
          <p className="text-xs text-muted-foreground">الحالة</p>
          <div className="mt-2">
            <span className={`ui-badge ui-badge-${statusMeta.tone}`}>{statusMeta.label}</span>
          </div>
        </div>
        <div className="ui-box">
          <p className="text-xs text-muted-foreground">النوع</p>
          <div className="mt-2">
            <span className={`ui-badge ${session.is_compensation ? 'ui-badge-blue' : 'ui-badge-neutral'}`}>
              {session.is_compensation ? 'تعويضية' : 'عادية'}
            </span>
          </div>
        </div>
        <div className="ui-box">
          <p className="text-xs text-muted-foreground">انتهاء</p>
          <p className="mt-1.5 text-sm font-medium text-foreground ui-num">
            {new Date(session.expires_at).toLocaleString('ar')}
          </p>
        </div>
        <div className="ui-box">
          <p className="text-xs text-muted-foreground">بدأ التسليم</p>
          <div className="mt-2">
            <span className={`ui-badge ${hasDelivery ? 'ui-badge-green' : 'ui-badge-neutral'}`}>
              {hasDelivery ? 'نعم' : 'لا'}
            </span>
          </div>
        </div>
      </section>

      <SessionActions sessionId={params.id} status={session.status} hasDelivery={hasDelivery} />

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-foreground">التسليمات</h2>
          <span className="text-xs text-muted-foreground">
            <span className="ui-num font-semibold text-foreground">{deliveries?.length ?? 0}</span> تسليم
          </span>
        </div>
        <div className="ui-table-wrap">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr>
                <th className="text-right font-semibold px-3.5 py-2.5">ملف الإصدار</th>
                <th className="text-right font-semibold px-3.5 py-2.5">النوع</th>
                <th className="text-right font-semibold px-3.5 py-2.5">الحالة</th>
                <th className="text-right font-semibold px-3.5 py-2.5">التوقيت</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {(deliveries ?? []).map((d, i) => (
                <tr key={i} className="hover:bg-muted/20 transition-colors">
                  <td className="px-3.5 py-3 text-xs font-medium text-foreground font-mono ui-num">
                    {d.file_version_id.slice(0, 8)}...
                  </td>
                  <td className="px-3.5 py-3 text-xs text-muted-foreground">
                    {DELIVERY_TYPE_LABELS[d.delivery_type ?? ''] ?? (
                      d.delivery_type ? <span className="ui-num" dir="ltr">{d.delivery_type}</span> : '—'
                    )}
                  </td>
                  <td className="px-3.5 py-3">
                    <span className={`ui-badge ${d.completed ? 'ui-badge-green' : 'ui-badge-amber'}`}>
                      {d.completed ? 'مكتمل' : 'غير مكتمل'}
                    </span>
                  </td>
                  <td className="px-3.5 py-3 text-xs text-muted-foreground ui-num">
                    {new Date(d.delivered_at).toLocaleString('ar')}
                  </td>
                </tr>
              ))}
              {!deliveries?.length && (
                <tr>
                  <td colSpan={4} className="p-10 text-center text-sm text-muted-foreground">
                    لا توجد تسليمات مسجّلة لهذه الجلسة.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
