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

  // Read through the row-scoped safe views (migration 041). They hide provider
  // identifiers and enforce seller ownership inside the view, even though the
  // surrounding page also checks `user.id`.
  const { data: files } = await db
    .from('files_safe')
    .select('id, original_name, display_name')
    .eq('seller_id', user.id)
    .order('created_at', { ascending: false })
    .limit(200);

  const fileIds = (files ?? []).map(f => f.id);
  if (fileIds.length === 0) return [];

  const { data: versions } = await db
    .from('file_versions_safe')
    .select('id, file_id, size_bytes, mime, extension, scan_status, created_at')
    .in('file_id', fileIds)
    .neq('scan_status', 'deleted')
    .order('created_at', { ascending: false })
    .limit(200);

  const fileById = new Map((files ?? []).map(f => [f.id, f]));
  const fvIds = (versions ?? []).map(v => v.id);
  const linkedSet = new Set<string>();
  if (fvIds.length > 0) {
    const { data: links } = await db
      .from('product_version_files')
      .select('file_version_id')
      .in('file_version_id', fvIds);
    links?.forEach((l: any) => linkedSet.add(l.file_version_id));
  }

  return (versions ?? []).flatMap(row => {
    const file = fileById.get(row.file_id);
    if (!file) return [];
    return [{
      file_id: file.id,
      file_version_id: row.id,
      original_name: file.original_name,
      display_name: file.display_name,
      extension: row.extension,
      mime: row.mime,
      size_bytes: Number(row.size_bytes),
      scan_status: row.scan_status,
      created_at: row.created_at,
      is_linked: linkedSet.has(row.id),
    }];
  });
}

export async function listReadyFilesForLinking(): Promise<SellerFileRow[]> {
  const all = await listMyFiles();
  return all.filter(f => f.scan_status === 'ready');
}