import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import {
  approveAndUploadAutoCover,
  renderAutoCoverWebp,
} from '@/lib/server/services/product-image-service';

const schema = z.object({
  title: z.string().min(2).max(200),
  category_name: z.string().max(100).nullable().optional(),
  variant: z.number().int().min(0).max(20).optional().default(0),
  action: z.enum(['preview', 'approve']),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (user.accountType !== 'seller') {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
    }

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
    }

    const { title, category_name, variant, action } = parsed.data;

    if (action === 'preview') {
      const rendered = await renderAutoCoverWebp({
        title,
        categoryName: category_name ?? null,
        variant,
      });
      return NextResponse.json({
        previewDataUrl: `data:image/webp;base64,${rendered.buffer.toString('base64')}`,
        variant: rendered.variant,
        width: rendered.width,
        height: rendered.height,
        sizeBytes: rendered.sizeBytes,
      });
    }

    const uploaded = await approveAndUploadAutoCover({
      sellerId: user.id,
      title,
      categoryName: category_name ?? null,
      variant,
    });
    return NextResponse.json(uploaded);
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'AUTO_COVER_FAILED' }, { status: 400 });
  }
}
