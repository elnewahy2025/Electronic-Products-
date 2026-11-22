import 'server-only';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { GoogleGenAI } from '@google/genai';
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

const STYLE_DIRECTIONS = [
  'clean modern editorial illustration with rich depth, soft studio lighting, and refined visual metaphors representing the exact subject matter',
  'high-craft minimalist 3D isometric scene depicting tangible objects, tools, and visual elements directly related to the topic',
  'warm contemporary flat-vector architectural illustration with layered geometric forms and expressive subject-specific iconography',
  'photorealistic studio flat-lay composition with curated desk/educational objects and atmospheric lighting matching the product theme',
];

/**
 * Generates a real, expressive AI cover image using Gemini Image Generation
 * (`gemini-2.5-flash-image`) based on the product's title, description, and category,
 * then resizes & optimizes it to 1200x750 WebP via sharp for seller preview & approval.
 */
export async function generateAiProductCover(input: {
  title: string;
  shortDescription?: string | null;
  description?: string | null;
  categoryName?: string | null;
  variant?: number;
}): Promise<{ buffer: Buffer; width: number; height: number; sizeBytes: number; variant: number }> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error('AI_COVER_NOT_CONFIGURED');
  }

  const variant = Math.abs(Math.floor(input.variant ?? 0)) % STYLE_DIRECTIONS.length;
  const style = STYLE_DIRECTIONS[variant];
  const contextParts = [
    `Product Title: ${input.title.trim()}`,
    input.categoryName ? `Category: ${input.categoryName.trim()}` : null,
    input.shortDescription ? `Summary: ${input.shortDescription.trim()}` : null,
    input.description ? `Details: ${input.description.trim().slice(0, 400)}` : null,
  ].filter(Boolean);

  const prompt = [
    'Create a professional, visually compelling 16:9 digital product cover artwork for an online marketplace.',
    `Art direction: ${style}.`,
    'The illustration MUST clearly and specifically express the real-world subject matter and contents described below:',
    ...contextParts,
    'Strict rules: Do NOT include any text, letters, numbers, watermarks, or UI buttons inside the image. Fill the entire 16:9 frame edge-to-edge with balanced composition and high contrast.',
  ].join('\n');

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: prompt,
    config: {
      responseModalities: ['IMAGE'],
      imageConfig: {
        aspectRatio: '16:9',
      },
    },
  });

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const imgPart = parts.find((p: any) => p.inlineData?.data);
  if (!imgPart?.inlineData?.data) {
    throw new Error('AI_COVER_EMPTY_RESPONSE');
  }

  const rawBuffer = Buffer.from(imgPart.inlineData.data, 'base64');
  const { data: buffer, info } = await sharp(rawBuffer, { limitInputPixels: 64_000_000 })
    .resize(1200, 750, { fit: 'cover', position: 'centre' })
    .webp({ quality: 86 })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer,
    width: info.width,
    height: info.height,
    sizeBytes: info.size,
    variant,
  };
}

/**
 * Validates and uploads the EXACT preview image that the seller approved.
 */
export async function approvePreviewDataUrlCover(input: {
  sellerId: string;
  previewDataUrl: string;
}): Promise<UploadedProductImage> {
  const match = /^data:image\/(webp|png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(
    input.previewDataUrl.trim(),
  );
  if (!match) {
    throw new Error('invalid_image');
  }
  const buffer = Buffer.from(match[2], 'base64');
  return processAndUploadProductImage({
    buffer,
    sellerId: input.sellerId,
    kind: 'cover',
  });
}
