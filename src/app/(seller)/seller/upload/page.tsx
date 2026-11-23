'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { FolderOpen, UploadCloud, FileCheck2 } from 'lucide-react';
import { useToast } from '@/components/shared/toast-provider';
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

type Stage =
  | 'idle'
  | 'initializing'
  | 'resuming'
  | 'uploading'
  | 'paused'
  | 'finalizing'
  | 'done'
  | 'error';

type PendingUpload = {
  sessionId: string;
  driveAccountId: string;
  name: string;
  size: number;
  mime: string;
  lastModified: number;
};

type UploadStatus = {
  done: boolean;
  bytesReceived: number;
  totalBytes: number;
  status: string;
  expiresAt: string | null;
  uploadUrl?: string;
  driveFileId?: string;
  fileId?: string;
  fileVersionId?: string;
  originalName?: string;
  mime?: string;
};

const PENDING_UPLOAD_KEY = 'electronic-products:pending-upload';

function savePendingUpload(value: PendingUpload) {
  sessionStorage.setItem(PENDING_UPLOAD_KEY, JSON.stringify(value));
}

function readPendingUpload(): PendingUpload | null {
  try {
    const raw = sessionStorage.getItem(PENDING_UPLOAD_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as PendingUpload;
    if (
      !value.sessionId ||
      !value.driveAccountId ||
      typeof value.name !== 'string' ||
      typeof value.size !== 'number' ||
      typeof value.mime !== 'string'
    ) {
      sessionStorage.removeItem(PENDING_UPLOAD_KEY);
      return null;
    }
    return value;
  } catch {
    sessionStorage.removeItem(PENDING_UPLOAD_KEY);
    return null;
  }
}

function matchesPending(pending: PendingUpload, file: File): boolean {
  return (
    pending.name === file.name &&
    pending.size === file.size &&
    pending.mime === (file.type || 'application/octet-stream')
  );
}

function friendlyUploadError(message: string): string {
  const map: Record<string, string> = {
    UPLOAD_SESSION_EXPIRED: 'انتهت صلاحية جلسة الرفع. اختر الملف من جديد.',
    UPLOAD_URL_MISSING: 'تعذّر استئناف هذا الرفع. اختر الملف من جديد.',
    NETWORK_ERROR: 'انقطع الاتصال. سيُستأنف الرفع تلقائياً عند عودة الاتصال.',
    UPLOAD_TIMEOUT: 'انقطع الاتصال. سيُستأنف الرفع تلقائياً عند عودة الاتصال.',
    UPLOAD_STALLED: 'توقّف الرفع دون تقدّم. أعد المحاولة.',
    FILE_MISMATCH: 'الملف المختار لا يطابق جلسة الرفع المعلّقة.',
    NOT_FOUND: 'جلسة الرفع غير موجودة. اختر الملف من جديد.',
  };
  if (map[message]) return map[message];
  if (message.startsWith('DRIVE_UPLOAD_FAILED: 404')) return map.UPLOAD_SESSION_EXPIRED;
  return message;
}

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
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<PendingUpload | null>(null);
  const [resumeNotice, setResumeNotice] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const toast = useToast();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const pendingRef = useRef<PendingUpload | null>(null);
  const finalizingRef = useRef<string | null>(null);
  const actionRef = useRef(false);

  useEffect(() => {
    fetch('/api/seller/drive/accounts')
      .then(r => r.json())
      .then(data => {
        const active: Account[] = (data.accounts ?? []).filter(
          (a: Account) => a.status === 'active',
        );
        setAccounts(active);
        if (active.length > 0) {
          const stored = readPendingUpload();
          const def = active.find(a => a.id === stored?.driveAccountId)
            ?? active.find(a => a.is_default)
            ?? active[0];
          setSelectedAccountId(def.id);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingAccounts(false));
  }, []);

  const selectedAccount = accounts.find(a => a.id === selectedAccountId) ?? accounts[0] ?? null;

  function setPendingSession(value: PendingUpload | null) {
    pendingRef.current = value;
    setPending(value);
    if (value) savePendingUpload(value);
    else sessionStorage.removeItem(PENDING_UPLOAD_KEY);
  }

  async function fetchUploadStatus(sessionId: string): Promise<UploadStatus> {
    const res = await fetch(`/api/upload/${sessionId}/status`, { cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const code = json.error ?? 'UPLOAD_STATUS_FAILED';
      if (code === 'UPLOAD_SESSION_EXPIRED' || code === 'NOT_FOUND' || res.status === 404 || res.status === 410) {
        setPendingSession(null);
      }
      throw new Error(code);
    }
    return json as UploadStatus;
  }

  async function finalizeSession(sessionId: string, driveFileId: string) {
    if (finalizingRef.current === sessionId) return;
    finalizingRef.current = sessionId;
    setStage('finalizing');
    try {
      const res = await fetch('/api/upload/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, drive_file_id: driveFileId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'COMPLETE_FAILED');
      setResult(json);
      setStage('done');
      setProgress(100);
      setFile(null);
      setPendingSession(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      toast.success('تم رفع الملف إلى مجلد Store بنجاح وبدأ الفحص التلقائي.');
    } finally {
      finalizingRef.current = null;
    }
  }

  async function applyStatus(status: UploadStatus, pendingValue: PendingUpload) {
    if (status.status === 'completed' && status.fileId) {
      setResult({
        fileId: status.fileId,
        fileVersionId: status.fileVersionId ?? '',
      });
      setStage('done');
      setProgress(100);
      setFile(null);
      setPendingSession(null);
      toast.success('اكتمل رفع هذا الملف سابقاً وبدأ الفحص التلقائي.');
      return;
    }
    if (status.done && status.driveFileId) {
      await finalizeSession(pendingValue.sessionId, status.driveFileId);
      return;
    }
    if (status.originalName && status.originalName !== pendingValue.name) {
      throw new Error('FILE_MISMATCH');
    }
    if (status.totalBytes && status.totalBytes !== pendingValue.size) {
      throw new Error('FILE_MISMATCH');
    }
    const received = Math.min(status.bytesReceived, pendingValue.size);
    setProgress(pendingValue.size > 0 ? Math.round((received / pendingValue.size) * 100) : 0);
    setResumeNotice(
      `تم العثور على رفع متوقف عند ${received.toLocaleString()} من ${pendingValue.size.toLocaleString()} بايت. اختر الملف نفسه للمتابعة.`,
    );
  }

  async function runUpload(
    sessionId: string,
    uploadUrl: string,
    selectedFile: File,
    startByte: number,
  ) {
    let offset = startByte;
    setStage('uploading');
    while (true) {
      const outcome = await uploadChunk(uploadUrl, selectedFile, offset, (loaded) => {
        const sent = Math.min(offset + loaded, selectedFile.size);
        setProgress(selectedFile.size > 0 ? Math.round((sent / selectedFile.size) * 100) : 0);
      }, (xhr) => {
        xhrRef.current = xhr;
      });
      if (outcome.nextByte !== undefined) {
        offset = outcome.nextByte;
        continue;
      }
      if (!outcome.driveFileId) throw new Error('NO_DRIVE_FILE_ID');
      await finalizeSession(sessionId, outcome.driveFileId);
      return;
    }
  }

  async function resumeUploadInternal() {
    const current = pendingRef.current;
    if (!current || !file) return;
    if (!matchesPending(current, file)) {
      setError('الملف المختار لا يطابق جلسة الرفع المعلّقة.');
      return;
    }
    if (!navigator.onLine) {
      setStage('paused');
      setError('لا يوجد اتصال بالإنترنت. سيُستأنف الرفع تلقائياً.');
      return;
    }
    setError(null);
    setResult(null);
    setStage('resuming');
    try {
      const status = await fetchUploadStatus(current.sessionId);
      await applyStatus(status, current);
      if (status.done) return;
      if (!status.uploadUrl) throw new Error('UPLOAD_URL_MISSING');
      const start = Math.min(status.bytesReceived, file.size);
      setProgress(file.size > 0 ? Math.round((start / file.size) * 100) : 0);
      await runUpload(current.sessionId, status.uploadUrl, file, start);
    } catch (e: any) {
      const message = friendlyUploadError(e?.message ?? 'RESUME_FAILED');
      setError(message);
      toast.error(message);
      setStage(navigator.onLine ? 'error' : 'paused');
    }
  }

  async function resumeUpload() {
    if (actionRef.current) return;
    actionRef.current = true;
    try {
      await resumeUploadInternal();
    } finally {
      actionRef.current = false;
    }
  }

  async function handleUpload() {
    if (!file || actionRef.current) return;
    actionRef.current = true;
    try {
      setError(null);
      setResult(null);

      if (pendingRef.current) {
        await resumeUploadInternal();
        return;
      }
      if (!navigator.onLine) {
        setError('لا يوجد اتصال بالإنترنت. انتظر حتى يعود الاتصال قبل بدء رفع جديد.');
        return;
      }

      setStage('initializing');
      setProgress(0);
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

      setPendingSession({
        sessionId: initJson.sessionId,
        driveAccountId: initJson.driveAccountId,
        name: file.name,
        size: file.size,
        mime: file.type || 'application/octet-stream',
        lastModified: file.lastModified,
      });
      await runUpload(initJson.sessionId, initJson.uploadUrl, file, 0);
    } catch (e: any) {
      const message = friendlyUploadError(e?.message ?? 'UPLOAD_FAILED');
      setError(message);
      toast.error(message);
      setStage(navigator.onLine ? 'error' : 'paused');
    } finally {
      actionRef.current = false;
    }
  }

  // Restore a pending session on mount. The browser cannot restore the File
  // object, so the seller must reselect the same file before resuming.
  useEffect(() => {
    const stored = readPendingUpload();
    if (!stored) return;
    pendingRef.current = stored;
    setPending(stored);
    setOnline(navigator.onLine);
    setStage('resuming');
    actionRef.current = true;
    void (async () => {
      try {
        const status = await fetchUploadStatus(stored.sessionId);
        await applyStatus(status, stored);
        if (!status.done) setStage('paused');
      } catch (e: any) {
        setError(friendlyUploadError(e?.message ?? 'UPLOAD_STATUS_FAILED'));
        setStage(navigator.onLine ? 'error' : 'paused');
      } finally {
        actionRef.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!pending) return;
    if (accounts.some(a => a.id === pending.driveAccountId)) {
      setSelectedAccountId(pending.driveAccountId);
    }
  }, [accounts, pending]);

  useEffect(() => {
    function onOnline() {
      setOnline(true);
      const current = pendingRef.current;
      if (current && file && matchesPending(current, file) && stage === 'paused') {
        void resumeUpload();
      }
    }
    function onOffline() {
      setOnline(false);
      xhrRef.current?.abort();
      setStage(prev =>
        prev === 'uploading' || prev === 'resuming' || prev === 'initializing' ? 'paused' : prev,
      );
    }
    function onVisible() {
      if (!document.hidden) onOnline();
    }
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, stage]);

  function chooseFile(next: File | null | undefined) {
    if (!next) {
      setFile(null);
      return;
    }
    setFile(next);
    if (pendingRef.current && !matchesPending(pendingRef.current, next)) {
      setError('الملف المختار لا يطابق جلسة الرفع المعلّقة. اختر الملف الأصلي أو ألغِ الجلسة.');
    } else {
      setError(null);
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
                disabled={Boolean(pending)}
                onChange={(e) => {
                  setSelectedAccountId(e.target.value);
                  setStoreFolderNotice(null);
                  setImportedResults(null);
                }}
                className="w-full border border-border rounded-lg p-2.5 text-sm disabled:opacity-60"
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

      {!online && (
        <div role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
          أنت غير متصل بالإنترنت. سيُستأنف الرفع تلقائياً عند عودة الاتصال.
        </div>
      )}

      {pending && (
        <section className="rounded-xl border border-primary/30 bg-primary/[0.04] p-4 space-y-2" aria-labelledby="resume-upload-heading">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="space-y-1">
              <h2 id="resume-upload-heading" className="text-sm font-bold">لديك رفع متوقف</h2>
              <p className="text-xs text-muted-foreground break-all">
                {resumeNotice ?? `الملف: ${pending.name} — يجب اختيار الملف نفسه للمتابعة.`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                xhrRef.current?.abort();
                setPendingSession(null);
                setResumeNotice(null);
                setError(null);
                setResult(null);
                setFile(null);
                setProgress(0);
                setStage('idle');
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              className="text-xs text-destructive hover:underline"
            >
              إلغاء الجلسة المعلقة
            </button>
          </div>
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
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const dropped = e.dataTransfer.files?.[0];
                  if (dropped) chooseFile(dropped);
                }}
                className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-5 text-center cursor-pointer transition ${
                  dragging
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-card hover:border-primary/60 hover:bg-muted/40'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
                  className="hidden"
                  disabled={stage === 'uploading' || stage === 'resuming' || stage === 'initializing' || stage === 'finalizing'}
                />
                {file ? (
                  <>
                    <FileCheck2 className="h-6 w-6 text-primary" />
                    <span className="text-sm font-semibold text-foreground break-all">{file.name}</span>
                    <span className="text-xs text-muted-foreground ui-num">
                      {(file.size / 1024 / 1024).toFixed(2)} MB — اضغط لتغيير الملف
                    </span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="h-6 w-6 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">
                      اسحب الملف وأفلته هنا، أو اضغط للاختيار من جهازك
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      PDF · DOCX · PPTX · XLSX · ZIP · MP4 · صور
                    </span>
                  </>
                )}
              </label>
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t border-primary/15">
            <button
              onClick={handleUpload}
              disabled={
                !file ||
                !selectedAccount ||
                stage === 'uploading' ||
                stage === 'resuming' ||
                stage === 'initializing' ||
                stage === 'finalizing'
              }
              className="w-full bg-primary text-primary-foreground rounded-xl p-2.5 text-sm font-semibold hover:opacity-95 transition disabled:opacity-50"
            >
              {stage === 'initializing' && 'جارٍ التجهيز...'}
              {stage === 'resuming' && 'جارٍ استئناف الرفع...'}
              {stage === 'uploading' && `جارٍ الرفع... ${progress}%`}
              {stage === 'paused' && 'استئناف الرفع'}
              {stage === 'finalizing' && 'جارٍ الإنهاء...'}
              {(stage === 'idle' || stage === 'done' || stage === 'error') &&
                (selectedAccount
                  ? `رفع إلى Drive (${selectedAccount.google_account_email})`
                  : 'رفع إلى Drive')}
            </button>

            {(stage === 'uploading' || stage === 'resuming' || stage === 'paused') && (
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
 * Sends one resumable range directly to Google Drive using XHR (for progress
 * events). A 308 tells us where to continue; 200/201 completes the object.
 */
function uploadChunk(
  uploadUrl: string,
  file: File,
  startByte: number,
  onProgress: (loadedBytes: number) => void,
  onXhr: (xhr: XMLHttpRequest | null) => void,
): Promise<{ driveFileId?: string; nextByte?: number }> {
  return new Promise((resolve, reject) => {
    if (startByte >= file.size) {
      reject(new Error('UPLOAD_STALLED'));
      return;
    }

    const xhr = new XMLHttpRequest();
    onXhr(xhr);
    xhr.open('PUT', uploadUrl, true);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.setRequestHeader('Content-Range', `bytes ${startByte}-${file.size - 1}/${file.size}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded);
    };

    xhr.onload = () => {
      onXhr(null);
      if (xhr.status === 308) {
        const range = xhr.getResponseHeader('Range');
        const nextByte = range ? parseInt(range.split('-')[1], 10) + 1 : NaN;
        if (!Number.isFinite(nextByte) || nextByte <= startByte) {
          reject(new Error('UPLOAD_STALLED'));
          return;
        }
        resolve({ nextByte });
        return;
      }
      if (xhr.status === 200 || xhr.status === 201) {
        try {
          const data = JSON.parse(xhr.responseText);
          if (!data.id) throw new Error('NO_DRIVE_FILE_ID');
          resolve({ driveFileId: data.id });
        } catch {
          reject(new Error('INVALID_DRIVE_RESPONSE'));
        }
        return;
      }
      if (xhr.status === 404) reject(new Error('UPLOAD_SESSION_EXPIRED'));
      else reject(new Error(`DRIVE_UPLOAD_FAILED: ${xhr.status}`));
    };

    xhr.onerror = () => {
      onXhr(null);
      reject(new Error('NETWORK_ERROR'));
    };
    xhr.ontimeout = () => {
      onXhr(null);
      reject(new Error('UPLOAD_TIMEOUT'));
    };
    xhr.onabort = () => {
      onXhr(null);
      reject(new Error('NETWORK_ERROR'));
    };

    // slice() keeps memory bounded when resuming a large file.
    xhr.send(file.slice(startByte));
  });
}