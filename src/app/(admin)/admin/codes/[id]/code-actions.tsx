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
  const canResend = status === 'delivered' || status === 'issued';

  return (
    <div className="border rounded p-4 space-y-3">
      <div className="flex flex-wrap gap-2">
        {canConfirmDelivery && (
          <button onClick={() => call('confirm-delivery')} disabled={busy} className="bg-blue-600 text-white rounded px-4 py-2 text-sm disabled:opacity-50">
            تأكيد التسليم يدويًا
          </button>
        )}
        {canResend && (
          <button onClick={() => call('resend')} disabled={busy} className="border rounded px-4 py-2 text-sm disabled:opacity-50">
            إعادة إرسال
          </button>
        )}
        {canReplace && (
          <button onClick={() => call('replace')} disabled={busy || reason.length < 3} className="bg-yellow-600 text-white rounded px-4 py-2 text-sm disabled:opacity-50">
            إصدار كود بديل
          </button>
        )}
      </div>

      {canRevoke && (
        <div className="border-t pt-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            بعد تأكيد التسليم، لا يمكن إلغاء الكود من أي دور.
          </p>
          <input
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="سبب الإلغاء أو الاستبدال (إلزامي)"
            className="w-full border rounded p-2 text-sm"
          />
          <button onClick={() => call('revoke')} disabled={busy || reason.length < 3} className="bg-red-600 text-white rounded px-4 py-2 text-sm disabled:opacity-50">
            إلغاء الكود (قبل التسليم فقط)
          </button>
        </div>
      )}

      {plaintext && (
        <div className="bg-yellow-50 border border-yellow-200 rounded p-3 space-y-2">
          <p className="text-sm font-medium text-yellow-900">الكود الجديد (يظهر مرة واحدة فقط):</p>
          <p className="font-mono text-lg text-yellow-900">{plaintext}</p>
          <p className="text-xs text-yellow-700">انسخه الآن — لن يظهر مرة أخرى.</p>
        </div>
      )}

      {error && <p className="text-red-600 text-sm">{error}</p>}
    </div>
  );
}