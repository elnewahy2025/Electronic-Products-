import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/logger';

export type ReviewRow = {
  id: string;
  product_id: string;
  rating: number;
  body: string | null;
  status: 'published' | 'deleted';
  created_at: string;
  seller_reply?: string | null;
  seller_replied_at?: string | null;
};

export type ProductRating = { average: number; count: number };

export async function getProductRating(productId: string): Promise<ProductRating> {
  const db = await createClient();
  const { data } = await db
    .from('reviews')
    .select('rating')
    .eq('product_id', productId)
    .eq('status', 'published');

  const rows = data ?? [];
  if (!rows.length) return { average: 0, count: 0 };
  const sum = rows.reduce((s, r) => s + (r.rating ?? 0), 0);
  return { average: Math.round((sum / rows.length) * 10) / 10, count: rows.length };
}

export async function getProductReviews(productId: string, limit = 20): Promise<ReviewRow[]> {
  const db = await createClient();
  const { data } = await db
    .from('reviews')
    .select('id, product_id, rating, body, status, created_at, seller_reply, seller_replied_at')
    .eq('product_id', productId)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as ReviewRow[];
}

export async function getMyReviewForProduct(
  productId: string
): Promise<ReviewRow | null> {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;

  const { data } = await db
    .from('reviews')
    .select('id, product_id, rating, body, status, created_at')
    .eq('product_id', productId)
    .eq('buyer_id', user.id)
    .maybeSingle();

  return (data ?? null) as ReviewRow | null;
}

/**
 * Returns true if the current user has an approved order_item for this product.
 */
export async function canCurrentUserReview(productId: string): Promise<{
  canReview: boolean;
  orderItemId?: string;
  reason?: string;
}> {
  // SECURITY DEFINER RPC so guest purchases (buyer_id IS NULL) are matched
  // by customer_email, just like the other buyer-facing RPCs.
  const db = await createClient();
  const { data, error } = await db.rpc('can_current_user_review', {
    p_product_id: productId,
  });
  if (error || !data?.length) {
    return { canReview: false, reason: 'NOT_ELIGIBLE' };
  }

  const row = data[0] as { can_review: boolean; order_item_id: string | null; reason: string | null };
  return {
    canReview: Boolean(row.can_review),
    orderItemId: row.order_item_id ?? undefined,
    reason: row.reason ?? undefined,
  };
}

export async function createReview(input: {
  productId: string;
  rating: number;
  body?: string;
}): Promise<{ id: string }> {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new Error('UNAUTHENTICATED');

  if (input.rating < 1 || input.rating > 5) throw new Error('INVALID_RATING');

  const eligibility = await canCurrentUserReview(input.productId);
  if (!eligibility.canReview || !eligibility.orderItemId) {
    // UI keeps the lowercase reason; the API surfaces a stable uppercase code.
    throw new Error(
      eligibility.reason === 'already_reviewed' ? 'ALREADY_REVIEWED' : eligibility.reason ?? 'NOT_ELIGIBLE'
    );
  }

  const { data, error } = await db
    .from('reviews')
    .insert({
      product_id: input.productId,
      buyer_id: user.id,
      order_item_id: eligibility.orderItemId,
      rating: input.rating,
      body: input.body ?? null,
    })
    .select('id')
    .single();

  if (error) {
    if (error.message.includes('duplicate key')) throw new Error('ALREADY_REVIEWED');
    throw new Error(error.message);
  }

  await logAudit({
    action: 'review.created',
    entityType: 'reviews',
    entityId: data.id,
    after: { product_id: input.productId, rating: input.rating },
  });

  return { id: data.id };
}

