import 'server-only';
import sharp from 'sharp';
import { google } from 'googleapis';
import { createAdminClient } from '@/lib/supabase/admin';
import { decrypt } from '@/lib/crypto/encryption';
import { getDriveClient } from '@/lib/drive/client';
import { applyWatermarkToImage } from './watermark-service';

const PREVIEW_BUCKET = process.env.SUPABASE_PREVIEWS_BUCKET ?? 'previews';
const MAX_DIMENSION = 1400;

export type PreviewJob = {
  preview_id: string;
  file_version_id: string;
  seller_id: string;
  file_id: string;
  extension: string | null;
  mime: string | null;
  drive_account_id: string | null;
  provider_file_id: string | null;
};

async function fetchFullFile(refreshToken: string, fileId: string): Promise<Buffer> {
  const drive = await getDriveClient(refreshToken);
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  return Buffer.from(res.data as ArrayBuffer);
}

async function uploadPreview(
  fileVersionId: string,
  buffer: Buffer,
  ext: string
): Promise<{ storage_path: string; public_url: string }> {
  const admin = createAdminClient();
  const path = `previews/${fileVersionId}/${Date.now()}.${ext}`;

  const { error } = await admin.storage
    .from(PREVIEW_BUCKET)
    .upload(path, buffer, { contentType: `image/${ext}`, upsert: false });

  if (error) throw new Error(`upload_failed: ${error.message}`);

  const { data: pub } = admin.storage.from(PREVIEW_BUCKET).getPublicUrl(path);

  return { storage_path: path, public_url: pub.publicUrl };
}

/**
 * Image preview: resize + watermark.
 */
async function generateImagePreview(job: PreviewJob, source: Buffer): Promise<void> {
  const admin = createAdminClient();

  const resized = await sharp(source)
    .rotate()
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();

  const watermarked = await applyWatermarkToImage(resized);

  const { storage_path, public_url } = await uploadPreview(job.file_version_id, watermarked, 'png');

  await admin.rpc('finalize_preview', {
    p_preview_id: job.preview_id,
    p_storage_path: storage_path,
    p_public_url: public_url,
  });
}

/**
 * PDF preview: extract first page as image, watermark.
 * Uses pdf-to-img (lightweight) as a portable option.
 */
async function generatePdfPreview(job: PreviewJob, source: Buffer): Promise<void> {
  const admin = createAdminClient();

  let firstPagePng: Buffer;
  try {
    // Lazy import to avoid loading in non-pdf paths
    const { pdf } = await import('pdf-to-img');
    const doc = await pdf(source, { scale: 1.5 });
    for await (const page of doc) {
      firstPagePng = page;
      break;
    }
    // @ts-ignore
    if (!firstPagePng) throw new Error('no_pages');
  } catch (e: any) {
    throw new Error(`pdf_render_failed: ${e.message}`);
  }

  const resized = await sharp(firstPagePng!)
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();

  const watermarked = await applyWatermarkToImage(resized);

  const { storage_path, public_url } = await uploadPreview(job.file_version_id, watermarked, 'png');

  await admin.rpc('finalize_preview', {
    p_preview_id: job.preview_id,
    p_storage_path: storage_path,
    p_public_url: public_url,
  });
}

/**
 * Office / Document / Video preview: fetch Google Drive's rendered first-page thumbnail
 * at high resolution (=s1200) and apply the platform watermark.
 * Returns true if a real thumbnail preview was generated, false if unavailable.
 */
async function generateDriveThumbnailPreview(
  job: PreviewJob,
  refreshToken: string,
): Promise<boolean> {
  if (!job.provider_file_id) return false;

  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });

  const drive = google.drive({ version: 'v3', auth: oauth2 });
  const { data: meta } = await drive.files.get({
    fileId: job.provider_file_id,
    fields: 'id, thumbnailLink',
  });

  if (!meta.thumbnailLink) return false;

  const hiResUrl = meta.thumbnailLink.replace(/=s\d+$/, '=s1200');
  const { token } = await oauth2.getAccessToken();
  const imgRes = await fetch(hiResUrl, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!imgRes.ok) return false;

  const rawBuf = Buffer.from(await imgRes.arrayBuffer());
  const resized = await sharp(rawBuf, { limitInputPixels: 64_000_000 })
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();

  const watermarked = await applyWatermarkToImage(resized, { surface: 'light' });
  const { storage_path, public_url } = await uploadPreview(job.file_version_id, watermarked, 'png');

  const admin = createAdminClient();
  await admin.rpc('finalize_preview', {
    p_preview_id: job.preview_id,
    p_storage_path: storage_path,
    p_public_url: public_url,
  });
  return true;
}

