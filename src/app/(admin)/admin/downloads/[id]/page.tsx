import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { SessionActions } from './session-actions';

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

  return (
    <main className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{session.order_items.products.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {session.order_items.orders.purchase_requests.customer_email ?? '—'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="border rounded p-3">
          <p className="text-muted-foreground">الحالة</p>
          <p className="font-medium mt-1">{session.status}</p>
        </div>
        <div className="border rounded p-3">
          <p className="text-muted-foreground">النوع</p>
          <p className="font-medium mt-1">{session.is_compensation ? 'تعويضية' : 'عادية'}</p>
        </div>
        <div className="border rounded p-3">
          <p className="text-muted-foreground">انتهاء</p>
          <p className="font-medium mt-1">{new Date(session.expires_at).toLocaleString('ar')}</p>
        </div>
        <div className="border rounded p-3">
          <p className="text-muted-foreground">بدأ التسليم</p>
          <p className="font-medium mt-1">{hasDelivery ? 'نعم' : 'لا'}</p>
        </div>
      </div>

      <SessionActions sessionId={params.id} status={session.status} hasDelivery={hasDelivery} />

      <section>
        <h2 className="font-semibold mb-2">التسليمات ({deliveries?.length ?? 0})</h2>
        <div className="border rounded divide-y text-sm">
          {(deliveries ?? []).map((d, i) => (
            <div key={i} className="p-3 flex justify-between">
              <span className="font-mono text-xs">{d.file_version_id.slice(0, 8)}... — {d.delivery_type}</span>
              <span className="text-muted-foreground text-xs">
                {d.completed ? 'مكتمل' : 'غير مكتمل'} — {new Date(d.delivered_at).toLocaleString('ar')}
              </span>
            </div>
          ))}
          {!deliveries?.length && <p className="p-3 text-muted-foreground">لا يوجد</p>}
        </div>
      </section>
    </main>
  );
}