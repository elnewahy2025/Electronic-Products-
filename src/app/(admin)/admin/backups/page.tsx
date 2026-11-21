import { createClient } from '@/lib/supabase/server';
import { BackupActions } from './backup-actions';

export default async function BackupsPage() {
  const db = await createClient();
  const [{ data: settings }, { data: jobs }] = await Promise.all([
    db.from('backup_settings').select('*').eq('id', 1).single(),
    db.from('backup_jobs')
      .select('id, type, status, started_at, finished_at, size_bytes, storage_location, error, profiles!backup_jobs_triggered_by_fkey(email)')
      .order('started_at', { ascending: false })
      .limit(50),
  ]);

  return (
    <main className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">النسخ الاحتياطي</h1>

      <div className="border rounded p-4">
        <h2 className="font-semibold mb-2">الإعدادات الحالية</h2>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <p>الجدول: <b>{settings?.schedule}</b></p>
          <p>الاحتفاظ: <b>{settings?.retention_days} يوم</b></p>
          <p>مزوّد التخزين: <b>{settings?.storage_provider ?? 'غير محدد'}</b></p>
          <p>يشمل الملفات: <b>{settings?.include_files ? 'نعم' : 'لا'}</b></p>
        </div>
      </div>

      <BackupActions />

      <section>
        <h2 className="font-semibold mb-2">السجل</h2>
        <div className="border rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-right p-3">البداية</th>
                <th className="text-right p-3">النوع</th>
                <th className="text-right p-3">الحالة</th>
                <th className="text-right p-3">الحجم</th>
                <th className="text-right p-3">المنفّذ</th>
                <th className="text-right p-3">المكان</th>
              </tr>
            </thead>
            <tbody>
              {(jobs ?? []).map((j: any) => (
                <tr key={j.id} className="border-t">
                  <td className="p-3 text-xs">{new Date(j.started_at).toLocaleString('ar')}</td>
                  <td className="p-3 text-xs">{j.type}</td>
                  <td className="p-3 text-xs">
                    <span className={`px-2 py-0.5 rounded ${
                      j.status === 'completed' ? 'bg-green-100 text-green-800'
                      : j.status === 'failed' ? 'bg-red-100 text-red-800'
                      : 'bg-yellow-100 text-yellow-800'
                    }`}>{j.status}</span>
                  </td>
                  <td className="p-3 text-xs">
                    {j.size_bytes ? `${(j.size_bytes / 1024 / 1024).toFixed(1)} MB` : '—'}
                  </td>
                  <td className="p-3 text-xs">{j.profiles?.email ?? '—'}</td>
                  <td className="p-3 text-xs text-muted-foreground">{j.storage_location ?? '—'}</td>
                </tr>
              ))}
              {!jobs?.length && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">لا يوجد سجل</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}