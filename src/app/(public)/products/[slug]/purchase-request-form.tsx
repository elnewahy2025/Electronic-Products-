'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  productId: string;
  productTitle: string;
  price: number;
  currency: string;
  defaultEmail?: string;
  defaultPhone?: string;
  defaultFullName?: string;
  isLoggedIn: boolean;
};

export function PurchaseRequestForm(p: Props) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(p.defaultEmail ?? '');
  const [phone, setPhone] = useState(p.defaultPhone ?? '');
  const [fullName, setFullName] = useState(p.defaultFullName ?? '');
  const [notes, setNotes] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const valid =
    email.trim() && email.includes('@') &&
    phone.trim().length >= 5 &&
    agreed;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);

    const res = await fetch('/api/purchase-requests', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        product_id: p.productId,
        email: email.trim(),
        phone: phone.trim(),
        full_name: fullName.trim() || undefined,
        notes: notes.trim() || undefined,
      }),
    });

    const json = await res.json();
    setBusy(false);

    if (!res.ok) {
      return setError(json.error ?? 'حدث خطأ');
    }

    // Navigate to tracking page so state persists on refresh
    router.push(json.tracking_url);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full bg-primary text-primary-foreground rounded p-3 font-medium hover:opacity-95 transition"
      >
        طلب الشراء
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="border-2 border-primary/30 rounded-lg p-4 space-y-3 bg-primary/5">
      <div className="flex items-start justify-between">
        <h3 className="font-semibold">طلب شراء: {p.productTitle}</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-muted-foreground text-sm"
        >
          ✕
        </button>
      </div>

      <div className="bg-background rounded p-2 text-sm">
        <span className="text-muted-foreground">السعر: </span>
        <b>{p.price} {p.currency}</b>
      </div>

      <div>
        <label className="block text-xs mb-1">البريد الإلكتروني *</label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          maxLength={200}
          dir="ltr"
          placeholder="you@example.com"
          className="w-full border rounded p-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-xs mb-1">رقم الهاتف *</label>
        <input
          type="tel"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          required
          maxLength={30}
          dir="ltr"
          placeholder="+20 100 000 0000"
          className="w-full border rounded p-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-xs mb-1">الاسم (اختياري)</label>
        <input
          type="text"
          value={fullName}
          onChange={e => setFullName(e.target.value)}
          maxLength={120}
          className="w-full border rounded p-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-xs mb-1">ملاحظات (اختياري)</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          maxLength={1000}
          rows={2}
          placeholder="أي تفاصيل تريد أن تعرفها الإدارة"
          className="w-full border rounded p-2 text-sm"
        />
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded p-2 text-xs text-yellow-900 space-y-1">
        <p className="font-medium">قبل الإرسال، يرجى العلم:</p>
        <ul className="list-disc pr-5 space-y-0.5">
          <li>الدفع يتم خارج المنصة بعد اعتماد الطلب.</li>
          <li>لا توجد سياسة استرداد مالي.</li>
          <li>دور المنصة يقتصر على إصدار أكواد التنزيل والتحقق منها.</li>
          <li>سيتواصل معك فريق الإدارة عبر البريد أو الهاتف.</li>
        </ul>
      </div>

      <label className="flex items-start gap-2 text-xs cursor-pointer">
        <input
          type="checkbox"
          checked={agreed}
          onChange={e => setAgreed(e.target.checked)}
          className="mt-0.5"
        />
        <span>قرأت ما سبق وأوافق على شروط الشراء.</span>
      </label>

      <button
        type="submit"
        disabled={!valid || busy}
        className="w-full bg-primary text-primary-foreground rounded p-2.5 font-medium disabled:opacity-50"
      >
        {busy ? 'جارٍ الإرسال...' : 'إرسال طلب الشراء'}
      </button>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <p className="text-xs text-muted-foreground text-center">
        ستحصل على رقم مرجعي ورابط لمتابعة حالة طلبك.
      </p>
    </form>
  );
}