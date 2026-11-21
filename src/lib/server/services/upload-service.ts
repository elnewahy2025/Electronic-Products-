import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { decrypt } from '@/lib/crypto/encryption';
import { initiateResumableUpload, checkResumableUploadStatus } from '@/lib/drive/resumable';
import { getDriveFileMeta, getDriveQuota } from '@/lib/drive/client';
import { logAudit } from '@/lib/audit/logger';

export type InitUploadInput = {
  sellerId: string;
  originalName: string;
  mime: string;
  size: number;
  checksum?: string;
  driveAccountId?: string;
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

  // 3. Fetch refresh token
  const { data: accRow } = await admin
    .from('seller_drive_accounts')
    .select('encrypted_refresh_token')
    .eq('id', accountId)
    .single();
  if (!accRow?.encrypted_refresh_token) throw new Error('DRIVE_NOT_LINKED');
  const refreshToken = decrypt(accRow.encrypted_refresh_token);

  // 4. Create Drive resumable session
  const { uploadUrl } = await initiateResumableUpload({
    refreshToken,
    filename: input.originalName,
    mime: input.mime,
    size: input.size,
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