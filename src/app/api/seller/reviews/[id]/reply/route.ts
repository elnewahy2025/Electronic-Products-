import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import {
  replyToReview,
  deleteSellerReply,
} from '@/lib/server/services/seller-review-service';

const bodySchema = z.object({
  reply: z.string().min(1).max(2000),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    if (user.accountType !== 'seller') throw new Error('FORBIDDEN');

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'reply_invalid' }, { status: 400 });
    }

    await replyToReview({
      reviewId: params.id,
      sellerId: user.id,
      reply: parsed.data.reply,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const msg = e.message;
    const status = msg === 'forbidden' ? 403
                 : msg === 'review_not_found' ? 404
                 : msg === 'UNAUTHENTICATED' ? 401
                 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    if (user.accountType !== 'seller') throw new Error('FORBIDDEN');

    await deleteSellerReply({ reviewId: params.id, sellerId: user.id });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const msg = e.message;
    const status = msg === 'forbidden' ? 403
                 : msg === 'review_not_found' ? 404
                 : msg === 'UNAUTHENTICATED' ? 401
                 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