/**
 * Video / audio: create a placeholder poster with watermark.
 * Real video watermarks require ffmpeg — deferred to external service.
 * The poster is what visitors see in the product page until the dedicated
 * service is wired.
 */
async function generatePlaceholderPreview(job: PreviewJob): Promise<void> {
  const admin = createAdminClient();

  const svg = Buffer.from(`
    <svg width="1200" height="675" xmlns="http://www.w3.org/2000/svg">
      <rect width="1200" height="675" fill="#1f2937"/>
      <text x="600" y="340" text-anchor="middle" fill="#9ca3af" font-family="sans-serif" font-size="36">
        ${job.extension?.toUpperCase() ?? 'FILE'}
      </text>
      <text x="600" y="390" text-anchor="middle" fill="#6b7280" font-family="sans-serif" font-size="20">
        معاينة غير متاحة بعد
      </text>
    </svg>
  `);

  const watermarked = await applyWatermarkToImage(svg);

  const { storage_path, public_url } = await uploadPreview(job.file_version_id, watermarked, 'png');

  await admin.rpc('finalize_preview', {
    p_preview_id: job.preview_id,
    p_storage_path: storage_path,
    p_public_url: public_url,
  });
}

/**
 * Generate preview for a single claimed job.
 * Uses the extension to pick the strategy; falls back to placeholder.
 */
export async function processPreviewJob(job: PreviewJob): Promise<void> {
  const admin = createAdminClient();

  if (!job.drive_account_id || !job.provider_file_id) {
    await admin.rpc('fail_preview', {
      p_preview_id: job.preview_id,
      p_reason: 'storage_location_missing',
    });
    return;
  }

  const { data: acc } = await admin
    .from('seller_drive_accounts')
    .select('encrypted_refresh_token')
    .eq('id', job.drive_account_id)
    .single();

  if (!acc?.encrypted_refresh_token) {
    await admin.rpc('fail_preview', { p_preview_id: job.preview_id, p_reason: 'drive_token_unavailable' });
    return;
  }

  const ext = (job.extension ?? '').toLowerCase();

  // Office documents & video: try Google Drive's rendered Page 1 / poster thumbnail with watermark first
  if (['docx', 'xlsx', 'pptx', 'mp4', 'webm'].includes(ext)) {
    try {
      const token = decrypt(acc.encrypted_refresh_token);
      const generated = await generateDriveThumbnailPreview(job, token);
      if (generated) return;
    } catch {
      // Fall back to watermarked placeholder if Drive thumbnail is unavailable
    }
    try {
      await generatePlaceholderPreview(job);
    } catch (e: any) {
      await admin.rpc('fail_preview', { p_preview_id: job.preview_id, p_reason: e.message?.slice(0, 200) });
    }
    return;
  }

  // Placeholder for non-renderable archive/audio types — do not download full file
  if (['mp3', 'zip'].includes(ext)) {
    try {
      await generatePlaceholderPreview(job);
    } catch (e: any) {
      await admin.rpc('fail_preview', { p_preview_id: job.preview_id, p_reason: e.message?.slice(0, 200) });
    }
    return;
  }

  // Download full file for renderable types
  let source: Buffer;
  try {
    const token = decrypt(acc.encrypted_refresh_token);
    source = await fetchFullFile(token, job.provider_file_id);
  } catch (e: any) {
    await admin.rpc('fail_preview', { p_preview_id: job.preview_id, p_reason: `download_failed: ${e.message?.slice(0, 100)}` });
    return;
  }

  try {
    if (ext === 'pdf') await generatePdfPreview(job, source);
    else if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) await generateImagePreview(job, source);
    else await generatePlaceholderPreview(job);
  } catch (e: any) {
    await admin.rpc('fail_preview', { p_preview_id: job.preview_id, p_reason: e.message?.slice(0, 200) });
  }
}

export async function processPendingPreviews(limit = 2): Promise<{
  processed: number;
  errors: number;
}> {
  const admin = createAdminClient();
  const { data: jobs } = await admin.rpc('claim_preview_jobs', { p_limit: limit });

  let errors = 0;
  for (const job of (jobs ?? []) as PreviewJob[]) {
    try {
      await processPreviewJob(job);
    } catch {
      errors++;
    }
  }

  return { processed: jobs?.length ?? 0, errors };
}
