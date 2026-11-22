import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { decrypt } from '@/lib/crypto/encryption';
import { initiateResumableUpload, checkResumableUploadStatus } from '@/lib/drive/resumable';
import {
  ensureStoreFolder,
  ensureTypeSubfolderInStore,
  getDriveFileMeta,
  getDriveQuota,
  isFileInsideFolder,
} from '@/lib/drive/client';
import { logAudit } from '@/lib/audit/logger';

export type InitUploadInput = {
  sellerId: string;
  originalName: string;
  mime: string;
  size: number;
  checksum?: string;
  driveAccountId?: string;
  origin?: string;
};

export type InitUploadResult = {
  sessionId: string;
  uploadUrl: string;
  driveAccountId: string;
};

export async function initUpload(input: InitUploadInput): Promise<InitUploadResult> {
  const db = await createClient();
  const admin = createAdminClient();

  // 1. Extension check
  const dot = input.originalName.lastIndexOf('.');
  const ext = dot >= 0 ? input.originalName.slice(dot + 1).toLowerCase() : '';
  if (!ext) throw new Error('INVALID_FILENAME');

  const { data: fileType } = await admin
    .from('allowed_file_types')
    .select('mime, max_size_bytes')
    .eq('extension', ext)
    .eq('is_enabled', true)
    .maybeSingle();

  if (!fileType) throw new Error('FILE_TYPE_NOT_ALLOWED');
  if (fileType.max_size_bytes && input.size > Number(fileType.max_size_bytes)) {
    throw new Error('FILE_TOO_LARGE');
  }
  if (input.size <= 0) throw new Error('EMPTY_FILE');

  // 2. Choose account
  let accountId = input.driveAccountId;
  if (accountId) {
    const { data: acc } = await db
      .from('seller_drive_accounts')
      .select('id, status, quota_total, quota_used')
      .eq('id', accountId)
      .eq('seller_id', input.sellerId)
      .maybeSingle();
    if (!acc) throw new Error('DRIVE_ACCOUNT_NOT_FOUND');
    if (acc.status !== 'active') throw new Error('DRIVE_ACCOUNT_INACTIVE');
    if (
      acc.quota_total &&
      acc.quota_used !== null &&
      Number(acc.quota_total) - Number(acc.quota_used) < input.size
    ) {
      throw new Error('DRIVE_QUOTA_EXCEEDED');
    }
  } else {
    const { data: picked, error } = await admin.rpc('pick_drive_account', {
      p_seller_id: input.sellerId,
      p_size_bytes: input.size,
    });
    if (error || !picked) {
      throw new Error(error?.message ?? 'NO_DRIVE_ACCOUNT');
    }
    accountId = picked as string;
  }

  // 3. Fetch refresh token + dedicated Store folder ID
  const { data: accRow } = await admin
    .from('seller_drive_accounts')
    .select('encrypted_refresh_token, store_folder_id')
    .eq('id', accountId)
    .single();
  if (!accRow?.encrypted_refresh_token) throw new Error('DRIVE_NOT_LINKED');
  const refreshToken = decrypt(accRow.encrypted_refresh_token);

  // 3b. Ensure dedicated `Store/<Type>` subfolder exists on Google Drive
  const storeFolderId = await ensureStoreFolder(
    refreshToken,
    (accRow as any).store_folder_id ?? null,
  );
  if (storeFolderId !== (accRow as any).store_folder_id) {
    await admin
      .from('seller_drive_accounts')
      .update({ store_folder_id: storeFolderId } as any)
      .eq('id', accountId);
  }
  const { folderId: targetSubfolderId } = await ensureTypeSubfolderInStore(
    refreshToken,
    storeFolderId,
    ext,
  );

  // 4. Create Drive resumable session inside Store/<Type> (pass browser Origin for CORS)
  const { uploadUrl } = await initiateResumableUpload({
    refreshToken,
    filename: input.originalName,
    mime: input.mime,
    size: input.size,
    folderId: targetSubfolderId,
    origin: input.origin,
  });

  // 5. Persist session
  const { data: session, error: se } = await admin
    .from('upload_sessions')
    .insert({
      seller_id: input.sellerId,
      provider: 'google_drive',
      drive_account_id: accountId,
      original_name: input.originalName,
      mime: input.mime,
      extension: ext,
      checksum_sha256: input.checksum ?? null,
      total_bytes: input.size,
      provider_upload_url: uploadUrl,
      status: 'uploading',
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select('id')
    .single();

  if (se || !session) throw new Error('SESSION_CREATE_FAILED');

  return { sessionId: session.id, uploadUrl, driveAccountId: accountId };
}

export async function getUploadStatus(params: {
  sellerId: string;
  sessionId: string;
}): Promise<{
  done: boolean;
  bytesReceived: number;
  driveFileId?: string;
  totalBytes: number;
}> {
  const admin = createAdminClient();

  const { data: session } = await admin
    .from('upload_sessions')
    .select('id, seller_id, provider_upload_url, status, total_bytes')
    .eq('id', params.sessionId)
    .single();

  if (!session || session.seller_id !== params.sellerId) throw new Error('NOT_FOUND');
  if (!session.provider_upload_url) {
    if (session.status === 'completed') {
      return { done: true, bytesReceived: Number(session.total_bytes ?? 0), totalBytes: Number(session.total_bytes ?? 0) };
    }
    throw new Error('UPLOAD_URL_MISSING');
  }

  const status = await checkResumableUploadStatus(session.provider_upload_url);
  return {
    done: status.done,
    bytesReceived: status.bytesReceived,
    driveFileId: status.driveFileId,
    totalBytes: Number(session.total_bytes ?? 0),
  };
}

export async function completeUpload(params: {
  sellerId: string;
  sessionId: string;
  driveFileId: string;
}): Promise<{ fileVersionId: string; fileId: string }> {
  const admin = createAdminClient();

  const { data: session } = await admin
    .from('upload_sessions')
    .select(
      'id, seller_id, drive_account_id, original_name, display_name, mime, extension, checksum_sha256, total_bytes, status, file_id'
    )
    .eq('id', params.sessionId)
    .single();

  if (!session) throw new Error('SESSION_NOT_FOUND');
  if (session.seller_id !== params.sellerId) throw new Error('FORBIDDEN');

  // Idempotent
  if (session.status === 'completed' && session.file_id) {
    const { data: fv } = await admin
      .from('file_versions')
      .select('id')
      .eq('file_id', session.file_id)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (fv) return { fileVersionId: fv.id, fileId: session.file_id };
  }
  if (session.status !== 'uploading') throw new Error('SESSION_NOT_ACTIVE');

  // Fetch Drive file to verify
  const { data: accRow } = await admin
    .from('seller_drive_accounts')
    .select('encrypted_refresh_token')
    .eq('id', session.drive_account_id!)
    .single();
  if (!accRow?.encrypted_refresh_token) throw new Error('DRIVE_NOT_LINKED');

  const refreshToken = decrypt(accRow.encrypted_refresh_token);
  const meta = await getDriveFileMeta(refreshToken, params.driveFileId);

  // Create file + storage + file_version in a transaction-like sequence
  const { data: file, error: fe } = await admin
    .from('files')
    .insert({
      seller_id: params.sellerId,
      original_name: session.original_name!,
      display_name: session.display_name ?? session.original_name,
      mime: session.mime,
      extension: session.extension,
    })
    .select('id')
    .single();
  if (fe || !file) throw new Error('FILE_CREATE_FAILED');

  const { data: storage, error: ste } = await admin
    .from('file_storage_locations')
    .insert({
      provider: 'google_drive',
      seller_drive_account_id: session.drive_account_id,
      provider_file_id: meta.id,
      status: 'active',
    })
    .select('id')
    .single();
  if (ste || !storage) throw new Error('STORAGE_CREATE_FAILED');

  const { data: fv, error: fve } = await admin
    .from('file_versions')
    .insert({
      file_id: file.id,
      version_number: 1,
      storage_location_id: storage.id,
      size_bytes: meta.size,
      checksum_sha256: meta.md5Checksum ?? session.checksum_sha256,
      mime: session.mime,
      extension: session.extension,
      scan_status: 'uploaded',
    })
    .select('id')
    .single();
  if (fve || !fv) throw new Error('FILE_VERSION_CREATE_FAILED');

  await admin.from('scan_jobs').insert({
    file_version_id: fv.id,
    status: 'queued',
    engine: 'pending',
  });

  await admin
    .from('upload_sessions')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      file_id: file.id,
    })
    .eq('id', params.sessionId);

  // Refresh quota after upload
  try {
    const quota = await getDriveQuota(refreshToken);
    await admin.rpc('update_drive_quota', {
      p_account_id: session.drive_account_id!,
      p_total: quota.total,
      p_used: quota.used,
    });
  } catch {
    /* non-fatal */
  }

  await logAudit({
    action: 'file.uploaded',
    entityType: 'file_versions',
    entityId: fv.id,
    after: { size: meta.size, mime: session.mime },
  });

  return { fileVersionId: fv.id, fileId: file.id };
}

