import { createClient } from '@/lib/supabase/server';
import { QuarantineActions } from './quarantine-actions';

export default async function QuarantinePage() {
  const db = await createClient();
  const { data } = await db
    .from('quarantine_records')
    .select(`
      id, file_version_id, reason, quarantined_at,
      file_versions!inner(
        id, extension, size_bytes,
        files!inner(id, original_name, seller_id, seller_profiles!inner(display_name))
      )
    `)
    .is('released_at', null)
    .order('quarantined_at', { ascending: false })
    .limit(100);

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold mb-6">الملفات المعزولة</h1>

      {!data?.length ? (
        <p className="text-muted-foreground">لا توجد ملفات معزولة.</p>
      ) : (
        <div className="border rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-right p-3">الملف</th>
                <th className="text-right p-3">البائع</th>
                <th className="text-right p-3">السبب</th>
                <th className="text-right p-3">التاريخ</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {data.map((row: any) => (
                <tr key={row.id} className="border-t">
                  <td className="p-3">
                    <p className="font-medium">{row.file_versions.files.original_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.file_versions.extension} — {(Number(row.file_versions.size_bytes) / 1024).toFixed(0)} KB
                    </p>
                  </td>
                  <td className="p-3 text-xs">{row.file_versions.files.seller_profiles.display_name}</td>
                  <td className="p-3 text-xs text-red-700 max-w-xs truncate">{row.reason}</td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {new Date(row.quarantined_at).toLocaleString('ar')}
                  </td>
                  <td className="p-3">
                    <QuarantineActions
                      fileVersionId={row.file_version_id}
                      fileName={row.file_versions.files.original_name}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
