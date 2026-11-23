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
      <div role="status" className="ui-box text-sm text-muted-foreground">
        تم حذف هذا التقييم بالفعل.
      </div>
    );
  }

  return (
    <section className="ui-box space-y-4" aria-labelledby="review-delete-heading">
      <div className="space-y-1">
        <h2 id="review-delete-heading" className="text-sm font-semibold text-foreground">
          التقييم المرتبط بالطلب
        </h2>
        <p className="text-xs text-muted-foreground">
          {review.product_title} — <span className="ui-num" dir="ltr">{review.buyer_email}</span> —{' '}
          <span className="text-warning ui-num" dir="ltr">
            {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}
          </span>
        </p>
        {review.body && <p className="text-sm text-foreground">{review.body}</p>}
      </div>

      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-muted-foreground" htmlFor="review-delete-reason">
          سبب الحذف (إلزامي)
        </label>
        <input
          id="review-delete-reason"
          value={reason}
          onChange={e => setReason(e.target.value)}
          minLength={3}
          maxLength={1000}
          className="w-full bg-background border border-border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          placeholder="اذكر سبب حذف التقييم بعد مراجعة تذكرة البائع"
        />
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={busy || reason.trim().length < 3}
        className="rounded-xl bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
      >
        {busy ? 'جارٍ الحذف...' : 'حذف التقييم بعد المراجعة'}
      </button>
    </section>
  );
}
