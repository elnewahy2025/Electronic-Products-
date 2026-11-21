'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type IssuedCode = { code_id: string; code_prefix: string; plaintext: string };

export function RequestActions({ requestId }: { requestId: string }) {
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedCode[] | null>(null);
  const router = useRouter();

  async function approve() {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/admin/requests/${requestId}/approve`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      // Fetch plaintext for each code (one-time display)
      const codes: IssuedCode[] = [];
      for (const c of json.codes) {
        const r = await fetch(`/api/admin/codes/${c.code_id}/plaintext`);
        const d = await r.json();
        codes.push({ code_id: c.code_id, code_prefix: c.code_prefix, plaintext: d.plaintext });
      }
      setIssued(codes);
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/admin/requests/${requestId}/reject`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (issued) {
    return (
      <div className="border-2 border-yellow-400 bg-yellow-50 rounded p-4 space-y-3">
        <h3 className="font-bold text-yellow-900">أكواد صادرة (تُعرض مرة واحدة فقط!)</h3>
        <p className="text-xs text-yellow-800">انسخها الآن وأرسلها للمشتري قبل مغادرة الصفحة.</p>
        <div className="space-y-2">
          {issued.map(c => (
            <div key={c.code_id} className="bg-white rounded p-2 flex justify-between items-center">
              <code className="font-mono text-base">{c.plaintext}</code>
              <button
                onClick={() => navigator.clipboard.writeText(c.plaintext)}
                className="text-xs bg-yellow-600 text-white rounded px-2 py-1"
              >
                نسخ
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="border rounded p-4 space-y-3">
      <button
        onClick={approve}
        disabled={busy}
        className="bg-green-600 text-white rounded px-4 py-2 text-sm disabled:opacity-50"
      >
        {busy ? 'جارٍ المعالجة...' : 'الموافقة وإصدار الأكواد'}
      </button>
      <div className="border-t pt-3 space-y-2">
        <input
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="سبب الرفض (إلزامي)"
          className="w-full border rounded p-2 text-sm"
        />
        <button
          onClick={reject}
          disabled={busy || reason.length < 3}
          className="bg-red-600 text-white rounded px-4 py-2 text-sm disabled:opacity-50"
        >
          رفض الطلب
        </button>
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
    </div>
  );
}