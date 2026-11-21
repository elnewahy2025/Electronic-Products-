import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getVersionFiles } from '@/lib/server/services/seller-version-service';
import { listReadyFilesForLinking } from '@/lib/server/services/seller-file-service';
import { VersionEditor } from './version-editor';

export default async function VersionDetailPage({
  params,
}: {
  params: { id: string; vid: string };
}) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) notFound();

  const { data: version } = await db
    .from('product_versions')
    .select('id, product_id, version_number, status, published_at')
    .eq('id', params.vid)
    .eq('product_id', params.id)
    .maybeSingle();

  if (!version) notFound();

  const [files, availableFiles] = await Promise.all([
    getVersionFiles(params.vid),
    listReadyFilesForLinking(),
  ]);

  return (
    <main className="p-6 space-y-6 max-w-4xl">
      <nav className="text-sm text-muted-foreground">
        <Link href="/seller/products" className="hover:underline">منتجاتي</Link>
        {' / '}
        <Link href={`/seller/products/${params.id}`} className="hover:underline">المنتج</Link>
        {' / '}
        <Link href={`/seller/products/${params.id}/versions`} className="hover:underline">الإصدارات</Link>
        {' / '}
        <span>#{version.version_number}</span>
      </nav>

      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">الإصدار #{version.version_number}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {version.status === 'published' ? 'منشور حاليًا' : version.status === 'archived' ? 'مؤرشف' : 'مسودة'}
          </p>
        </div>
      </div>

      <VersionEditor
        versionId={params.vid}
        status={version.status}
        initialFiles={files}
        availableFiles={availableFiles}
      />
    </main>
  );
}