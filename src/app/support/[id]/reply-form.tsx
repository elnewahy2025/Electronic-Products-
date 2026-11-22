'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  ticketId: string;
  allowInternal?: boolean;
  currentStatus?: 'open' | 'pending' | 'closed';
  canChangeStatus?: boolean;
};

export function TicketReplyForm({
  ticketId,
  allowInternal = false,
  currentStatus,
  canChangeStatus = false,
}: Props) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [status, setStatus] = useState(currentStatus ?? 'open');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/support/tickets/${ticketId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, is_internal: allowInternal && isInternal }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'تعذّر إرسال الرد.');
      } else {
        setBody('');
        setIsInternal(false);
        router.refresh();
      }
    } catch {
      setError('تعذّر الاتصال بالخادم.');
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(next: 'open' | 'pending' | 'closed') {
    setStatus(next);
    const res = await fetch(`/api/support/tickets/${ticketId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    if (res.ok) router.refresh();
  }

  return (
    <div className="space-y-4">
      {canChangeStatus && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
          <span className="text-xs font-medium text-muted-foreground ml-2">حالة التذكرة:</span>
          {(['open', 'pending', 'closed'] as const).map(s => (
            <button
              key={s}
              type="button"
              onClick={() => changeStatus(s)}
              className={`rounded-lg px-3 py-1 text-xs font-medium border transition ${
                status === s
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border bg-background hover:bg-muted/60'
              }`}
            >
              {s === 'open' ? 'مفتوحة' : s === 'pending' ? 'قيد المتابعة' : 'مغلقة'}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={sendReply}
        className="rounded-2xl border border-border bg-card p-4 space-y-3 shadow-sm"
      >
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={3}
          required
          minLength={2}
          maxLength={5000}
          placeholder={isInternal ? 'ملاحظة داخلية للموظفين فقط (لا تظهر للعميل)...' : 'اكتب ردك هنا...'}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          {allowInternal ? (
            <label className="inline-flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 cursor-pointer">
              <input
                type="checkbox"
                checked={isInternal}
                onChange={e => setIsInternal(e.target.checked)}
                className="rounded border-border"
              />
              <span>ملاحظة داخلية للفريق فقط</span>
            </label>
          ) : (
            <span />
          )}

          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 active:scale-[0.98] transition disabled:opacity-50"
          >
            {busy ? 'جارٍ الإرسال...' : isInternal ? 'حفظ الملاحظة الداخلية' : 'إرسال الرد'}
          </button>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}
      </form>
    </div>
  );
}
