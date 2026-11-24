import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { CodeActions } from './code-actions';

type BadgeTone = 'green' | 'amber' | 'red' | 'blue' | 'neutral';

const STATUS_META: Record<string, { label: string; tone: BadgeTone }> = {
  issued: { label: 'صادر', tone: 'blue' },
  delivered: { label: 'تم التسليم', tone: 'green' },
  redeemed: { label: 'مُفعّل', tone: 'green' },
  expired: { label: 'منتهي', tone: 'red' },
  revoked: { label: 'ملغى', tone: 'red' },
};

const CHANNEL_LABELS: Record<string, string> = {
  email: 'بريد إلكتروني',
  sms: 'رسالة نصية',
  manual: 'تسليم يدوي',
};

const DELIVERY_METHOD_LABEL: Record<string, string> = {
  auto: 'تلقائي',
  manual: 'يدوي',
};

const ATTEMPT_RESULT_META: Record<string, { label: string; tone: BadgeTone }> = {
  sent: { label: 'تم الإرسال', tone: 'green' },
  failed: { label: 'فشل', tone: 'red' },
  error: { label: 'فشل', tone: 'red' },
};

export default async function CodeDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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

  const statusMeta = STATUS_META[code.status] ?? { label: 'غير معروف', tone: 'neutral' as const };

  return (
    <main className="p-6 md:p-8 space-y-6">
      <header className="pb-5 border-b border-border">
        <p className="text-xs font-medium text-primary mb-1">المبيعات</p>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
          تفاصيل الكود <span className="ui-num font-mono">{code.code_prefix}••••</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          متابعة حالة الكود وتسليمه للمنتج:{' '}
          <span className="font-medium text-foreground">{code.order_items.products.title}</span>
        </p>
        <Link
          href="/admin/codes"
          className="mt-3 inline-flex items-center text-xs font-medium text-primary hover:underline"
        >
          العودة إلى أكواد الشراء
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
          <p className="text-xs text-muted-foreground">أُصدر</p>
          <p className="mt-1.5 text-sm font-medium text-foreground ui-num">
            {new Date(code.issued_at).toLocaleString('ar')}
          </p>
        </div>
        <div className="ui-box">
          <p className="text-xs text-muted-foreground">ينتهي</p>
          <p className="mt-1.5 text-sm font-medium text-foreground ui-num">
            {new Date(code.expires_at).toLocaleString('ar')}
          </p>
        </div>
        <div className="ui-box">
          <p className="text-xs text-muted-foreground">التسليم</p>
          {code.delivered_at ? (
            <div className="mt-2 space-y-1.5">
              <span className="ui-badge ui-badge-green">تم التسليم</span>
              <p className="text-xs text-muted-foreground">
                في <span className="ui-num">{new Date(code.delivered_at).toLocaleString('ar')}</span>
                {' '}({DELIVERY_METHOD_LABEL[code.delivery_confirmation_method ?? ''] ?? (
                  <span className="ui-num" dir="ltr">{code.delivery_confirmation_method}</span>
                )})
              </p>
            </div>
          ) : (
            <div className="mt-2">
              <span className="ui-badge ui-badge-amber">لم يُسلَّم بعد</span>
            </div>
          )}
        </div>
      </section>

      <CodeActions codeId={params.id} status={code.status} />

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-foreground">محاولات الإرسال</h2>
          <span className="text-xs text-muted-foreground">
            <span className="ui-num font-semibold text-foreground">{attempts?.length ?? 0}</span> محاولة
          </span>
        </div>
        <div className="ui-table-wrap">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr>
                <th className="text-right font-semibold px-3.5 py-2.5">القناة</th>
                <th className="text-right font-semibold px-3.5 py-2.5">النتيجة</th>
                <th className="text-right font-semibold px-3.5 py-2.5">التوقيت</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {(attempts ?? []).map((a, i) => {
                const resultMeta = ATTEMPT_RESULT_META[a.result ?? ''] ?? {
                  label: 'غير معروف',
                  tone: 'neutral' as const,
                };
                return (
                  <tr key={i} className="hover:bg-muted/20 transition-colors">
                    <td className="px-3.5 py-3 text-sm text-foreground">
                      {CHANNEL_LABELS[a.channel ?? ''] ?? (
                        a.channel ? <span className="ui-num" dir="ltr">{a.channel}</span> : '—'
                      )}
                    </td>
                    <td className="px-3.5 py-3">
                      <span className={`ui-badge ui-badge-${resultMeta.tone}`}>{resultMeta.label}</span>
                    </td>
                    <td className="px-3.5 py-3 text-xs text-muted-foreground ui-num">
                      {new Date(a.sent_at).toLocaleString('ar')}
                    </td>
                  </tr>
                );
              })}
              {!attempts?.length && (
                <tr>
                  <td colSpan={3} className="p-10 text-center text-sm text-muted-foreground">
                    لا توجد محاولات إرسال مسجّلة لهذا الكود.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {redemptions && (
        <section className="ui-box space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">تم التفعيل</h2>
            <span className="ui-badge ui-badge-green">مُفعّل</span>
          </div>
          <p className="text-xs text-muted-foreground">
            وقت التفعيل:{' '}
            <span className="ui-num text-foreground">
              {new Date(redemptions.redeemed_at).toLocaleString('ar')}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            IP: <span className="ui-num text-foreground" dir="ltr">{String(redemptions.ip ?? '—')}</span>
          </p>
        </section>
      )}
    </main>
  );
}
