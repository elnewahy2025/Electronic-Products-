import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/session';

const body = z.object({
  order: z.array(z.object({
    id: z.string().uuid(),
    sort_order: z.number().int().min(0),
  })).max(8),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    if (user.accountType !== 'seller') throw new Error('FORBIDDEN');

    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });

    const db = await createClient();

    const { data: product } = await db
      .from('products')
      .select('id')
      .eq('id', params.id)
      .eq('seller_id', user.id)
      .maybeSingle();

    if (!product) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    for (const item of parsed.data.order) {
      await db
        .from('product_gallery_images')
        .update({ sort_order: item.sort_order })
        .eq('id', item.id)
        .eq('product_id', params.id);
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const status = e.message === 'UNAUTHENTICATED' ? 401 : 403;
    return NextResponse.json({ error: e.message }, { status });
  }
}
