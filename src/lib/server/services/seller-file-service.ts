import 'server-only';
import { createClient } from '@/lib/supabase/server';

export type SellerFileRow = {
  file_id: string;
  file_version_id: string;
  original_name: string;
  display_name: string | null;
  extension: string | null;
  mime: string | null;
  size_bytes: number;
  scan_status: string;
  created_at: string;
  is_linked: boolean;
};

export async function listMyFiles(): Promise<SellerFileRow[]> {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return [];

  const { data } = await db
    .from('file_versions')
    .select(`
      id, size_bytes, mime, extension, scan_status, created_at,
      files!inner(id, seller_id, original_name, display_name)
    `)
    .eq('files.seller_id', user.id)
    .neq('scan_status', 'deleted')
    .order('created_at', { ascending: false })
    .limit(200);

  const fvIds = (data ?? []).map((r: any) => r.id);
  const linkedSet = new Set<string>();
  if (fvIds.length > 0) {
    const { data: links } = await db
      .from('product_version_files')
      .select('file_version_id')
      .in('file_version_id', fvIds);
    links?.forEach((l: any) => linkedSet.add(l.file_version_id));
  }

  return (data ?? []).map((row: any) => ({
    file_id: row.files.id,
    file_version_id: row.id,
    original_name: row.files.original_name,
    display_name: row.files.display_name,
    extension: row.extension,
    mime: row.mime,
    size_bytes: Number(row.size_bytes),
    scan_status: row.scan_status,
    created_at: row.created_at,
    is_linked: linkedSet.has(row.id),
  }));
}

export async function listReadyFilesForLinking(): Promise<SellerFileRow[]> {
  const all = await listMyFiles();
  return all.filter(f => f.scan_status === 'ready');
}