export type ImportedDriveFileResult = {
  driveFileId: string;
  name: string;
  status: 'imported' | 'already_imported' | 'skipped';
  fileId?: string;
  fileVersionId?: string;
  sizeBytes?: number;
  error?: string;
};

/**
 * Imports existing files stored on a seller's linked Google Drive account
 * (selected via Google Picker under the non-restricted `drive.file` scope)
 * without re-uploading bytes, then enqueues the normal magic-byte scan & preview pipeline.
 */
export async function importDriveFiles(params: {
  sellerId: string;
  driveAccountId: string;
  files: Array<{ driveFileId: string; name?: string; mime?: string }>;
}): Promise<ImportedDriveFileResult[]> {
  const admin = createAdminClient();

  const { data: acc } = await admin
    .from('seller_drive_accounts')
    .select('id, seller_id, status, encrypted_refresh_token, store_folder_id')
    .eq('id', params.driveAccountId)
    .eq('seller_id', params.sellerId)
    .maybeSingle();

  if (!acc) throw new Error('DRIVE_ACCOUNT_NOT_FOUND');
  if (acc.status !== 'active') throw new Error('DRIVE_ACCOUNT_INACTIVE');
  if (!acc.encrypted_refresh_token) throw new Error('DRIVE_NOT_LINKED');

  const refreshToken = decrypt(acc.encrypted_refresh_token);
  const storeFolderId: string | null = (acc as any).store_folder_id ?? null;
  const results: ImportedDriveFileResult[] = [];

  for (const item of params.files) {
    const fallbackName = item.name || item.driveFileId;
    try {
      // 1. Fetch real Drive metadata (verifies drive.file grant from Google Picker)
      const meta = await getDriveFileMeta(refreshToken, item.driveFileId);
      const originalName = meta.name || fallbackName;
      const mime = meta.mimeType || item.mime || 'application/octet-stream';

      // 1b. Enforce Store-folder-only rule when store_folder_id is configured
      if (storeFolderId) {
        const insideStore = await isFileInsideFolder(refreshToken, meta.id, storeFolderId);
        if (!insideStore) {
          results.push({
            driveFileId: item.driveFileId,
            name: originalName,
            status: 'skipped',
            error: 'OUTSIDE_STORE_FOLDER',
          });
          continue;
        }
      }

      // 2. Reject native Google Workspace docs (no raw binary bytes; seller should export to PDF/DOCX)
      if (mime.startsWith('application/vnd.google-apps.')) {
        results.push({
          driveFileId: item.driveFileId,
          name: originalName,
          status: 'skipped',
          error: 'GOOGLE_DOCS_EXPORT_REQUIRED',
        });
        continue;
      }

      // 3. Validate extension and max size against allowed_file_types
      const dot = originalName.lastIndexOf('.');
      const ext = dot >= 0 ? originalName.slice(dot + 1).toLowerCase() : '';
      if (!ext) {
        results.push({
          driveFileId: item.driveFileId,
          name: originalName,
          status: 'skipped',
          error: 'INVALID_FILENAME',
        });
        continue;
      }

      const { data: fileType } = await admin
        .from('allowed_file_types')
        .select('mime, max_size_bytes')
        .eq('extension', ext)
        .eq('is_enabled', true)
        .maybeSingle();

      if (!fileType) {
        results.push({
          driveFileId: item.driveFileId,
          name: originalName,
          status: 'skipped',
          error: 'FILE_TYPE_NOT_ALLOWED',
        });
        continue;
      }

      if (meta.size <= 0) {
        results.push({
          driveFileId: item.driveFileId,
          name: originalName,
          status: 'skipped',
          error: 'EMPTY_FILE',
        });
        continue;
      }

      if (fileType.max_size_bytes && meta.size > Number(fileType.max_size_bytes)) {
        results.push({
          driveFileId: item.driveFileId,
          name: originalName,
          status: 'skipped',
          error: 'FILE_TOO_LARGE',
        });
        continue;
      }

      // 4. Deduplicate if this exact Drive file is already registered for this seller
      const { data: existingLoc } = await admin
        .from('file_storage_locations')
        .select('id, file_versions(id, file_id, files!inner(seller_id))')
        .eq('provider', 'google_drive')
        .eq('seller_drive_account_id', acc.id)
        .eq('provider_file_id', meta.id)
        .eq('status', 'active')
        .maybeSingle();

      const existingFv = Array.isArray((existingLoc as any)?.file_versions)
        ? (existingLoc as any).file_versions[0]
        : (existingLoc as any)?.file_versions;

      if (existingFv?.id && existingFv?.files?.seller_id === params.sellerId) {
        results.push({
          driveFileId: meta.id,
          name: originalName,
          status: 'already_imported',
          fileId: existingFv.file_id,
          fileVersionId: existingFv.id,
          sizeBytes: meta.size,
        });
        continue;
      }

      // 5. Register file + storage location + version + scan job
      const { data: file, error: fe } = await admin
        .from('files')
        .insert({
          seller_id: params.sellerId,
          original_name: originalName,
          display_name: originalName,
          mime,
          extension: ext,
        })
        .select('id')
        .single();
      if (fe || !file) throw new Error('FILE_CREATE_FAILED');

      const { data: storage, error: ste } = await admin
        .from('file_storage_locations')
        .insert({
          provider: 'google_drive',
          seller_drive_account_id: acc.id,
          provider_file_id: meta.id,
          status: 'active',
        })
        .select('id')
        .single();
      if (ste || !storage) throw new Error('STORAGE_CREATE_FAILED');

      const { data: fv, error: fve } = await admin
        .from('file_versions')
        .insert({
          file_id: file.id,
          version_number: 1,
          storage_location_id: storage.id,
          size_bytes: meta.size,
          checksum_sha256: meta.md5Checksum ?? null,
          mime,
          extension: ext,
          scan_status: 'uploaded',
        })
        .select('id')
        .single();
      if (fve || !fv) throw new Error('FILE_VERSION_CREATE_FAILED');

      await admin.from('scan_jobs').insert({
        file_version_id: fv.id,
        status: 'queued',
        engine: 'pending',
      });

      await logAudit({
        action: 'file.imported_from_drive',
        entityType: 'file_versions',
        entityId: fv.id,
        after: { drive_file_id: meta.id, size: meta.size, mime },
      });

      results.push({
        driveFileId: meta.id,
        name: originalName,
        status: 'imported',
        fileId: file.id,
        fileVersionId: fv.id,
        sizeBytes: meta.size,
      });
    } catch (e: any) {
      results.push({
        driveFileId: item.driveFileId,
        name: fallbackName,
        status: 'skipped',
        error: e?.message ?? 'IMPORT_FAILED',
      });
    }
  }

  return results;
}