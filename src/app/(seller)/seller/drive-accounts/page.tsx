'use client';

import { useEffect, useState } from 'react';

type Account = {
  id: string;
  google_account_email: string;
  status: string;
  quota_total: number | null;
  quota_used: number | null;
  is_default: boolean;
  last_checked_at: string | null;
};

export default function DriveAccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch('/api/seller/drive/accounts');
    const json = await res.json();
    if (!res.ok) return setError(json.error);
    setAccounts(json.accounts);
  }

  useEffect(() => { load(); }, []);

  async function linkNew() {
    setBusy(true);
    const res = await fetch('/api/seller/drive/link', { method: 'POST' });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error);
    window.location.href = json.url;
  }

  async function revoke(id: string) {
    if (!confirm('هل أنت متأكد من إلغاء ربط هذا الحساب؟')) return;
    const res = await fetch(`/api/seller/drive/accounts/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok) return setError(json.error);
    load();
  }

  function quotaBar(a: Account) {
    if (!a.quota_total) return <span className="text-xs text-muted-foreground">غير معروف</span>;
    const used = a.quota_used ?? 0;
    const pct = Math.min(100, Math.round((used / a.quota_total) * 100));
    return (
      <div className="w-full bg-gray-200 rounded h-2 mt-1">
        <div
          className={`h-2 rounded ${pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-yellow-500' : 'bg-green-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    );
  }

  return (
    <main className="container max-w-3xl py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">حسابات Google Drive</h1>
        <button
          onClick={linkNew}
          disabled={busy}
          className="bg-primary text-primary-foreground rounded px-4 py-2 disabled:opacity-50"
        >
          {busy ? 'جارٍ التحويل...' : 'ربط حساب جديد'}
        </button>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {accounts.length === 0 && (
        <p className="text-muted-foreground">لا توجد حسابات مرتبطة. اربط حسابًا لبدء رفع الملفات.</p>
      )}

      <div className="space-y-3">
        {accounts.map(a => (
          <div key={a.id} className="border rounded p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{a.google_account_email}</p>
                <p className="text-xs text-muted-foreground">
                  الحالة: {a.status === 'active' ? 'نشط' : a.status === 'revoked' ? 'ملغى' : 'تجاوز الحصة'}
                  {a.is_default && ' — افتراضي'}
                </p>
              </div>
              {a.status !== 'revoked' && (
                <button
                  onClick={() => revoke(a.id)}
                  className="text-sm text-red-600 hover:underline"
                >
                  إلغاء الربط
                </button>
              )}
            </div>
            <div>
              {a.quota_total && (
                <p className="text-xs text-muted-foreground">
                  {(a.quota_used! / 1024 / 1024 / 1024).toFixed(2)} GB /
                  {' '}{(a.quota_total / 1024 / 1024 / 1024).toFixed(2)} GB
                </p>
              )}
              {quotaBar(a)}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}