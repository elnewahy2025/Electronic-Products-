'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  ticketId: string;
  review: {
    id: string;
    rating: number;
    body: string | null;
    status: string;
    product_title: string;
    buyer_email: string;
  };
};

export function ReviewDeleteFromTicket({ ticketId, review }: Props) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/support/tickets/${ticketId}/delete-review`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message ?? json.error ?? 'تعذّر حذف التقييم.');
        return;
      }
      setReason('');
      router.refresh();
    } catch {
      setError('تعذّر الاتصال بالخادم.');
    } finally {
      setBusy(false);
    }
  }

  if (review.status === 'deleted') {
    return (
      <div role="status" className="rounded-xl border border-border bg-muted/50 p-4 text-sm text-muted-foreground">
        تم حذف هذا التقييم بالفعل.
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3" aria-labelledby="review-delete-heading">
      <div className="space-y-1">
        <h2 id="review-delete-heading" className="text-sm font-semibold">التقييم المرتبط بالطلب</h2>
        <p className="text-xs text-muted-foreground">
          {review.product_title} — <span dir="ltr">{review.buyer_email}</span> — {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}
        </p>
        {review.body && <p className="text-sm">{review.body}</p>}
      </div>

      <label className="block text-xs font-medium text-muted-foreground" htmlFor="review-delete-reason">
        سبب الحذف (إلزامي)
      </label>
      <input
        id="review-delete-reason"
        value={reason}
        onChange={e => setReason(e.target.value)}
        minLength={3}
        maxLength={1000}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        placeholder="اذكر سبب حذف التقييم بعد مراجعة تذكرة البائع"
      />

      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={busy || reason.trim().length < 3}
        className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground disabled:opacity-50"
      >
        {busy ? 'جارٍ الحذف...' : 'حذف التقييم بعد المراجعة'}
      </button>
    </section>
  );
}
