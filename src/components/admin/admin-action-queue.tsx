'use client';

import Link from 'next/link';
import { useState } from 'react';

type QueueRequest = {
  id: string;
  request_number: string | null;
  buyer_email: string | null;
  total_amount: number | null;
  currency: string | null;
  created_at: string;
};

type QueueSeller = {
  profile_id: string;
  display_name: string | null;
  created_at: string;
};

type QueuePayout = {
  id: string;
  amount: number;
  currency: string;
  created_at: string;
};

export function AdminActionQueue({
  requests,
  sellers,
  payouts,
}: {
  requests: QueueRequest[];
  sellers: QueueSeller[];
  payouts: QueuePayout[];
}) {
  const [tab, setTab] = useState<'requests' | 'sellers' | 'payouts'>(
    requests.length > 0 ? 'requests' : sellers.length > 0 ? 'sellers' : 'payouts',
  );

  const tabs = [
    { key: 'requests' as const, label: 'طلبات الشراء', count: requests.length, href: '/admin/requests?status=pending' },
    { key: 'sellers' as const, label: 'اعتماد البائعين', count: sellers.length, href: '/admin/sellers?status=pending' },
    { key: 'payouts' as const, label: 'طلبات السحب', count: payouts.length, href: '/admin/payouts?status=requested' },
  ];

  const activeTab = tabs.find(t => t.key === tab)!;

  return (
    <section className="ui-box space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-foreground">صندوق المهام العاجلة (Action Queue)</h2>
          <p className="text-xs text-muted-foreground">وصول سريع لأحدث العناصر التي تنتظر قرارك.</p>
        </div>
        <Link href={activeTab.href} className="text-xs font-semibold text-primary hover:underline">
          عرض كل {activeTab.label} ←
        </Link>
      </div>

      <div className="flex items-center gap-2 flex-wrap border-b border-border pb-3">
        {tabs.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              tab === t.key
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>{t.label}</span>
            <span className="ui-num rounded-full bg-black/15 px-1.5 py-0.2 text-[11px]">{t.count}</span>
          </button>
        ))}
      </div>

      {tab === 'requests' && (
        <div className="divide-y divide-border">
          {requests.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">لا توجد طلبات شراء معلّقة حالياً.</p>
          ) : (
            requests.map(r => (
              <div key={r.id} className="py-2.5 flex items-center justify-between gap-3 flex-wrap text-xs">
                <div>
                  <p className="font-semibold ui-num">{r.request_number ?? r.id.slice(0, 8)}</p>
                  <p className="text-muted-foreground">
                    {r.buyer_email ?? 'مشتري'} · <span className="ui-num">{r.total_amount ?? 0} {r.currency ?? 'USD'}</span>
                  </p>
                </div>
                <Link
                  href={`/admin/requests/${r.id}`}
                  className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 font-semibold hover:opacity-95 transition"
                >
                  مراجعة واعتماد
                </Link>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'sellers' && (
        <div className="divide-y divide-border">
          {sellers.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">لا يوجد بائعون بانتظار الاعتماد.</p>
          ) : (
            sellers.map(s => (
              <div key={s.profile_id} className="py-2.5 flex items-center justify-between gap-3 flex-wrap text-xs">
                <div>
                  <p className="font-semibold">{s.display_name || 'بائع جديد'}</p>
                  <p className="text-muted-foreground">{new Date(s.created_at).toLocaleDateString('ar')}</p>
                </div>
                <Link
                  href={`/admin/sellers/${s.profile_id}`}
                  className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 font-semibold hover:opacity-95 transition"
                >
                  مراجعة الطلب
                </Link>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'payouts' && (
        <div className="divide-y divide-border">
          {payouts.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">لا توجد طلبات سحب معلّقة.</p>
          ) : (
            payouts.map(p => (
              <div key={p.id} className="py-2.5 flex items-center justify-between gap-3 flex-wrap text-xs">
                <div>
                  <p className="font-semibold ui-num">{p.amount} {p.currency}</p>
                  <p className="text-muted-foreground">{new Date(p.created_at).toLocaleDateString('ar')}</p>
                </div>
                <Link
                  href="/admin/payouts?status=requested"
                  className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 font-semibold hover:opacity-95 transition"
                >
                  مراجعة الصرف
                </Link>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}
