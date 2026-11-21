import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/session';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; imageId: string } }
) {
  try {
    const user = await requireUser();
    if (user.accountType !== 'seller') throw new Error('FORBIDDEN');

    const db = await createClient();

    const { data: product } = await db
      .from('products')
      .select('id')
      .eq('id', params.id)
      .eq('seller_id', user.id)
      .maybeSingle();

    if (!product) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const { error } = await db
      .from('product_gallery_images')
      .delete()
      .eq('id', params.imageId)
      .eq('product_id', params.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const status = e.message === 'UNAUTHENTICATED' ? 401 : 403;
    return NextResponse.json({ error: e.message }, { status });
  }
}
