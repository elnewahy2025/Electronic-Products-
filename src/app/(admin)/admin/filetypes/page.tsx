import { createClient } from '@/lib/supabase/server';
import { FileTypeManager } from './file-type-manager';

export default async function FileTypesPage() {
  const db = await createClient();
  const { data } = await db.from('allowed_file_types').select('*').order('extension');

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold mb-6">أنواع الملفات المسموحة</h1>
      <FileTypeManager initial={data ?? []} />
    </main>
  );
}