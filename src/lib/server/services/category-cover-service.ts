import 'server-only';
import sharp from 'sharp';
import { createAdminClient } from '@/lib/supabase/admin';
import { PRODUCT_IMAGES_BUCKET } from './product-image-service';

export const MAX_CATEGORY_COVER_BYTES = 5 * 1024 * 1024;
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp', 'avif']);

/**
 * Validates, strips metadata, resizes and stores an admin-uploaded category
 * cover in the existing public product-images bucket. The category id is used
 * as a fixed key so re-uploading replaces the same object instead of piling up
 * orphaned files.
 */
export async function uploadCategoryCover(input: {
  categoryId: string;
  buffer: Buffer;
}): Promise<{ url: string; storagePath: string; width: number; height: number; sizeBytes: number }> {
  const { categoryId, buffer } = input;
  if (!buffer?.length) throw new Error('empty_file');
  if (buffer.length > MAX_CATEGORY_COVER_BYTES) throw new Error('image_too_large');
  if (!/^[0-9a-f-]{36}$/i.test(categoryId)) throw new Error('invalid_category_id');

  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(buffer, { limitInputPixels: 64_000_000 }).metadata();
  } catch {
    throw new Error('invalid_image');
  }
  if (!metadata.format || !ALLOWED_FORMATS.has(metadata.format)) {
    throw new Error('unsupported_image_format');
  }

  const { data: webp, info } = await sharp(buffer, { limitInputPixels: 64_000_000 })
    .rotate()
    .resize(960, 480, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });

  const storagePath = `categories/${categoryId}/cover.webp`;
  const adminDb = createAdminClient();
  const { error: uploadErr } = await adminDb.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(storagePath, webp, {
      contentType: 'image/webp',
      cacheControl: '31536000',
      upsert: true,
    });
  if (uploadErr) throw new Error(`storage_upload_failed: ${uploadErr.message}`);

  const { data: pub } = adminDb.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(storagePath);
  return {
    url: pub.publicUrl,
    storagePath,
    width: info.width,
    height: info.height,
    sizeBytes: info.size,
  };
}
