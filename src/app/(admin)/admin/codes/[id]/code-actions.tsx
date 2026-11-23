'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function CodeActions({ codeId, status }: { codeId: string; status: string }) {
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const router = useRouter();

  async function call(path: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/codes/${codeId}/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason, ...extra }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error ?? 'خطأ');
    if (json.plaintext) setPlaintext(json.plaintext);
    router.refresh();
  }

  const canConfirmDelivery = status === 'issued';
  const canRevoke = status === 'issued'; // before delivery only
  const canReplace = ['expired', 'revoked'].includes(status);
  const resendAvailable = false; // No code-delivery transport is configured yet.
  const canResend = (status === 'delivered' || status === 'issued') && resendAvailable;

  return (
    <section className="ui-box space-y-3">
      <div className="flex flex-wrap gap-2">
        {canConfirmDelivery && (
          <button
            type="button"
            onClick={() => call('confirm-delivery')}
            disabled={busy}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            تأكيد التسليم يدويًا
          </button>
        )}
        {canResend && (
          <button
            type="button"
            onClick={() => call('resend')}
            disabled={busy}
            className="rounded-xl border border-border bg-muted px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/80 disabled:opacity-50"
          >
            إعادة إرسال
          </button>
        )}
        {(status === 'delivered' || status === 'issued') && !resendAvailable && (
          <p className="w-full text-xs text-muted-foreground" title="RESEND_NOT_IMPLEMENTED">
            إعادة الإرسال غير متاحة حاليًا؛ لم يُربط بعد بخدمة تسليم الأكواد. استخدم «إصدار كود بديل» عند الحاجة.
          </p>
        )}
        {canReplace && (
          <button
            type="button"
            onClick={() => call('replace')}
            disabled={busy || reason.length < 3}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            إصدار كود بديل
          </button>
        )}
      </div>

      {canRevoke && (
        <div className="border-t border-border pt-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            بعد تأكيد التسليم، لا يمكن إلغاء الكود من أي دور.
          </p>
          <label htmlFor="code-revoke-reason" className="block text-xs font-medium text-muted-foreground">
            سبب الإلغاء أو الاستبدال (إلزامي)
          </label>
          <input
            id="code-revoke-reason"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="سبب الإلغاء أو الاستبدال (إلزامي)"
            className="w-full bg-background border border-border rounded-xl px-3.5 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => call('revoke')}
            disabled={busy || reason.length < 3}
            className="rounded-xl bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:opacity-90 disabled:opacity-50"
          >
            إلغاء الكود (قبل التسليم فقط)
          </button>
        </div>
      )}

      {plaintext && (
        <div className="rounded-xl border border-warning bg-warning-soft p-3 space-y-1.5">
          <p className="text-sm font-semibold text-foreground">الكود الجديد (يظهر مرة واحدة فقط):</p>
          <p className="font-mono text-lg text-foreground ui-num">{plaintext}</p>
          <p className="text-xs text-muted-foreground">انسخه الآن — لن يظهر مرة أخرى.</p>
        </div>
      )}

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
  );
}
