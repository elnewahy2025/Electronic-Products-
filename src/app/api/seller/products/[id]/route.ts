import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { updateSellerProduct, deleteSellerProduct } from '@/lib/server/services/seller-product-service';

const body = z.object({
  title: z.string().min(3).max(200).optional(),
  short_description: z.string().max(300).nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  price_amount: z.number().positive().optional(),
  price_currency: z.enum(['USD', 'EGP', 'SAR', 'KWD']).optional(),
  category_id: z.string().uuid().nullable().optional(),
  cover_image_url: z.string().url().max(1000).nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    if (user.accountType !== 'seller') throw new Error('FORBIDDEN');
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
    await updateSellerProduct({
      sellerId: user.id,
      productId: params.id,
      title: parsed.data.title,
      shortDescription: parsed.data.short_description,
      description: parsed.data.description,
      priceAmount: parsed.data.price_amount,
      priceCurrency: parsed.data.price_currency,
      categoryId: parsed.data.category_id,
      coverImageUrl: parsed.data.cover_image_url,
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const message = e?.message ?? 'ERROR';
    const status =
      message === 'not_found' ? 404
        : message === 'FORBIDDEN' ? 403
          : message === 'UNAUTHENTICATED' ? 401
            : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    if (user.accountType !== 'seller') throw new Error('FORBIDDEN');
    await deleteSellerProduct(user.id, params.id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const message = e?.message ?? 'ERROR';
    const status =
      message === 'not_found' ? 404
        : message === 'FORBIDDEN' ? 403
          : message === 'UNAUTHENTICATED' ? 401
            : 400;
    return NextResponse.json({ error: message }, { status });
  }
}