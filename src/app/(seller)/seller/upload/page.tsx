'use client';

import { useEffect, useRef, useState } from 'react';

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
    <main className="container max-w-2xl py-8 space-y-6">
      <h1 className="text-2xl font-bold">رفع ملف جديد</h1>

      {accounts.length === 0 && (
        <p className="text-red-600 text-sm">
          لا توجد حسابات Drive نشطة. أضف حسابًا أولًا من صفحة «حسابات Google Drive».
        </p>
      )}

      {accounts.length > 1 && (
        <div>
          <label className="block text-sm mb-1">حساب التخزين</label>
          <select
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            className="w-full border rounded p-2"
          >
            <option value="">توزيع تلقائي</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{a.google_account_email}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="block text-sm mb-1">الملف</label>
        <input
          ref={fileInputRef}
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="w-full border rounded p-2"
          disabled={stage === 'uploading' || stage === 'initializing' || stage === 'finalizing'}
        />
        {file && (
          <p className="text-xs text-muted-foreground mt-1">
            {(file.size / 1024 / 1024).toFixed(2)} MB — {file.type || 'نوع غير معروف'}
          </p>
        )}
      </div>

      <button
        onClick={handleUpload}
        disabled={!file || stage === 'uploading' || stage === 'initializing' || stage === 'finalizing'}
        className="w-full bg-primary text-primary-foreground rounded p-3 disabled:opacity-50"
      >
        {stage === 'initializing' && 'جارٍ التجهيز...'}
        {stage === 'uploading' && `جارٍ الرفع... ${progress}%`}
        {stage === 'finalizing' && 'جارٍ الإنهاء...'}
        {(stage === 'idle' || stage === 'done' || stage === 'error') && 'رفع إلى Drive'}
      </button>

      {stage === 'uploading' && (
        <div className="w-full bg-gray-200 rounded h-2">
          <div
            className="bg-primary h-2 rounded transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {result && (
        <div className="border rounded p-4 text-sm bg-green-50">
          <p className="font-medium text-green-800">تم الرفع بنجاح</p>
          <p className="text-xs text-muted-foreground mt-1">
            File Version ID: <code>{result.fileVersionId}</code>
          </p>
          <p className="text-xs text-muted-foreground">
            الملف الآن قيد الفحص. سيظهر جاهزًا بعد انتهاء الفحص.
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