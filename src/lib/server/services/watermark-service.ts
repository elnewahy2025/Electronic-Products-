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
 * Returns PNG buffer.
 */
export async function applyWatermarkToImage(input: Buffer): Promise<Buffer> {
  const admin = createAdminClient();
  const { data: ws } = await admin
    .from('watermark_settings')
    .select('opacity_level, direction')
    .eq('id', 1)
    .single();

  const text = await getWatermarkText();
  const opacityMap: Record<string, number> = { low: 0.12, medium: 0.22, high: 0.35 };
  const opacity = opacityMap[ws?.opacity_level ?? 'medium'] ?? 0.22;
  const angle = ws?.direction === 'horizontal' ? 0 : -35;

  const image = sharp(input);
  const meta = await image.metadata();
  const W = meta.width ?? 1200;
  const H = meta.height ?? 800;

  const fontSize = Math.max(20, Math.round(Math.min(W, H) * 0.04));
  const stepX = Math.round(W / 2.5);
  const stepY = Math.round(H / 2.5);

  let textSvg = '';
  for (let y = stepY / 2; y < H + stepY; y += stepY) {
    for (let x = stepX / 2; x < W + stepX; x += stepX) {
      textSvg += `<text x="${x}" y="${y}"
        text-anchor="middle"
        font-family="sans-serif"
        font-size="${fontSize}"
        fill="rgba(255,255,255,${opacity})"
        transform="rotate(${angle}, ${x}, ${y})"
        style="paint-order: stroke; stroke: rgba(0,0,0,${opacity * 0.4}); stroke-width: 1px;"
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
