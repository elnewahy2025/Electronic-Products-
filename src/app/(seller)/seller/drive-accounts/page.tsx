'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type Account = {
  id: string;
  google_account_email: string;
  status: string;
  quota_total: number | null;
  quota_used: number | null;
  is_default: boolean;
  last_checked_at: string | null;
};

const ERROR_MESSAGES: Record<string, string> = {
  state_mismatch: 'فشل التحقق الأمني من جلسة الربط (state mismatch). حاول مرة أخرى.',
  state_invalid: 'انتهت صلاحية رابط الربط. يرجى إعادة المحاولة.',
  session_mismatch: 'تغيّرت جلسة المستخدم أثناء الربط. سجّل الدخول ثم حاول مجدداً.',
  DRIVE_HAS_ACTIVE_FILES: 'لا يمكن إلغاء ربط هذا الحساب لوجود ملفات نشطة مخزّنة عليه.',
  DRIVE_ACCOUNT_NOT_ACTIVE: 'لا يمكن تعيين حساب غير نشط كافتراضي.',
  GOOGLE_DRIVE_NOT_CONFIGURED:
    'لم يتم ضبط مفاتيح Google Drive OAuth على مستوى المنصة بعد (GOOGLE_DRIVE_CLIENT_ID / GOOGLE_DRIVE_CLIENT_SECRET).',
};

function translateError(code: string | null, fallback?: string): string | null {
  if (!code) return null;
  return ERROR_MESSAGES[code] ?? fallback ?? code;
}

export default function DriveAccountsPage() {
  const searchParams = useSearchParams();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(() =>
    translateError(searchParams.get('error')),
  );
  const [success, setSuccess] = useState<string | null>(() =>
    searchParams.get('success') === 'linked'
      ? 'تم ربط حساب Google Drive بنجاح وأصبح جاهزاً لرفع الملفات.'
      : null,
  );
  const [busy, setBusy] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/seller/drive/accounts');
      const json = await res.json();
      if (!res.ok) {
        setError(translateError(json.error, json.message));
      } else {
        setAccounts(json.accounts ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function linkNew() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/seller/drive/link', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        setError(translateError(json.error, json.message));
        return;
      }
      window.location.href = json.url;
    } catch {
      setError('تعذّر الاتصال بالخادم.');
    } finally {
      setBusy(false);
    }
  }

  async function setDefault(id: string) {
    setActionId(id);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/seller/drive/accounts/${id}`, { method: 'PATCH' });
      const json = await res.json();
      if (!res.ok) {
        setError(translateError(json.error, json.message));
        return;
      }
      setSuccess('تم تعيين الحساب الافتراضي بنجاح.');
      await load();
    } finally {
      setActionId(null);
    }
  }

  async function revoke(id: string) {
    if (!confirm('هل أنت متأكد من إلغاء ربط هذا الحساب؟')) return;
    setActionId(id);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/seller/drive/accounts/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) {
        setError(translateError(json.error, json.message));
        return;
      }
      setSuccess('تم إلغاء ربط الحساب بنجاح.');
      await load();
    } finally {
      setActionId(null);
    }
  }

  return (
    <main className="max-w-4xl space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[23px] font-bold text-foreground">حسابات Google Drive</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            ملفات منتجاتك تبقى مخزّنة في حسابات Drive الخاصة بك، ويمكنك ربط أكثر من حساب وتحديد الافتراضي.
          </p>
        </div>
        <button
          type="button"
          onClick={linkNew}
          disabled={busy}
          className="rounded-[9px] bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:opacity-95 active:scale-[0.98] transition disabled:opacity-50"
        >
          {busy ? 'جارٍ التحويل إلى Google...' : 'ربط حساب Drive جديد'}
        </button>
      </div>

      {success && (
        <div className="rounded-xl border border-success bg-success-soft px-4 py-3 text-sm text-success font-medium">
          {success}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-destructive/40 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="ui-box py-10 text-center text-sm text-muted-foreground">
          جارٍ تحميل الحسابات المرتبطة...
        </div>
      ) : accounts.length === 0 ? (
        <div className="ui-box py-10 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            لا توجد حسابات Google Drive مرتبطة بعد. اربط حسابك الشخصي على Google لبدء رفع ملفاتك.
          </p>
          <button
            type="button"
            onClick={linkNew}
            disabled={busy}
            className="rounded-[9px] bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:opacity-95 transition disabled:opacity-50"
          >
            ربط حساب Google Drive الآن
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {accounts.map(a => {
            const usedGb = a.quota_used ? a.quota_used / 1024 ** 3 : 0;
            const totalGb = a.quota_total ? a.quota_total / 1024 ** 3 : 0;
            const pct = totalGb > 0 ? Math.min(100, Math.round((usedGb / totalGb) * 100)) : 0;
            const isBusy = actionId === a.id;

            return (
              <div key={a.id} className="ui-box space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-foreground truncate font-mono" dir="ltr">
                      {a.google_account_email}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <span
                        className={`ui-badge ${
                          a.status === 'active'
                            ? 'ui-badge-green'
                            : a.status === 'revoked'
                              ? 'ui-badge-red'
                              : 'ui-badge-amber'
                        }`}
                      >
                        {a.status === 'active'
                          ? 'نشط'
                          : a.status === 'revoked'
                            ? 'ملغى'
                            : 'تجاوز الحصة'}
                      </span>
                      {a.is_default && (
                        <span className="ui-badge ui-badge-blue">الافتراضي</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        pct > 90 ? 'bg-destructive' : pct > 75 ? 'bg-warning' : 'bg-success'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {a.quota_total ? (
                    <p className="text-xs text-muted-foreground">
                      المستخدم{' '}
                      <span className="ui-num font-medium text-foreground">{usedGb.toFixed(2)}</span>{' '}
                      من{' '}
                      <span className="ui-num font-medium text-foreground">{totalGb.toFixed(2)}</span>{' '}
                      GB — متبقي{' '}
                      <span className="ui-num font-medium text-foreground">
                        {Math.max(0, totalGb - usedGb).toFixed(2)}
                      </span>{' '}
                      GB
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">سيتم تحديث المساحة عند أول رفع.</p>
                  )}
                </div>

                {a.status !== 'revoked' && (
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
                    {!a.is_default && a.status === 'active' ? (
                      <button
                        type="button"
                        onClick={() => setDefault(a.id)}
                        disabled={isBusy}
                        className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted transition disabled:opacity-50"
                      >
                        {isBusy ? '...' : 'تعيين كافتراضي'}
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {a.is_default ? 'الحساب الافتراضي للرفع' : ''}
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => revoke(a.id)}
                      disabled={isBusy}
                      className="text-xs text-red-700 dark:text-red-400 hover:underline disabled:opacity-50"
                    >
                      إلغاء الربط
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
