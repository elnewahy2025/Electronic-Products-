import 'server-only';
import { createClient } from '@/lib/supabase/server';

export type StorefrontProduct = {
  id: string;
  title: string;
  slug: string;
  short_description: string | null;
  price_amount: number;
  price_currency: string;
  published_at: string;
  seller_id: string;
  seller_display_name: string;
  category_name: string | null;
  category_slug: string | null;
  rating_avg: number;
  rating_count: number;
};

export type SearchParams = {
  query?: string;
  categorySlug?: string;
  sellerId?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: 'newest' | 'price_asc' | 'price_desc' | 'rating' | 'popular';
  limit?: number;
  offset?: number;
};

export type SearchResult = {
  items: StorefrontProduct[];
  total: number;
};

export async function searchStorefront(params: SearchParams): Promise<SearchResult> {
  const db = await createClient();
  const { data, error } = await db.rpc('search_storefront', {
    p_query: params.query ?? null,
    p_category_slug: params.categorySlug ?? null,
    p_seller_id: params.sellerId ?? null,
    p_min_price: params.minPrice ?? null,
    p_max_price: params.maxPrice ?? null,
    p_sort: params.sort ?? 'newest',
    p_limit: Math.min(params.limit ?? 24, 60),
    p_offset: params.offset ?? 0,
  });

  if (error || !data) return { items: [], total: 0 };

  const items = data as Array<StorefrontProduct & { total_count: number }>;
  const total = items[0]?.total_count ?? 0;

  return {
    items: items.map(({ total_count: _t, ...rest }) => rest),
    total,
  };
}

export async function getTopCategories(): Promise<Array<{
  id: string; name: string; slug: string; product_count: number;
}>> {
  const db = await createClient();
  const { data } = await db
    .from('storefront_top_categories')
    .select('id, name, slug, product_count');
  return data ?? [];
}

export async function getAllCategories(): Promise<Array<{
  id: string; name: string; slug: string; parent_id: string | null; product_count: number;
}>> {
  const db = await createClient();
  const { data } = await db
    .from('storefront_categories')
    .select('id, name, slug, parent_id, product_count, sort_order')
    .order('sort_order', { ascending: true });
  return (data ?? []) as any;
}

export async function getFeaturedProducts(limit = 8): Promise<StorefrontProduct[]> {
  const result = await searchStorefront({ sort: 'popular', limit });
  return result.items;
}

export async function getNewestProducts(limit = 12): Promise<StorefrontProduct[]> {
  const result = await searchStorefront({ sort: 'newest', limit });
  return result.items;
}