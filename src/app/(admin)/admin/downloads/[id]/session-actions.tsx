'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function SessionActions({
  sessionId, status, hasDelivery,
}: { sessionId: string; status: string; hasDelivery: boolean }) {
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [hours, setHours] = useState('');
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function call(path: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/downloads/${sessionId}/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason, ...extra }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error ?? 'خطأ');
    router.refresh();
  }

  const canExtend = ['active', 'compensation_active'].includes(status);
  const canRevoke = !hasDelivery;
  const canCompensate = ['expired', 'expired_partial', 'exhausted'].includes(status);

  return (
    <section className="ui-box space-y-3">
      <div className="space-y-2">
        <label htmlFor="session-reason" className="block text-xs font-medium text-muted-foreground">
          السبب (إلزامي)
        </label>
        <input
          id="session-reason"
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="السبب (إلزامي)"
          className="w-full bg-background border border-border rounded-xl px-3.5 py-2 text-sm"
        />
      </div>

      {canExtend && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-2 flex-1 min-w-[10rem]">
            <label htmlFor="session-hours" className="block text-xs font-medium text-muted-foreground">
              ساعات إضافية
            </label>
            <input
              id="session-hours"
              type="number"
              value={hours}
              onChange={e => setHours(e.target.value)}
              placeholder="ساعات إضافية"
              min="1"
              max="168"
              className="w-full bg-background border border-border rounded-xl px-3.5 py-2 text-sm ui-num"
            />
          </div>
          <button
            type="button"
            onClick={() => call('extend', { extra_hours: parseInt(hours, 10) })}
            disabled={busy || !hours || parseInt(hours, 10) <= 0}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            تمديد
          </button>
        </div>
      )}

      {canCompensate && (
        <button
          type="button"
          onClick={() => call('compensate')}
          disabled={busy || reason.length < 3}
          className="rounded-xl bg-success-soft px-4 py-2 text-sm font-medium text-success transition hover:opacity-90 disabled:opacity-50"
        >
          فتح جلسة تعويضية (لا تستهلك محاولة)
        </button>
      )}

      {canRevoke && (
        <button
          type="button"
          onClick={() => call('revoke')}
          disabled={busy || reason.length < 3}
          className="rounded-xl bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:opacity-90 disabled:opacity-50"
        >
          إلغاء الجلسة (قبل بدء التسليم فقط)
        </button>
      )}

      {hasDelivery && (
        <p className="text-sm text-destructive">
          بدأ التسليم في هذه الجلسة — لا يمكن إلغاؤها من أي دور.
        </p>
      )}

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
  );
}
