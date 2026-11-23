'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

type FileStatus = {
  file_version_id: string;
  display_name: string;
  size_bytes: number;
  mime: string | null;
  included_in_zip: boolean;
  delivered: boolean;
};

type SessionData = {
  session: {
    id: string;
    status: string;
    expires_at: string;
    is_compensation: boolean;
  };
  files: FileStatus[];
  attempts: { max: number; used: number; remaining: number };
};

export default function DownloadPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [data, setData] = useState<SessionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/download/${sessionId}`);
    const json = await res.json();
    if (!res.ok) return setError(json.error);
    setData(json);
  }, [sessionId]);

  useEffect(() => { load(); }, [load]);

  async function startDownload(type: 'zip' | 'single', fileVersionId?: string) {
    setBusy(fileVersionId ?? 'zip');
    setError(null);
    try {
      const res = await fetch(`/api/download/${sessionId}/init`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          type === 'zip' ? { type: 'zip' } : { type: 'single', file_version_id: fileVersionId }
        ),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      window.location.href = json.url;
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  if (error && !data) return <main className="container py-8 text-red-600">{error}</main>;
  if (!data) return <main className="container py-8">جارٍ التحميل...</main>;

  const expired = new Date(data.session.expires_at).getTime() < Date.now();
  const remaining = data.attempts.remaining;

  return (
    <main className="container max-w-2xl py-8 space-y-6">
      <h1 className="text-2xl font-bold">تنزيل المنتج</h1>

      <div className="border rounded p-4 space-y-1 text-sm">
        <p>الحالة: <b>{data.session.status}</b></p>
        <p>تنتهي الجلسة: {new Date(data.session.expires_at).toLocaleString('ar')}</p>
        <p>المحاولات المتبقية: <b>{remaining}</b> من {data.attempts.max}</p>
        {data.session.is_compensation && <p className="text-blue-600">جلسة تعويضية</p>}
      </div>

      {expired && (
        <p className="text-red-600">انتهت صلاحية الجلسة. اطلب من الإدارة فتح جلسة تعويضية.</p>
      )}

      {!expired && remaining === 0 && (
        <p className="text-red-600">استنفدت المحاولات. تواصل مع الإدارة لطلب استثناء.</p>
      )}

      {!expired && remaining > 0 && (
        <>
          <button
            onClick={() => startDownload('zip')}
            disabled={busy !== null}
            className="w-full bg-primary text-primary-foreground rounded p-3 disabled:opacity-50"
          >
            {busy === 'zip' ? 'جارٍ التجهيز...' : 'تنزيل الكل (ZIP)'}
          </button>

          <div className="space-y-2">
            <h2 className="font-semibold">الملفات</h2>
            {data.files.map(f => (
              <div
                key={f.file_version_id}
                className="flex items-center justify-between border rounded p-3"
              >
                <div>
                  <p className="font-medium">{f.display_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(f.size_bytes / 1024 / 1024).toFixed(2)} MB
                    {!f.included_in_zip && ' — خارج ZIP'}
                    {f.delivered && ' — تم التسليم'}
                  </p>
                </div>
                <button
                  disabled={f.delivered || busy !== null}
                  onClick={() => startDownload('single', f.file_version_id)}
                  className="text-sm border rounded px-3 py-1 disabled:opacity-40"
                >
                  {f.delivered ? 'مسلَّم' : (busy === f.file_version_id ? '...' : 'تنزيل')}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {error && <p className="text-red-600 text-sm">{error}</p>}
    </main>
  );
}