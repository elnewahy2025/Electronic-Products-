import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { data, error } = await db
    .from('favorites')
    .select(`
      product_id, created_at,
      products(id, title, slug, short_description, price_amount, price_currency, cover_image_url, status)
    `)
    .eq('buyer_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const productId = String(body?.product_id ?? '');
  if (!UUID_RE.test(productId)) {
    return NextResponse.json({ error: 'invalid_product_id' }, { status: 400 });
  }

  const { error } = await db
    .from('favorites')
    .upsert({ buyer_id: user.id, product_id: productId }, { onConflict: 'buyer_id,product_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, favorited: true });
}

export async function DELETE(req: NextRequest) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const productId = req.nextUrl.searchParams.get('product_id') ?? '';
  if (!UUID_RE.test(productId)) {
    return NextResponse.json({ error: 'invalid_product_id' }, { status: 400 });
  }

  const { error } = await db
    .from('favorites')
    .delete()
    .eq('buyer_id', user.id)
    .eq('product_id', productId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, favorited: false });
}
