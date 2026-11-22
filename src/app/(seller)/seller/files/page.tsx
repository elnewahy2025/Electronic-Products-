import Link from 'next/link';
import { listMyFiles } from '@/lib/server/services/seller-file-service';
import { processPendingScans } from '@/lib/server/services/scan-service';
import { processPendingPreviews } from '@/lib/server/services/preview-service';

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  uploading: { label: 'جارٍ الرفع', cls: 'bg-gray-100 text-gray-800' },
  uploaded: { label: 'بانتظار الفحص', cls: 'bg-yellow-100 text-yellow-800' },
  scanning: { label: 'قيد الفحص', cls: 'bg-yellow-100 text-yellow-800' },
  processing: { label: 'إنشاء معاينة', cls: 'bg-blue-100 text-blue-800' },
  ready: { label: 'جاهز', cls: 'bg-green-100 text-green-800' },
  quarantined: { label: 'معزول', cls: 'bg-red-100 text-red-800' },
  failed: { label: 'فشل', cls: 'bg-red-100 text-red-800' },
  deleted: { label: 'محذوف', cls: 'bg-gray-100 text-gray-800' },
};

export default async function SellerFilesPage() {
  let files = await listMyFiles();

  // If any files are awaiting scan or preview generation, process them immediately so they become ready
  const hasPending = files.some(
    f => f.scan_status === 'uploaded' || f.scan_status === 'processing',
  );
  if (hasPending) {
    await processPendingScans(5).catch(() => {});
    await processPendingPreviews(5).catch(() => {});
    files = await listMyFiles();
  }

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">مكتبة الملفات</h1>
          <p className="text-sm text-muted-foreground mt-1">
            الملفات المرفوعة. فقط الملفات «الجاهزة» يمكن ربطها بإصدار منتج.
          </p>
        </div>
        <Link href="/seller/upload" className="bg-primary text-primary-foreground rounded px-4 py-2 text-sm">
          + رفع ملف
        </Link>
      </div>

      {files.length === 0 ? (
        <div className="border rounded p-8 text-center text-muted-foreground">
          <p>لا توجد ملفات بعد.</p>
          <Link href="/seller/upload" className="text-primary mt-2 inline-block">ارفع أول ملف ←</Link>
        </div>
      ) : (
        <div className="border rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-right p-3">الاسم</th>
                <th className="text-right p-3">النوع</th>
                <th className="text-right p-3">الحجم</th>
                <th className="text-right p-3">الحالة</th>
                <th className="text-right p-3">مرتبط؟</th>
                <th className="text-right p-3">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {files.map(f => {
                const s = STATUS_LABELS[f.scan_status] ?? { label: f.scan_status, cls: 'bg-gray-100 text-gray-800' };
                return (
                  <tr key={f.file_version_id} className="border-t">
                    <td className="p-3">
                      <p className="font-medium truncate max-w-xs">{f.display_name || f.original_name}</p>
                      {f.display_name && (
                        <p className="text-xs text-muted-foreground">{f.original_name}</p>
                      )}
                    </td>
                    <td className="p-3 text-xs font-mono">{f.extension}</td>
                    <td className="p-3 text-xs">{(f.size_bytes / 1024).toFixed(0)} KB</td>
                    <td className="p-3"><span className={`text-xs px-2 py-0.5 rounded ${s.cls}`}>{s.label}</span></td>
                    <td className="p-3 text-xs">{f.is_linked ? 'نعم' : '—'}</td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {new Date(f.created_at).toLocaleDateString('ar')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}