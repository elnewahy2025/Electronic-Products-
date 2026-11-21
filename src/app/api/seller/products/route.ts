import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { createSellerProduct } from '@/lib/server/services/seller-product-service';

const body = z.object({
  title: z.string().min(3).max(200),
  short_description: z.string().max(300).nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  price_amount: z.number().positive(),
  price_currency: z.enum(['USD', 'EGP', 'SAR', 'KWD']),
  category_id: z.string().uuid().nullable().optional(),
  cover_image_url: z.string().url().max(1000).nullable().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (user.accountType !== 'seller') throw new Error('FORBIDDEN');
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
    const result = await createSellerProduct({
      sellerId: user.id,
      title: parsed.data.title,
      shortDescription: parsed.data.short_description ?? undefined,
      description: parsed.data.description ?? undefined,
      priceAmount: parsed.data.price_amount,
      priceCurrency: parsed.data.price_currency,
      categoryId: parsed.data.category_id ?? null,
      coverImageUrl: parsed.data.cover_image_url ?? null,
    });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}