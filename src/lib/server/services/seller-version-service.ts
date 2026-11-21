import 'server-only';
import { revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/logger';

export type VersionRow = {
  id: string;
  product_id: string;
  version_number: number;
  status: 'draft' | 'published' | 'archived';
  published_at: string | null;
  created_at: string;
  files_count: number;
};

export type VersionFile = {
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

export async function listVersions(productId: string): Promise<VersionRow[]> {
  const db = await createClient();
  const { data } = await db
    .from('product_versions')
    .select(`
      id, product_id, version_number, status, published_at, created_at,
      product_version_files(id)
    `)
    .eq('product_id', productId)
    .order('version_number', { ascending: false });

  return (data ?? []).map((v: any) => ({
    id: v.id,
    product_id: v.product_id,
    version_number: v.version_number,
    status: v.status,
    published_at: v.published_at,
    created_at: v.created_at,
    files_count: v.product_version_files?.length ?? 0,
  }));
}

export async function createVersion(productId: string): Promise<{ id: string; version_number: number }> {
  const db = await createClient();

  const { data: existing } = await db
    .from('product_versions')
    .select('version_number')
    .eq('product_id', productId)
    .order('version_number', { ascending: false })
    .limit(1);

  const next = (existing?.[0]?.version_number ?? 0) + 1;

  const { data, error } = await db
    .from('product_versions')
    .insert({
      product_id: productId,
      version_number: next,
      status: 'draft',
    })
    .select('id, version_number')
    .single();

  if (error) throw new Error(error.message);
  revalidateTag('storefront-products');
  return data;
}

export async function getVersionFiles(versionId: string): Promise<VersionFile[]> {
  const db = await createClient();
  const { data } = await db
    .from('product_version_files')
    .select(`
      id, file_version_id, display_name, sort_order, included_in_zip,
      file_versions!inner(
        size_bytes, scan_status, mime,
        files!inner(original_name)
      )
    `)
    .eq('product_version_id', versionId)
    .order('sort_order', { ascending: true });

  return (data ?? []).map((row: any) => ({
    id: row.id,
    file_version_id: row.file_version_id,
    display_name: row.display_name,
    sort_order: row.sort_order,
    included_in_zip: row.included_in_zip,
    file_name: row.file_versions.files.original_name,
    file_size: Number(row.file_versions.size_bytes),
    scan_status: row.file_versions.scan_status,
    mime: row.file_versions.mime,
  }));
}

export async function addFileToVersion(
  versionId: string,
  fileVersionId: string
): Promise<void> {
  const db = await createClient();
  const { error } = await db.rpc('add_file_to_version', {
    p_version_id: versionId,
    p_file_version_id: fileVersionId,
  });
  if (error) {
    if (error.message.includes('file_not_ready')) throw new Error('file_not_ready');
    if (error.message.includes('file_not_owned')) throw new Error('file_not_owned');
    throw new Error(error.message);
  }
  revalidateTag('storefront-products');
}

export async function removeFileFromVersion(
  versionId: string,
  pvfId: string
): Promise<void> {
  const db = await createClient();
  const { error } = await db
    .from('product_version_files')
    .delete()
    .eq('id', pvfId)
    .eq('product_version_id', versionId);
  if (error) throw new Error(error.message);
  revalidateTag('storefront-products');
}

export async function updateVersionFile(
  pvfId: string,
  patch: { display_name?: string | null; sort_order?: number; included_in_zip?: boolean }
): Promise<void> {
  const db = await createClient();
  const { error } = await db
    .from('product_version_files')
    .update(patch)
    .eq('id', pvfId);
  if (error) throw new Error(error.message);
  revalidateTag('storefront-products');
}

export async function publishVersion(versionId: string): Promise<void> {
  const db = await createClient();
  const { error } = await db.rpc('publish_product_version', {
    p_version_id: versionId,
  });
  if (error) {
    if (error.message.includes('version_has_no_files')) throw new Error('version_has_no_files');
    if (error.message.includes('version_has_unready_files')) throw new Error('version_has_unready_files');
    throw new Error(error.message);
  }
  revalidateTag('storefront-products');
}