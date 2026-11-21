import 'server-only';
import { revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/logger';

export type SellerProduct = {
  id: string;
  title: string;
  slug: string;
  short_description: string | null;
  price_amount: number;
  price_currency: string;
  status: string;
  category_id: string | null;
  created_at: string;
  published_at: string | null;
  versions_count: number;
  published_version_id: string | null;
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export async function listSellerProducts(sellerId: string): Promise<SellerProduct[]> {
  const db = await createClient();
  const { data } = await db
    .from('products')
    .select(`
      id, title, slug, short_description, price_amount, price_currency,
      status, category_id, created_at, published_at,
      product_versions(id, status)
    `)
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false });

  return (data ?? []).map((p: any) => ({
    id: p.id,
    title: p.title,
    slug: p.slug,
    short_description: p.short_description,
    price_amount: Number(p.price_amount),
    price_currency: p.price_currency,
    status: p.status,
    category_id: p.category_id,
    created_at: p.created_at,
    published_at: p.published_at,
    versions_count: p.product_versions?.length ?? 0,
    published_version_id: p.product_versions?.find((v: any) => v.status === 'published')?.id ?? null,
  }));
}

export async function getSellerProduct(
  sellerId: string,
  productId: string
): Promise<SellerProduct | null> {
  const db = await createClient();
  const { data } = await db
    .from('products')
    .select(`
      id, title, slug, short_description, description, price_amount, price_currency,
      status, category_id, created_at, published_at, seller_id,
      product_versions(id, status)
    `)
    .eq('id', productId)
    .eq('seller_id', sellerId)
    .maybeSingle();

  if (!data) return null;
  const p = data as any;

  return {
    ...p,
    price_amount: Number(p.price_amount),
    versions_count: p.product_versions?.length ?? 0,
    published_version_id: p.product_versions?.find((v: any) => v.status === 'published')?.id ?? null,
  } as any;
}

export async function createSellerProduct(input: {
  sellerId: string;
  title: string;
  shortDescription?: string;
  description?: string;
  priceAmount: number;
  priceCurrency: string;
  categoryId?: string | null;
}): Promise<{ id: string; slug: string }> {
  const db = await createClient();

  if (!input.title.trim() || input.title.length < 3) throw new Error('title_too_short');
  if (input.priceAmount <= 0) throw new Error('invalid_price');

  const slugBase = slugify(input.title) || `product-${Date.now()}`;
  let slug = slugBase;
  let attempt = 0;

  while (attempt < 5) {
    const { data: existing } = await db
      .from('products')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();
    if (!existing) break;
    attempt++;
    slug = `${slugBase}-${Math.random().toString(36).slice(2, 6)}`;
  }

  const { data, error } = await db
    .from('products')
    .insert({
      seller_id: input.sellerId,
      title: input.title.trim(),
      slug,
      short_description: input.shortDescription?.trim() || null,
      description: input.description?.trim() || null,
      price_amount: input.priceAmount,
      price_currency: input.priceCurrency,
      category_id: input.categoryId ?? null,
      status: 'draft',
    })
    .select('id, slug')
    .single();

  if (error) {
    if (error.message.includes('product_price_below_minimum')) throw new Error('below_min_price');
    if (error.message.includes('duplicate key')) throw new Error('slug_conflict');
    throw new Error(error.message);
  }

  await logAudit({
    action: 'product.created',
    entityType: 'products',
    entityId: data.id,
    after: { title: input.title, price: input.priceAmount },
  });

  revalidateTag('storefront-products');
  return data;
}

export async function updateSellerProduct(input: {
  sellerId: string;
  productId: string;
  title?: string;
  shortDescription?: string | null;
  description?: string | null;
  priceAmount?: number;
  priceCurrency?: string;
  categoryId?: string | null;
}): Promise<void> {
  const db = await createClient();

  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.shortDescription !== undefined) patch.short_description = input.shortDescription?.trim() || null;
  if (input.description !== undefined) patch.description = input.description?.trim() || null;
  if (input.priceAmount !== undefined) patch.price_amount = input.priceAmount;
  if (input.priceCurrency !== undefined) patch.price_currency = input.priceCurrency;
  if (input.categoryId !== undefined) patch.category_id = input.categoryId;

  if (Object.keys(patch).length === 0) return;

  const { error } = await db
    .from('products')
    .update(patch)
    .eq('id', input.productId)
    .eq('seller_id', input.sellerId);

  if (error) {
    if (error.message.includes('product_price_below_minimum')) throw new Error('below_min_price');
    throw new Error(error.message);
  }

  await logAudit({
    action: 'product.updated',
    entityType: 'products',
    entityId: input.productId,
    after: patch,
  });
  revalidateTag('storefront-products');
}

export async function deleteSellerProduct(sellerId: string, productId: string): Promise<void> {
  const db = await createClient();

  // Verify ownership first
  const { data: product } = await db
    .from('products')
    .select('id, seller_id')
    .eq('id', productId)
    .eq('seller_id', sellerId)
    .maybeSingle();

  if (!product) throw new Error('not_found');

  // Check if any order_item references any version of this product
  const { count } = await db
    .from('order_items')
    .select('*', { count: 'exact', head: true })
    .eq('product_id', productId);

  if ((count ?? 0) > 0) {
    // Soft delete only
    await db.from('products').update({ status: 'deleted', deleted_at: new Date().toISOString() }).eq('id', productId);
    await logAudit({
      action: 'product.deleted',
      entityType: 'products',
      entityId: productId,
      reason: 'soft_delete_has_orders',
    });
    revalidateTag('storefront-products');
    return;
  }

  const { error } = await db.from('products').delete().eq('id', productId);
  if (error) {
    await db.from('products').update({ status: 'deleted', deleted_at: new Date().toISOString() }).eq('id', productId);
    revalidateTag('storefront-products');
    throw new Error('soft_deleted');
  }

  await logAudit({ action: 'product.deleted', entityType: 'products', entityId: productId });
  revalidateTag('storefront-products');
}

export async function unpublishSellerProduct(sellerId: string, productId: string): Promise<void> {
  const db = await createClient();
  const { error } = await db.rpc('unpublish_product', { p_product_id: productId });
  if (error) throw new Error(error.message);
  revalidateTag('storefront-products');
}