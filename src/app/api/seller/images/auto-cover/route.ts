import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import {
  approvePreviewDataUrlCover,
  extractFirstPageCoverFromDrive,
  generateAiProductCover,
} from '@/lib/server/services/product-image-service';

const extractSchema = z.object({
  action: z.literal('extract_first_page'),
  product_id: z.string().uuid().nullable().optional(),
  file_version_id: z.string().uuid().nullable().optional(),
});

const previewSchema = z.object({
  action: z.literal('preview'),
  title: z.string().min(2).max(200),
  short_description: z.string().max(400).nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  category_name: z.string().max(100).nullable().optional(),
  variant: z.number().int().min(0).max(20).optional().default(0),
});

const approveSchema = z.object({
  action: z.literal('approve'),
  preview_data_url: z.string().min(50).max(7_000_000),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (user.accountType !== 'seller') {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
    }

    const raw = await req.json().catch(() => null);
    if (!raw || typeof raw !== 'object') {
      return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
    }

    if ((raw as any).action === 'extract_first_page') {
      const parsed = extractSchema.safeParse(raw);
      if (!parsed.success) {
        return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
      }
      const extracted = await extractFirstPageCoverFromDrive({
        sellerId: user.id,
        productId: parsed.data.product_id ?? null,
        fileVersionId: parsed.data.file_version_id ?? null,
      });
      return NextResponse.json({
        previewDataUrl: `data:image/webp;base64,${extracted.buffer.toString('base64')}`,
        sourceFileName: extracted.sourceFileName,
        width: extracted.width,
        height: extracted.height,
        sizeBytes: extracted.sizeBytes,
      });
    }

    if ((raw as any).action === 'preview') {
      const parsed = previewSchema.safeParse(raw);
      if (!parsed.success) {
        return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
      }
      const rendered = await generateAiProductCover({
        title: parsed.data.title,
        shortDescription: parsed.data.short_description ?? null,
        description: parsed.data.description ?? null,
        categoryName: parsed.data.category_name ?? null,
        variant: parsed.data.variant,
      });
      return NextResponse.json({
        previewDataUrl: `data:image/webp;base64,${rendered.buffer.toString('base64')}`,
        variant: rendered.variant,
        width: rendered.width,
        height: rendered.height,
        sizeBytes: rendered.sizeBytes,
      });
    }

    if ((raw as any).action === 'approve') {
      const parsed = approveSchema.safeParse(raw);
      if (!parsed.success) {
        return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
      }
      const uploaded = await approvePreviewDataUrlCover({
        sellerId: user.id,
        previewDataUrl: parsed.data.preview_data_url,
      });
      return NextResponse.json(uploaded);
    }

    return NextResponse.json({ error: 'INVALID_ACTION' }, { status: 400 });
  } catch (e: any) {
    const status = e.message === 'AI_COVER_NOT_CONFIGURED' ? 503 : 400;
    return NextResponse.json({ error: e.message ?? 'AUTO_COVER_FAILED' }, { status });
  }
}
