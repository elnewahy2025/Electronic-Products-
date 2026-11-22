'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  DrivePickerButton,
  formatDriveImportError,
  type DriveImportResultItem,
} from '@/components/seller/drive-picker-button';

type Account = {
  id: string;
  google_account_email: string;
  status: string;
};

type InitResponse = {
  sessionId: string;
  uploadUrl: string;
  driveAccountId: string;
};

type Stage = 'idle' | 'initializing' | 'uploading' | 'finalizing' | 'done' | 'error';

export default function UploadPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ fileId: string; fileVersionId: string } | null>(null);
  const [importedResults, setImportedResults] = useState<DriveImportResultItem[] | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/seller/drive/accounts')
      .then(r => r.json())
      .then(data => {
        const active = (data.accounts ?? []).filter((a: Account) => a.status === 'active');
        setAccounts(active);
        if (active.length === 1) setSelectedAccountId(active[0].id);
      })
      .catch(() => {});
  }, []);

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
    <main className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">إضافة ملفات جديدة</h1>
        <p className="text-sm text-muted-foreground mt-1">
          يمكنك رفع ملف جديد من جهازك إلى Google Drive، أو الإشارة مباشرة إلى ملفات محفوظة مسبقاً على حسابك في Google Drive دون إعادة رفعها.
        </p>
      </div>

      {accounts.length === 0 && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          لا توجد حسابات Drive نشطة. أضف حساباً أولاً من{' '}
          <Link href="/seller/drive-accounts" className="underline font-semibold">
            صفحة حسابات Google Drive
          </Link>
          .
        </div>
      )}

      {accounts.length > 1 && (
        <div className="ui-box">
          <label className="block text-sm font-medium mb-1.5">حساب Google Drive</label>
          <select
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            className="w-full border border-border rounded-lg p-2.5 text-sm"
          >
            <option value="">توزيع تلقائي / الحساب الافتراضي</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{a.google_account_email}</option>
            ))}
          </select>
        </div>
      )}

      {/* Option 1: Pick existing files from Google Drive */}
      <section className="ui-box space-y-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <h2 className="text-base font-bold">1. استيراد ملفات موجودة على Google Drive</h2>
            <p className="text-xs text-muted-foreground">
              اختر ملفاً أو عدة ملفات محفوظة مسبقاً على Drive (PDF, DOCX, PPTX, XLSX, ZIP, MP4...) ليتم ربطها وفحصها تلقائياً دون إعادة رفع.
            </p>
          </div>
          <DrivePickerButton
            accountId={selectedAccountId || undefined}
            disabled={accounts.length === 0}
            onError={msg => {
              setError(msg);
              setImportedResults(null);
            }}
            onImported={items => {
              setError(null);
              setImportedResults(items);
            }}
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          ملاحظة: يرجى عدم حذف الملفات المختارة من Google Drive طالما أنها مرتبطة بمنتج منشور. (مستندات Google Docs الأصلية يجب تصديرها إلى PDF أو DOCX أولاً.)
        </p>

        {importedResults && importedResults.length > 0 && (
          <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-2 text-xs">
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
      </section>

      {/* Option 2: Direct upload from device */}
      <section className="ui-box space-y-4">
        <div className="space-y-1">
          <h2 className="text-base font-bold">2. رفع ملف جديد من جهازك إلى Google Drive</h2>
          <p className="text-xs text-muted-foreground">
            يُرفع الملف مباشرة من متصفحك إلى حساب Google Drive المرتبط ثم يُفحص تلقائياً.
          </p>
        </div>

        <div>
          <label className="block text-sm mb-1">الملف</label>
          <input
            ref={fileInputRef}
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full border border-border rounded-lg p-2 text-sm"
            disabled={stage === 'uploading' || stage === 'initializing' || stage === 'finalizing'}
          />
          {file && (
            <p className="text-xs text-muted-foreground mt-1 ui-num">
              {(file.size / 1024 / 1024).toFixed(2)} MB — {file.type || 'نوع غير معروف'}
            </p>
          )}
        </div>

        <button
          onClick={handleUpload}
          disabled={!file || accounts.length === 0 || stage === 'uploading' || stage === 'initializing' || stage === 'finalizing'}
          className="w-full bg-primary text-primary-foreground rounded-xl p-3 text-sm font-semibold hover:opacity-95 transition disabled:opacity-50"
        >
          {stage === 'initializing' && 'جارٍ التجهيز...'}
          {stage === 'uploading' && `جارٍ الرفع... ${progress}%`}
          {stage === 'finalizing' && 'جارٍ الإنهاء...'}
          {(stage === 'idle' || stage === 'done' || stage === 'error') && 'رفع إلى Drive'}
        </button>

        {stage === 'uploading' && (
          <div className="w-full bg-muted rounded h-2 overflow-hidden">
            <div
              className="bg-primary h-2 rounded transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </section>

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