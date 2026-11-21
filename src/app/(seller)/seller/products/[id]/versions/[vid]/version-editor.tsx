'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type VersionFile = {
  id: string;
  file_version_id: string;
  display_name: string | null;
  sort_order: number;
  included_in_zip: boolean;
  file_name: string;
  file_size: number;
  scan_status: string;
  mime: string | null;
};

type AvailableFile = {
  file_id: string;
  file_version_id: string;
  original_name: string;
  display_name: string | null;
  extension: string | null;
  size_bytes: number;
  scan_status: string;
};

export function VersionEditor({
  versionId,
  status,
  initialFiles,
  availableFiles,
}: {
  versionId: string;
  status: string;
  initialFiles: VersionFile[];
  availableFiles: AvailableFile[];
}) {
  const [files, setFiles] = useState(initialFiles);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const router = useRouter();

  const linkedIds = new Set(files.map(f => f.file_version_id));
  const candidates = availableFiles.filter(f => !linkedIds.has(f.file_version_id));

  const canEdit = status === 'draft';
  const canPublish = status === 'draft' && files.length > 0 && files.every(f => f.scan_status === 'ready');

  async function addFile(fileVersionId: string) {
    setBusy(true); setError(null);
    const res = await fetch(`/api/seller/versions/${versionId}/files`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ file_version_id: fileVersionId }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error);
    setShowPicker(false);
    router.refresh();
  }

  async function removeFile(pvfId: string) {
    if (!confirm('إزالة هذا الملف من الإصدار؟')) return;
    setBusy(true); setError(null);
    const res = await fetch(`/api/seller/versions/${versionId}/files/${pvfId}`, { method: 'DELETE' });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json();
      return setError(json.error);
    }
    router.refresh();
  }

  async function publish() {
    if (!canPublish) return;
    if (!confirm('نشر هذا الإصدار؟ سيصبح متاحًا للمشترين. الإصدار المنشور الحالي سيؤرشف تلقائيًا.')) return;
    setBusy(true); setError(null);
    const res = await fetch(`/api/seller/versions/${versionId}/publish`, { method: 'POST' });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error);
    router.refresh();
  }

  async function toggleZip(pvfId: string, current: boolean) {
    await fetch(`/api/seller/versions/${versionId}/files/${pvfId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ included_in_zip: !current }),
    });
    setFiles(f => f.map(x => x.id === pvfId ? { ...x, included_in_zip: !current } : x));
  }

  return (
    <div className="space-y-4">
      <div className="border rounded p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">الملفات ({files.length})</h2>
          {canEdit && (
            <button onClick={() => setShowPicker(!showPicker)} className="text-sm text-primary">
              {showPicker ? 'إغلاق' : '+ إضافة ملف'}
            </button>
          )}
        </div>

        {showPicker && (
          <div className="border rounded p-3 bg-muted/20 space-y-2">
            {candidates.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                لا توجد ملفات جاهزة للإضافة. الملفات تحتاج أن تنجح في الفحص أولًا.{' '}
                <a href="/seller/files" className="text-primary">مكتبة الملفات</a>
              </p>
            ) : (
              candidates.map(f => (
                <div key={f.file_version_id} className="flex items-center justify-between border rounded p-2 bg-background">
                  <div>
                    <p className="text-sm font-medium">{f.display_name || f.original_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {f.extension} — {(f.size_bytes / 1024).toFixed(0)} KB
                    </p>
                  </div>
                  <button
                    onClick={() => addFile(f.file_version_id)}
                    disabled={busy}
                    className="text-xs bg-primary text-primary-foreground rounded px-3 py-1 disabled:opacity-50"
                  >
                    إضافة
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {files.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            لا ملفات مرتبطة بهذا الإصدار. أضف ملفات قبل النشر.
          </p>
        ) : (
          <div className="divide-y">
            {files.map(f => (
              <div key={f.id} className="py-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{f.display_name || f.file_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {f.file_name} — {(f.file_size / 1024).toFixed(0)} KB
                    {f.scan_status !== 'ready' && ` — حالة: ${f.scan_status}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={f.included_in_zip}
                      disabled={!canEdit}
                      onChange={() => toggleZip(f.id, f.included_in_zip)}
                    />
                    ضمن ZIP
                  </label>
                  {canEdit && (
                    <button
                      onClick={() => removeFile(f.id)}
                      disabled={busy}
                      className="text-xs text-red-600"
                    >
                      إزالة
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {status === 'draft' && (
        <div className="border rounded p-4 space-y-2">
          <p className="text-sm">
            {canPublish
              ? 'الإصدار جاهز للنشر.'
              : 'أضف ملفًا واحدًا جاهزًا على الأقل قبل النشر.'}
          </p>
          <button
            onClick={publish}
            disabled={!canPublish || busy}
            className="bg-green-600 text-white rounded px-4 py-2 text-sm disabled:opacity-50"
          >
            {busy ? 'جارٍ...' : 'نشر الإصدار'}
          </button>
        </div>
      )}

      {status === 'published' && (
        <div className="border rounded p-4 bg-green-50 text-sm">
          <p className="font-medium text-green-800">هذا الإصدار منشور</p>
          <p className="text-xs text-green-700 mt-1">
            المشترون الجدد سيحصلون على هذا الإصدار. لإنشاء إصدار جديد، ارجع لصفحة الإصدارات.
          </p>
        </div>
      )}

      {status === 'archived' && (
        <div className="border rounded p-4 bg-gray-50 text-sm">
          <p className="font-medium">هذا الإصدار مؤرشف</p>
          <p className="text-xs text-muted-foreground mt-1">
            لا يزال متاحًا لمن اشتراه، لكنه لم يعد الخيار الحالي للمشترين الجدد.
          </p>
        </div>
      )}

      {error && <p className="text-red-600 text-sm">{error}</p>}
    </div>
  );
}