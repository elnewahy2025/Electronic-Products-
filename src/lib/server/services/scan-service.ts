import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { decrypt } from '@/lib/crypto/encryption';
import { getDriveClient } from '@/lib/drive/client';
import { detectFileType, isCompatibleWithExtension } from '@/lib/files/signature';

const SIGNATURE_BYTES = 8192;

export type ScanJob = {
  job_id: string;
  file_version_id: string;
  seller_id: string;
  file_id: string;
  extension: string | null;
  mime: string | null;
  storage_location_id: string | null;
  drive_account_id: string | null;
  provider_file_id: string | null;
};

/**
 * Download the first bytes of a Drive file via a ranged request.
 * Much cheaper than full download.
 */
async function fetchFileHead(
  refreshToken: string,
  fileId: string,
  bytes = SIGNATURE_BYTES
): Promise<Buffer> {
  const drive = await getDriveClient(refreshToken);
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer', headers: { Range: `bytes=0-${bytes - 1}` } }
  );
  return Buffer.from(res.data as ArrayBuffer);
}

export async function processScanJob(job: ScanJob): Promise<{
  result: 'passed' | 'quarantined' | 'skipped';
  reason?: string;
}> {
  const admin = createAdminClient();

  if (!job.drive_account_id || !job.provider_file_id) {
    await admin.rpc('quarantine_file', {
      p_file_version_id: job.file_version_id,
      p_reason: 'storage_location_missing',
    });
    return { result: 'quarantined', reason: 'storage_location_missing' };
  }

  if (!job.extension) {
    await admin.rpc('quarantine_file', {
      p_file_version_id: job.file_version_id,
      p_reason: 'missing_extension',
    });
    return { result: 'quarantined', reason: 'missing_extension' };
  }

  // Fetch refresh token
  const { data: acc } = await admin
    .from('seller_drive_accounts')
    .select('encrypted_refresh_token, status')
    .eq('id', job.drive_account_id)
    .single();

  if (!acc?.encrypted_refresh_token) {
    await admin.rpc('quarantine_file', {
      p_file_version_id: job.file_version_id,
      p_reason: 'drive_token_unavailable',
    });
    return { result: 'quarantined', reason: 'drive_token_unavailable' };
  }

  let head: Buffer;
  try {
    const token = decrypt(acc.encrypted_refresh_token);
    head = await fetchFileHead(token, job.provider_file_id);
  } catch (e: any) {
    await admin.rpc('quarantine_file', {
      p_file_version_id: job.file_version_id,
      p_reason: `drive_fetch_failed: ${e.message?.slice(0, 100)}`,
    });
    return { result: 'quarantined', reason: 'drive_fetch_failed' };
  }

  const detected = detectFileType(head);
  if (!detected) {
    await admin.rpc('quarantine_file', {
      p_file_version_id: job.file_version_id,
      p_reason: 'unknown_signature',
    });
    return { result: 'quarantined', reason: 'unknown_signature' };
  }

  if (!isCompatibleWithExtension(detected, job.extension)) {
    await admin.rpc('quarantine_file', {
      p_file_version_id: job.file_version_id,
      p_reason: `signature_mismatch: detected ${detected.ext} vs claimed ${job.extension}`,
    });
    return { result: 'quarantined', reason: 'signature_mismatch' };
  }

  await admin.rpc('complete_scan_pass', { p_file_version_id: job.file_version_id });
  return { result: 'passed' };
}

export async function processPendingScans(limit = 3): Promise<{
  processed: number;
  passed: number;
  quarantined: number;
  errors: number;
}> {
  const admin = createAdminClient();
  const { data: jobs } = await admin.rpc('claim_scan_jobs', { p_limit: limit });

  let passed = 0, quarantined = 0, errors = 0;

  for (const job of (jobs ?? []) as ScanJob[]) {
    try {
      const r = await processScanJob(job);
      if (r.result === 'passed') passed++;
      else if (r.result === 'quarantined') quarantined++;
    } catch (e: any) {
      errors++;
      await admin.from('scan_jobs').update({
        status: 'failed',
        error: e.message?.slice(0, 200) ?? 'unknown',
        finished_at: new Date().toISOString(),
      }).eq('id', job.job_id);
    }
  }

  return { processed: jobs?.length ?? 0, passed, quarantined, errors };
}
