import 'server-only';
import sharp from 'sharp';
import { createAdminClient } from '@/lib/supabase/admin';

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function getWatermarkText(): Promise<string> {
  const admin = createAdminClient();
  const [{ data: ws }, { data: gs }] = await Promise.all([
    admin.from('watermark_settings').select('text_template, opacity_level, direction').eq('id', 1).single(),
    admin.from('general_settings').select('platform_name').eq('id', 1).single(),
  ]);

  const template = ws?.text_template ?? '{platform_name} — نسخة غير مرخصة';
  const name = gs?.platform_name ?? 'المنصة';
  return template.replace(/\{platform_name\}/g, name);
}

/**
 * Apply a diagonal (or horizontal) repeated text watermark.
 * Uses dual-contrast stroke + fill so the watermark stays clearly legible
 * on both white document pages (DOCX/PDF/PPTX) and dark backgrounds.
 * Returns PNG buffer.
 */
export async function applyWatermarkToImage(
  input: Buffer,
  options?: { surface?: 'auto' | 'light' | 'dark' },
): Promise<Buffer> {
  const admin = createAdminClient();
  const { data: ws } = await admin
    .from('watermark_settings')
    .select('opacity_level, direction')
    .eq('id', 1)
    .single();

  const text = await getWatermarkText();
  const opacityMap: Record<string, number> = { low: 0.16, medium: 0.28, high: 0.42 };
  const opacity = opacityMap[ws?.opacity_level ?? 'medium'] ?? 0.28;
  const angle = ws?.direction === 'horizontal' ? 0 : -35;
  const surface = options?.surface ?? 'auto';

  const fillColor =
    surface === 'dark'
      ? `rgba(255,255,255,${opacity})`
      : `rgba(15,27,38,${opacity})`;
  const strokeColor =
    surface === 'dark'
      ? `rgba(15,27,38,${Math.min(0.7, opacity * 0.9)})`
      : `rgba(255,255,255,${Math.min(0.85, opacity * 1.4)})`;

  const image = sharp(input);
  const meta = await image.metadata();
  const W = meta.width ?? 1200;
  const H = meta.height ?? 800;

  const fontSize = Math.max(20, Math.round(Math.min(W, H) * 0.042));
  const stepX = Math.round(W / 2.2);
  const stepY = Math.round(H / 2.5);

  let textSvg = '';
  for (let y = stepY / 2; y < H + stepY; y += stepY) {
    for (let x = stepX / 2; x < W + stepX; x += stepX) {
      textSvg += `<text x="${x}" y="${y}"
        text-anchor="middle"
        font-family="sans-serif"
        font-weight="600"
        font-size="${fontSize}"
        fill="${fillColor}"
        stroke="${strokeColor}"
        stroke-width="2.5"
        paint-order="stroke"
        transform="rotate(${angle}, ${x}, ${y})"
      >${escapeXml(text)}</text>`;
    }
  }

  const svg = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${textSvg}</svg>`
  );

  return image
    .composite([{ input: svg, blend: 'over' }])
    .png()
    .toBuffer();
}
