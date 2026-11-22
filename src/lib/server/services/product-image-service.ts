import 'server-only';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { createAdminClient } from '@/lib/supabase/admin';

export const PRODUCT_IMAGES_BUCKET = 'product-images';
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_FORMATS = new Set(['jpeg', 'jpg', 'png', 'webp', 'gif', 'avif']);

export type UploadedProductImage = {
  url: string;
  storagePath: string;
  width: number;
  height: number;
  sizeBytes: number;
};

/**
 * Validates raw image bytes via sharp, strips EXIF metadata, resizes,
 * converts to WebP, and uploads to Supabase Storage (`product-images`).
 */
export async function processAndUploadProductImage(input: {
  buffer: Buffer;
  sellerId: string;
  kind: 'cover' | 'gallery';
}): Promise<UploadedProductImage> {
  if (!input.buffer || input.buffer.length === 0) {
    throw new Error('empty_file');
  }
  if (input.buffer.length > MAX_IMAGE_BYTES) {
    throw new Error('image_too_large');
  }

  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(input.buffer, { limitInputPixels: 64_000_000 }).metadata();
  } catch {
    throw new Error('invalid_image');
  }

  if (!metadata.format || !ALLOWED_FORMATS.has(metadata.format)) {
    throw new Error('unsupported_image_format');
  }

  const maxWidth = input.kind === 'cover' ? 1280 : 1600;
  const maxHeight = input.kind === 'cover' ? 720 : 1200;

  const { data: webpBuffer, info } = await sharp(input.buffer, { limitInputPixels: 64_000_000 })
    .rotate() // auto-orient and drop EXIF on output
    .resize(maxWidth, maxHeight, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });

  const storagePath = `${input.sellerId}/${input.kind}/${crypto.randomUUID()}.webp`;
  const adminDb = createAdminClient();

  const { error: uploadErr } = await adminDb.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(storagePath, webpBuffer, {
      contentType: 'image/webp',
      cacheControl: '31536000',
      upsert: false,
    });

  if (uploadErr) {
    throw new Error(`storage_upload_failed: ${uploadErr.message}`);
  }

  const { data: pub } = adminDb.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .getPublicUrl(storagePath);

  return {
    url: pub.publicUrl,
    storagePath,
    width: info.width,
    height: info.height,
    sizeBytes: info.size,
  };
}

/**
 * Deletes an object from the `product-images` bucket (best-effort).
 */
export async function deleteProductImageFromStorage(storagePath: string | null | undefined): Promise<void> {
  if (!storagePath) return;
  const adminDb = createAdminClient();
  await adminDb.storage.from(PRODUCT_IMAGES_BUCKET).remove([storagePath]).catch(() => {});
}
