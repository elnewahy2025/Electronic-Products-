import { publicError } from '@/lib/api/errors';
import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/session';
import { deleteProductImageFromStorage } from '@/lib/server/services/product-image-service';

export async function DELETE(
  _req: NextRequest,
  props: { params: Promise<{ id: string; imageId: string }> }
) {
  const params = await props.params;
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

    const { data: existing } = await db
      .from('product_gallery_images')
      .select('id, storage_path')
      .eq('id', params.imageId)
      .eq('product_id', params.id)
      .maybeSingle();

    if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const { error } = await db
      .from('product_gallery_images')
      .delete()
      .eq('id', params.imageId)
      .eq('product_id', params.id);

    if (error) return NextResponse.json({ error: publicError(error) }, { status: 400 });

    await deleteProductImageFromStorage(existing.storage_path);
    revalidateTag('storefront-products');
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const status = e.message === 'UNAUTHENTICATED' ? 401 : 403;
    return NextResponse.json({ error: publicError(e) }, { status });
  }
}
