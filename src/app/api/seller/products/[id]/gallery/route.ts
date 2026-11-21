import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/session';

const body = z.object({ url: z.string().url().max(1000) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    if (user.accountType !== 'seller') throw new Error('FORBIDDEN');

    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'invalid_url' }, { status: 400 });

    const db = await createClient();

    const { data: product } = await db
      .from('products')
      .select('id, seller_id')
      .eq('id', params.id)
      .eq('seller_id', user.id)
      .maybeSingle();

    if (!product) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const { count } = await db
      .from('product_gallery_images')
      .select('*', { count: 'exact', head: true })
      .eq('product_id', params.id);

    if ((count ?? 0) >= 8) {
      return NextResponse.json({ error: 'gallery_limit_reached' }, { status: 409 });
    }

    const { data, error } = await db
      .from('product_gallery_images')
      .insert({
        product_id: params.id,
        url: parsed.data.url,
        sort_order: count ?? 0,
      })
      .select('id, url, sort_order')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (e: any) {
    const status = e.message === 'UNAUTHENTICATED' ? 401 : e.message === 'FORBIDDEN' ? 403 : 400;
    return NextResponse.json({ error: e.message }, { status });
  }
}
