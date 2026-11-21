import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createReview } from '@/lib/server/services/review-service';

const body = z.object({
  product_id: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  body: z.string().max(2000).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });

    const result = await createReview({
      productId: parsed.data.product_id,
      rating: parsed.data.rating,
      body: parsed.data.body,
    });
    return NextResponse.json({ ok: true, review_id: result.id });
  } catch (e: any) {
    const msg = e.message;
    const status = msg === 'UNAUTHENTICATED' ? 401
                : msg === 'ALREADY_REVIEWED' ? 409
                : msg === 'NOT_ELIGIBLE' || msg?.startsWith('not_') || msg?.startsWith('already_') ? 403
                : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}