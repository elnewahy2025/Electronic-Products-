import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/session';
import {
  processAndUploadProductImage,
  deleteProductImageFromStorage,
} from '@/lib/server/services/product-image-service';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    if (user.accountType !== 'seller') throw new Error('FORBIDDEN');

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

    const formData = await req.formData().catch(() => null);
    const file = formData?.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file_required' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const uploaded = await processAndUploadProductImage({
      buffer,
      sellerId: user.id,
      kind: 'gallery',
    });

    const { data, error } = await db
      .from('product_gallery_images')
      .insert({
        product_id: params.id,
        url: uploaded.url,
        storage_path: uploaded.storagePath,
        sort_order: count ?? 0,
      })
      .select('id, url, sort_order')
      .single();

    if (error) {
      await deleteProductImageFromStorage(uploaded.storagePath);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    revalidateTag('storefront-products');
    return NextResponse.json(data);
  } catch (e: any) {
    const msg = e.message ?? 'upload_failed';
    const status =
      msg === 'UNAUTHENTICATED' ? 401
      : msg === 'FORBIDDEN' ? 403
      : msg === 'image_too_large' ? 413
      : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
