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

const COVER_PALETTES = [
  { bg1: '#0d3b32', bg2: '#1457d9', accent: '#e8a317', soft: '#9ce2bf' },
  { bg1: '#0f1b26', bg2: '#1d4ed8', accent: '#38bdf8', soft: '#bae6fd' },
  { bg1: '#1e293b', bg2: '#0f766e', accent: '#f59e0b', soft: '#99f6e4' },
  { bg1: '#1c1917', bg2: '#b45309', accent: '#fbbf24', soft: '#fde68a' },
] as const;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapTitleLines(title: string, maxChars = 26): string[] {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (!cur) {
      cur = w;
    } else if ((cur + ' ' + w).length <= maxChars) {
      cur += ' ' + w;
    } else {
      lines.push(cur);
      cur = w;
      if (lines.length === 2) break;
    }
  }
  if (cur && lines.length < 2) lines.push(cur);
  return lines.length ? lines : ['منتج رقمي'];
}

export async function renderAutoCoverWebp(input: {
  title: string;
  categoryName?: string | null;
  variant?: number;
}): Promise<{ buffer: Buffer; width: number; height: number; sizeBytes: number; variant: number }> {
  const variant = Math.abs(Math.floor(input.variant ?? 0)) % COVER_PALETTES.length;
  const pal = COVER_PALETTES[variant];
  const lines = wrapTitleLines(input.title || 'منتج رقمي');
  const cat = (input.categoryName || 'منتج رقمي').trim().slice(0, 32);

  const titleSvg = lines
    .map((line, idx) => {
      const y = lines.length === 1 ? 375 : 345 + idx * 66;
      return `<text x="1080" y="${y}" text-anchor="end" direction="rtl" fill="#ffffff" font-family="Tahoma, Segoe UI, sans-serif" font-size="48" font-weight="700">${escapeXml(line)}</text>`;
    })
    .join('\n');

  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="750" viewBox="0 0 1200 750">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${pal.bg1}"/>
        <stop offset="100%" stop-color="${pal.bg2}"/>
      </linearGradient>
      <pattern id="grid" width="44" height="44" patternUnits="userSpaceOnUse">
        <path d="M 44 0 L 0 0 0 44" fill="none" stroke="#ffffff" stroke-opacity="0.08" stroke-width="1"/>
      </pattern>
    </defs>
    <rect width="1200" height="750" fill="url(#bg)"/>
    <rect width="1200" height="750" fill="url(#grid)"/>
    <rect x="48" y="48" width="1104" height="654" rx="28" fill="none" stroke="#ffffff" stroke-opacity="0.18" stroke-width="2"/>

    <!-- Decorative document card on left -->
    <g transform="translate(110, 175)">
      <rect x="18" y="18" width="260" height="360" rx="20" fill="#000000" fill-opacity="0.22"/>
      <rect width="260" height="360" rx="20" fill="#ffffff" fill-opacity="0.96"/>
      <rect x="28" y="34" width="110" height="16" rx="8" fill="${pal.bg1}"/>
      <rect x="28" y="72" width="204" height="12" rx="6" fill="#64748b" fill-opacity="0.45"/>
      <rect x="28" y="100" width="176" height="12" rx="6" fill="#64748b" fill-opacity="0.35"/>
      <rect x="28" y="128" width="192" height="12" rx="6" fill="#64748b" fill-opacity="0.3"/>
      <rect x="28" y="176" width="204" height="92" rx="14" fill="${pal.bg1}" fill-opacity="0.1"/>
      <circle cx="80" cy="222" r="22" fill="${pal.accent}"/>
      <rect x="116" y="206" width="96" height="12" rx="6" fill="${pal.bg1}" fill-opacity="0.6"/>
      <rect x="116" y="228" width="70" height="10" rx="5" fill="#64748b" fill-opacity="0.5"/>
      <rect x="28" y="294" width="204" height="36" rx="10" fill="${pal.bg2}"/>
    </g>

    <!-- Category pill -->
    <rect x="830" y="210" width="250" height="44" rx="22" fill="#ffffff" fill-opacity="0.16"/>
    <text x="955" y="239" text-anchor="middle" direction="rtl" fill="${pal.soft}" font-family="Tahoma, Segoe UI, sans-serif" font-size="22" font-weight="600">${escapeXml(cat)}</text>

    <!-- Title -->
    ${titleSvg}

    <!-- Accent bar -->
    <rect x="960" y="455" width="120" height="8" rx="4" fill="${pal.accent}"/>
  </svg>`);

  const { data: buffer, info } = await sharp(svg)
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

export async function approveAndUploadAutoCover(input: {
  sellerId: string;
  title: string;
  categoryName?: string | null;
  variant?: number;
}): Promise<UploadedProductImage> {
  const rendered = await renderAutoCoverWebp(input);
  const storagePath = `${input.sellerId}/cover/${crypto.randomUUID()}.webp`;
  const adminDb = createAdminClient();

  const { error: uploadErr } = await adminDb.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(storagePath, rendered.buffer, {
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
    width: rendered.width,
    height: rendered.height,
    sizeBytes: rendered.sizeBytes,
  };
}
