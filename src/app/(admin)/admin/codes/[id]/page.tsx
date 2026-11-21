import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { CodeActions } from './code-actions';

export default async function CodeDetailPage({ params }: { params: { id: string } }) {
  const db = await createClient();
  const { data: code } = await db
    .from('purchase_codes')
    .select(`
      *,
      order_items!inner(products!inner(title), orders!inner(purchase_requests!inner(customer_email, customer_phone)))
    `)
    .eq('id', params.id)
    .single();

  if (!code) notFound();

  const { data: attempts } = await db
    .from('code_delivery_attempts')
    .select('channel, sent_at, result, error')
    .eq('code_id', params.id)
    .order('sent_at', { ascending: false });

  const { data: redemptions } = await db
    .from('code_redemptions')
    .select('redeemed_at, ip, session_id')
    .eq('code_id', params.id)
    .maybeSingle();

  return (
    <main className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-mono">{code.code_prefix}••••</h1>
        <p className="text-muted-foreground text-sm mt-1">{code.order_items.products.title}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="border rounded p-3">
          <p className="text-muted-foreground">الحالة</p>
          <p className="font-medium mt-1">{code.status}</p>
        </div>
        <div className="border rounded p-3">
          <p className="text-muted-foreground">أُصدر</p>
          <p className="font-medium mt-1">{new Date(code.issued_at).toLocaleString('ar')}</p>
        </div>
        <div className="border rounded p-3">
          <p className="text-muted-foreground">ينتهي</p>
          <p className="font-medium mt-1">{new Date(code.expires_at).toLocaleString('ar')}</p>
        </div>
        <div className="border rounded p-3">
          <p className="text-muted-foreground">التسليم</p>
          <p className="font-medium mt-1">
            {code.delivered_at
              ? `تم في ${new Date(code.delivered_at).toLocaleString('ar')} (${code.delivery_confirmation_method})`
              : 'لم يُسلَّم بعد'}
          </p>
        </div>
      </div>

      <CodeActions codeId={params.id} status={code.status} />

      <section>
        <h2 className="font-semibold mb-2">محاولات الإرسال ({attempts?.length ?? 0})</h2>
        <div className="border rounded divide-y text-sm">
          {(attempts ?? []).map((a, i) => (
            <div key={i} className="p-3 flex justify-between">
              <span>{a.channel} — {a.result}</span>
              <span className="text-muted-foreground text-xs">{new Date(a.sent_at).toLocaleString('ar')}</span>
            </div>
          ))}
          {!attempts?.length && <p className="p-3 text-muted-foreground">لا يوجد</p>}
        </div>
      </section>

      {redemptions && (
        <section className="border rounded p-3 text-sm">
          <p className="font-medium mb-1">تم التفعيل</p>
          <p className="text-muted-foreground">{new Date(redemptions.redeemed_at).toLocaleString('ar')}</p>
          <p className="text-muted-foreground text-xs mt-1">IP: {redemptions.ip ?? '—'}</p>
        </section>
      )}
    </main>
  );
}