'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type Review = {
  id: string;
  product_id: string;
  product_title: string;
  product_slug: string;
  buyer_id: string;
  rating: number;
  body: string | null;
  status: 'published' | 'deleted';
  created_at: string;
  seller_reply: string | null;
  seller_replied_at: string | null;
  deleted_by: string | null;
  delete_reason: string | null;
};

export function SellerReviewsList({ initial }: { initial: Review[] }) {
  const [reviews, setReviews] = useState(initial);
  const router = useRouter();

  if (reviews.length === 0) {
    return (
      <div className="border rounded-lg p-10 text-center text-muted-foreground">
        <p>لا توجد تقييمات مطابقة للفلاتر.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {reviews.map(review => (
        <ReviewCard
          key={review.id}
          review={review}
          onChanged={() => router.refresh()}
        />
      ))}
    </div>
  );
}

function ReviewCard({ review, onChanged }: { review: Review; onChanged: () => void }) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState(review.seller_reply ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [requestOpen, setRequestOpen] = useState(false);
  const [requestReason, setRequestReason] = useState('');
  const [requestSent, setRequestSent] = useState(false);

  async function saveReply() {
    if (!replyText.trim()) return;
    setBusy(true); setError(null);
    const res = await fetch(`/api/seller/reviews/${review.id}/reply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reply: replyText }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      const map: Record<string, string> = {
        reply_empty: 'الرد فارغ.',
        reply_too_long: 'الرد طويل جدًا (الحد الأقصى 2000 حرف).',
        forbidden: 'لا تملك صلاحية الرد على هذا التقييم.',
      };
      return setError(map[json.error] ?? json.error ?? 'خطأ');
    }
    setReplyOpen(false);
    onChanged();
  }

  async function removeReply() {
    if (!confirm('حذف ردك على هذا التقييم؟')) return;
    setBusy(true); setError(null);
    const res = await fetch(`/api/seller/reviews/${review.id}/reply`, {
      method: 'DELETE',
    });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json();
      return setError(json.error ?? 'خطأ');
    }
    setReplyText('');
    onChanged();
  }

  async function requestDeleteReview() {
    setBusy(true); setError(null);
    const res = await fetch('/api/support/tickets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        review_id: review.id,
        subject: `طلب حذف تقييم: ${review.product_title}`,
        message: `أطلب مراجعة حذف التقييم رقم ${review.id} على منتج «${review.product_title}». السبب: ${requestReason.trim()}`,
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      return setError(json.error ?? 'تعذّر إرسال الطلب.');
    }
    setRequestOpen(false);
    setRequestReason('');
    setRequestSent(true);
    onChanged();
  }

  const isDeleted = review.status === 'deleted';

  return (
    <div className={`border rounded-lg p-4 space-y-3 ${isDeleted ? 'bg-red-50/50 opacity-80' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/products/${review.product_slug}`}
            className="text-sm font-medium hover:underline"
          >
            {review.product_title}
          </Link>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-yellow-500 text-sm">
              {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}
            </span>
            <span className="text-xs text-muted-foreground">مشتري موثّق</span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">
              {new Date(review.created_at).toLocaleDateString('ar')}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isDeleted && (
            <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-800">
              محذوف
            </span>
          )}
          {!isDeleted && !review.seller_reply && (
            <span className="text-xs px-2 py-0.5 rounded bg-orange-100 text-orange-800">
              بدون رد
            </span>
          )}
        </div>
      </div>

      {review.body && (
        <p className="text-sm whitespace-pre-wrap text-foreground/90">
          {review.body}
        </p>
      )}

      {isDeleted && review.delete_reason && (
        <p className="text-xs text-red-700">
          <b>سبب الحذف:</b> {review.delete_reason}
        </p>
      )}

      {/* Seller reply */}
      {review.seller_reply && !isDeleted && (
        <div className="bg-muted/40 border-r-2 border-primary rounded p-3 space-y-1">
          <p className="text-xs font-medium text-primary">ردّك:</p>
          <p className="text-sm whitespace-pre-wrap">{review.seller_reply}</p>
          <p className="text-xs text-muted-foreground">
            {review.seller_replied_at && new Date(review.seller_replied_at).toLocaleDateString('ar')}
          </p>
        </div>
      )}

      {!isDeleted && (
        <div className="flex flex-wrap gap-2 pt-2 border-t">
          {!review.seller_reply && !replyOpen && (
            <button
              onClick={() => setReplyOpen(true)}
              className="text-sm text-primary hover:underline"
            >
              رد على التقييم
            </button>
          )}
          {review.seller_reply && !replyOpen && (
            <>
              <button
                onClick={() => setReplyOpen(true)}
                className="text-sm text-primary hover:underline"
              >
                تعديل الرد
              </button>
              <button
                onClick={removeReply}
                disabled={busy}
                className="text-sm text-red-600 hover:underline disabled:opacity-50"
              >
                حذف الرد
              </button>
            </>
          )}
          {!requestOpen && !requestSent && (
            <button
              onClick={() => setRequestOpen(true)}
              className="text-sm text-primary hover:underline mr-auto"
            >
              طلب حذف التقييم
            </button>
          )}
          {requestSent && (
            <span role="status" className="mr-auto text-xs text-emerald-700 dark:text-emerald-300">
              أُرسل الطلب إلى الإدارة.
            </span>
          )}
        </div>
      )}

      {replyOpen && (
        <div className="space-y-2 pt-2 border-t">
          <textarea
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            placeholder="اكتب ردك المهني على هذا التقييم..."
            rows={3}
            maxLength={2000}
            className="w-full border rounded p-2 text-sm"
          />
          <p className="text-xs text-muted-foreground">
            {replyText.length}/2000 — يُنصح بالرد المهني البنّاء.
          </p>
          <div className="flex gap-2">
            <button
              onClick={saveReply}
              disabled={busy || replyText.trim().length === 0}
              className="bg-primary text-primary-foreground rounded px-4 py-2 text-sm disabled:opacity-50"
            >
              {busy ? '...' : 'حفظ الرد'}
            </button>
            <button
              onClick={() => {
                setReplyOpen(false);
                setReplyText(review.seller_reply ?? '');
                setError(null);
              }}
              className="border rounded px-4 py-2 text-sm"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}

      {requestOpen && (
        <div className="space-y-2 pt-2 border-t rounded bg-muted/50 p-3">
          <p className="text-sm font-medium">
            طلب مراجعة حذف التقييم
          </p>
          <p className="text-xs text-muted-foreground">
            سيفتح الطلب تذكرة دعم للإدارة. لا يتم الحذف إلا إذا لم يكن هناك تعويض أو استثناء أو تذكرة مفتوحة للمشتري على هذا المنتج أو الطلب.
          </p>
          <input
            value={requestReason}
            onChange={e => setRequestReason(e.target.value)}
            placeholder="سبب طلب الحذف (إلزامي، 3 أحرف على الأقل)"
            className="w-full border rounded p-2 text-sm"
            minLength={3}
          />
          <div className="flex gap-2">
            <button
              onClick={requestDeleteReview}
              disabled={busy || requestReason.trim().length < 3}
              className="bg-primary text-primary-foreground rounded px-4 py-2 text-sm disabled:opacity-50"
            >
              {busy ? '...' : 'إرسال الطلب'}
            </button>
            <button
              onClick={() => {
                setRequestOpen(false);
                setRequestReason('');
                setError(null);
              }}
              className="border rounded px-4 py-2 text-sm"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-red-600 text-sm">{error}</p>}
    </div>
  );
}
