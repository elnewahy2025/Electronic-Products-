'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { FolderOpen, UploadCloud } from 'lucide-react';
import {
  DrivePickerButton,
  formatDriveImportError,
  type DriveImportResultItem,
} from '@/components/seller/drive-picker-button';

type Account = {
  id: string;
  google_account_email: string;
  status: string;
  is_default?: boolean;
  quota_used?: number | null;
  quota_total?: number | null;
};

function formatGb(bytes?: number | null): string {
  if (bytes === null || bytes === undefined) return '—';
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

type InitResponse = {
  sessionId: string;
  uploadUrl: string;
  driveAccountId: string;
};

type Stage = 'idle' | 'initializing' | 'uploading' | 'finalizing' | 'done' | 'error';

export default function UploadPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ fileId: string; fileVersionId: string } | null>(null);
  const [importedResults, setImportedResults] = useState<DriveImportResultItem[] | null>(null);
  const [storeFolderNotice, setStoreFolderNotice] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/seller/drive/accounts')
      .then(r => r.json())
      .then(data => {
        const active: Account[] = (data.accounts ?? []).filter(
          (a: Account) => a.status === 'active',
        );
        setAccounts(active);
        if (active.length > 0) {
          const def = active.find(a => a.is_default) ?? active[0];
          setSelectedAccountId(def.id);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingAccounts(false));
  }, []);

  const selectedAccount = accounts.find(a => a.id === selectedAccountId) ?? accounts[0] ?? null;

  async function handleUpload() {
    if (!file) return;
    setError(null);
    setResult(null);
    setStage('initializing');
    setProgress(0);

    try {
      // 1. Init
      const initRes = await fetch('/api/upload/init', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          original_name: file.name,
          mime: file.type || 'application/octet-stream',
          size: file.size,
          drive_account_id: selectedAccountId || undefined,
        }),
      });
      const initJson: InitResponse & { error?: string } = await initRes.json();
      if (!initRes.ok) throw new Error(initJson.error ?? 'INIT_FAILED');

      setStage('uploading');

      // 2. Upload directly to Google Drive (not through Vercel)
      const driveFileId = await uploadToDrive(initJson.uploadUrl, file, (pct) => setProgress(pct));

      setStage('finalizing');

      // 3. Finalize on our side
      const compRes = await fetch('/api/upload/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          session_id: initJson.sessionId,
          drive_file_id: driveFileId,
        }),
      });
      const compJson = await compRes.json();
      if (!compRes.ok) throw new Error(compJson.error ?? 'COMPLETE_FAILED');

      setResult(compJson);
      setStage('done');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e: any) {
      setError(e.message);
      setStage('error');
    }
  }

  return (
    <main className="w-full space-y-6">
      <div>
        <h1 className="text-2xl font-bold">إضافة ملفات جديدة</h1>
        <p className="text-sm text-muted-foreground mt-1">
          يمكنك رفع ملف جديد من جهازك إلى Google Drive، أو الإشارة مباشرة إلى ملفات محفوظة مسبقاً على حسابك في Google Drive دون إعادة رفعها.
        </p>
      </div>

      {!loadingAccounts && accounts.length === 0 && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          لا توجد حسابات Drive نشطة. أضف حساباً أولاً من{' '}
          <Link href="/seller/drive-accounts" className="underline font-semibold">
            صفحة حسابات Google Drive
          </Link>
          .
        </div>
      )}

      {accounts.length > 0 && (
        <section className="ui-box space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-sm font-bold">حساب Google Drive المستخدم للاستيراد والرفع</h2>
              <p className="text-xs text-muted-foreground">
                {accounts.length > 1
                  ? 'اختر الحساب الذي تريد الأخذ من مجلد Store فيه أو الرفع إليه:'
                  : 'الحساب المرتبط حالياً بحساب البائع:'}
              </p>
            </div>
            <Link
              href="/seller/drive-accounts"
              className="text-xs text-primary hover:underline font-medium"
            >
              إدارة / إضافة حساب Drive
            </Link>
          </div>

          {accounts.length > 1 ? (
            <div className="space-y-2">
              <select
                value={selectedAccountId}
                onChange={(e) => {
                  setSelectedAccountId(e.target.value);
                  setStoreFolderNotice(null);
                  setImportedResults(null);
                }}
                className="w-full border border-border rounded-lg p-2.5 text-sm"
              >
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.google_account_email}
                    {a.is_default ? ' (افتراضي)' : ''}
                    {a.quota_total ? ` — ${formatGb(a.quota_used)} / ${formatGb(a.quota_total)}` : ''}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            selectedAccount && (
              <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl border border-border bg-muted/40 px-3.5 py-2.5 text-sm">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold ui-num">{selectedAccount.google_account_email}</span>
                  {selectedAccount.is_default && (
                    <span className="ui-badge ui-badge-green">افتراضي</span>
                  )}
                </div>
                {selectedAccount.quota_total ? (
                  <span className="text-xs text-muted-foreground ui-num">
                    المساحة المستخدمة: {formatGb(selectedAccount.quota_used)} / {formatGb(selectedAccount.quota_total)}
                  </span>
                ) : null}
              </div>
            )
          )}
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* Card 1 (Right in RTL): Import from Google Drive Store folder — subtle emerald tint */}
        <section className="rounded-[14px] border border-emerald-500/30 border-t-4 border-t-emerald-600 dark:border-t-emerald-400 bg-emerald-500/[0.04] dark:bg-emerald-500/[0.07] p-5 flex flex-col justify-between gap-5">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="shrink-0 h-10 w-10 rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 flex items-center justify-center">
                <FolderOpen className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <span className="inline-block rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-2.5 py-0.5 text-[11px] font-semibold">
                  من Google Drive إلى المتجر
                </span>
                <h2 className="text-base font-bold">1. استيراد ملفات من مجلد Store</h2>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  يتم الأخذ حصرياً من مجلد <code className="ui-num">Store</code> ومجلداته الفرعية (<code className="ui-num">PDFs</code>, <code className="ui-num">Docx</code>, <code className="ui-num">PowerPoints</code>, <code className="ui-num">Images</code>, <code className="ui-num">Videos</code>...) ليتم ربطها وفحصها تلقائياً دون إعادة رفع.
                </p>
              </div>
            </div>

            {storeFolderNotice && (
              <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                {storeFolderNotice}
              </p>
            )}

            {importedResults && importedResults.length > 0 && (
              <div className="rounded-xl border border-border bg-card/80 p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">نتائج الاستيراد من Google Drive:</span>
                  <Link href="/seller/products" className="text-primary hover:underline font-medium">
                    الذهاب إلى منتجاتي ←
                  </Link>
                </div>
                <ul className="space-y-1.5">
                  {importedResults.map((item) => (
                    <li
                      key={item.driveFileId}
                      className="flex items-center justify-between gap-2 rounded-lg bg-card border border-border px-3 py-2"
                    >
                      <span className="font-medium truncate">{item.name}</span>
                      {item.status === 'imported' && (
                        <span className="ui-badge ui-badge-green">تم الاستيراد وبدأ الفحص</span>
                      )}
                      {item.status === 'already_imported' && (
                        <span className="ui-badge ui-badge-blue">مرتبط مسبقاً</span>
                      )}
                      {item.status === 'skipped' && (
                        <span className="text-destructive">{formatDriveImportError(item.error)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="space-y-3 pt-2 border-t border-emerald-500/15">
            <div className="flex items-center gap-2 flex-wrap">
              <DrivePickerButton
                accountId={selectedAccountId || undefined}
                disabled={accounts.length === 0}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50"
                onError={msg => {
                  setError(msg);
                  setImportedResults(null);
                }}
                onImported={items => {
                  setError(null);
                  setImportedResults(items);
                }}
              />
              <DrivePickerButton
                mode="select-store-folder"
                accountId={selectedAccountId || undefined}
                disabled={accounts.length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/35 bg-card text-foreground px-3.5 py-2.5 text-xs font-medium hover:bg-muted transition disabled:opacity-50"
                onError={msg => setError(msg)}
                onStoreFolderLinked={info => {
                  setError(null);
                  setStoreFolderNotice(`تم ربط مجلد المتجر «${info.storeFolderName}» بنجاح — جميع عمليات الاستيراد والرفع ستتم داخله فقط.`);
                }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              ملاحظة: إذا كنت قد أنشأت مجلد <code className="ui-num">Store</code> يدوياً من قبل، اضغط أولاً على «تحديد مجلد Store الموجود» لربطه مرة واحدة.
            </p>
          </div>
        </section>

        {/* Card 2 (Left in RTL): Direct upload from device to Google Drive Store — subtle blue tint */}
        <section className="rounded-[14px] border border-primary/30 border-t-4 border-t-primary bg-primary/[0.04] dark:bg-primary/[0.07] p-5 flex flex-col justify-between gap-5">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="shrink-0 h-10 w-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
                <UploadCloud className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <span className="inline-block rounded-full bg-primary/15 text-primary px-2.5 py-0.5 text-[11px] font-semibold">
                  من جهازك إلى Google Drive
                </span>
                <h2 className="text-base font-bold">2. رفع ملف جديد إلى مجلد Store</h2>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  يُحفظ الملف تلقائياً داخل مجلد <code className="ui-num">Store</code> حسب نوعه (<code className="ui-num">Store/PDFs</code>، <code className="ui-num">Store/Docx</code>، <code className="ui-num">Store/PowerPoints</code>، <code className="ui-num">Store/Images</code>، <code className="ui-num">Store/Videos</code>...) ويُنشأ مجلد فرعي جديد تلقائياً لأي نوع جديد.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">اختر الملف من جهازك</label>
              <input
                ref={fileInputRef}
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="w-full border border-border bg-card rounded-xl p-2.5 text-sm"
                disabled={stage === 'uploading' || stage === 'initializing' || stage === 'finalizing'}
              />
              {file && (
                <p className="text-xs text-muted-foreground mt-1.5 ui-num">
                  {(file.size / 1024 / 1024).toFixed(2)} MB — {file.type || 'نوع غير معروف'}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t border-primary/15">
            <button
              onClick={handleUpload}
              disabled={!file || !selectedAccount || stage === 'uploading' || stage === 'initializing' || stage === 'finalizing'}
              className="w-full bg-primary text-primary-foreground rounded-xl p-2.5 text-sm font-semibold hover:opacity-95 transition disabled:opacity-50"
            >
              {stage === 'initializing' && 'جارٍ التجهيز...'}
              {stage === 'uploading' && `جارٍ الرفع... ${progress}%`}
              {stage === 'finalizing' && 'جارٍ الإنهاء...'}
              {(stage === 'idle' || stage === 'done' || stage === 'error') &&
                (selectedAccount
                  ? `رفع إلى Drive (${selectedAccount.google_account_email})`
                  : 'رفع إلى Drive')}
            </button>

            {stage === 'uploading' && (
              <div className="w-full bg-muted rounded h-2 overflow-hidden">
                <div
                  className="bg-primary h-2 rounded transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}

            <p className="text-[11px] text-muted-foreground">
              الرفع يتم مباشرة من متصفحك إلى Google Drive دون المرور بخوادم المنصة، ثم يبدأ الفحص التلقائي فوراً.
            </p>
          </div>
        </section>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm space-y-1">
          <p className="font-semibold text-emerald-700 dark:text-emerald-300">تم الرفع بنجاح</p>
          <p className="text-xs text-muted-foreground">
            File Version ID: <code className="ui-num">{result.fileVersionId}</code>
          </p>
          <p className="text-xs text-muted-foreground">
            الملف الآن قيد الفحص. سيظهر جاهزاً بعد انتهاء الفحص.
          </p>
        </div>
      )}
    </main>
  );
}

/**
 * Uploads directly to Google Drive using XHR (for progress events).
 * Bypasses our servers entirely — the browser talks to Google.
 */
function uploadToDrive(
  uploadUrl: string,
  file: File,
  onProgress: (pct: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status === 200 || xhr.status === 201) {
        try {
          const data = JSON.parse(xhr.responseText);
          if (!data.id) return reject(new Error('NO_DRIVE_FILE_ID'));
          resolve(data.id);
        } catch {
          reject(new Error('INVALID_DRIVE_RESPONSE'));
        }
      } else {
        reject(new Error(`DRIVE_UPLOAD_FAILED: ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('NETWORK_ERROR'));
    xhr.ontimeout = () => reject(new Error('UPLOAD_TIMEOUT'));

    xhr.send(file);
  });
}