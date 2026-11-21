import 'server-only';
import { createClient } from '@/lib/supabase/server';

export type SellerOrderStatus = 'pending' | 'active' | 'completed' | 'expired' | 'revoked';

export type SellerOrderRow = {
  order_item_id: string;
  product_id: string;
  product_title: string;
  product_slug: string;
  price: number;
  currency: string;
  ordered_at: string;
  buyer_masked: string;
  code_status: 'issued' | 'delivered' | 'redeemed' | 'expired' | 'revoked' | null;
  code_prefix: string | null;
  code_expires_at: string | null;
  session_status:
    | 'active' | 'completed' | 'expired' | 'expired_partial'
    | 'exhausted' | 'compensation_active' | 'compensation_pending' | 'revoked' | null;
  attempts_used: number;
  attempts_max: number;
  commission_rate: number;
  net_amount: number;
};

export type SellerTopProduct = {
  product_id: string;
  title: string;
  slug: string;
  count: number;
  gross: number;
  net: number;
};

export type SellerSalesStats = {
  total_sales: number;
  total_gross: number;
  total_net: number;
  currency: string;
  has_multiple_currencies: boolean;
  commission_rate: number;
  pending_count: number;
  active_count: number;
  completed_count: number;
  expired_count: number;
  revenue_last_30d: number;
  sales_last_30d: number;
  top_products: SellerTopProduct[];
};

export type ListOrdersParams = {
  productId?: string;
  status?: SellerOrderStatus;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

export type ListOrdersResult = {
  items: SellerOrderRow[];
  total: number;
};

export async function listSellerOrders(params: ListOrdersParams = {}): Promise<ListOrdersResult> {
  const db = await createClient();
  const { data, error } = await db.rpc('seller_orders', {
    p_product_id: params.productId ?? null,
    p_status: params.status ?? null,
    p_from: params.from ?? null,
    p_to: params.to ?? null,
    p_limit: Math.min(params.limit ?? 50, 200),
    p_offset: params.offset ?? 0,
  });

  if (error || !data) return { items: [], total: 0 };

  const rows = data as any[];
  const total = Number(rows[0]?.total_count ?? 0);

  return {
    items: rows.map(r => ({
      order_item_id: r.order_item_id,
      product_id: r.product_id,
      product_title: r.product_title,
      product_slug: r.product_slug,
      price: Number(r.price),
      currency: r.currency,
      ordered_at: r.ordered_at,
      buyer_masked: r.buyer_masked,
      code_status: r.code_status,
      code_prefix: r.code_prefix,
      code_expires_at: r.code_expires_at,
      session_status: r.session_status,
      attempts_used: Number(r.attempts_used ?? 0),
      attempts_max: Number(r.attempts_max ?? 3),
      commission_rate: Number(r.commission_rate ?? 0),
      net_amount: Number(r.net_amount ?? 0),
    })),
    total,
  };
}

export async function getSellerSalesStats(): Promise<SellerSalesStats | null> {
  const db = await createClient();
  const { data, error } = await db.rpc('seller_sales_stats');
  if (error || !data) return null;

  const s = data as any;
  return {
    total_sales: Number(s.total_sales ?? 0),
    total_gross: Number(s.total_gross ?? 0),
    total_net: Number(s.total_net ?? 0),
    currency: s.currency ?? 'USD',
    has_multiple_currencies: Boolean(s.has_multiple_currencies),
    commission_rate: Number(s.commission_rate ?? 0),
    pending_count: Number(s.pending_count ?? 0),
    active_count: Number(s.active_count ?? 0),
    completed_count: Number(s.completed_count ?? 0),
    expired_count: Number(s.expired_count ?? 0),
    revenue_last_30d: Number(s.revenue_last_30d ?? 0),
    sales_last_30d: Number(s.sales_last_30d ?? 0),
    top_products: (s.top_products ?? []).map((p: any) => ({
      product_id: p.product_id,
      title: p.title,
      slug: p.slug,
      count: Number(p.count ?? 0),
      gross: Number(p.gross ?? 0),
      net: Number(p.net ?? 0),
    })),
  };
}

/**
 * Display status derived from code_status + session_status.
 * Used by the UI to show one label per row.
 */
export function getDisplayStatus(row: SellerOrderRow): {
  label: string;
  variant: 'gray' | 'yellow' | 'blue' | 'green' | 'orange' | 'red';
} {
  if (!row.code_status) return { label: 'بدون كود', variant: 'gray' };
  if (row.code_status === 'revoked') return { label: 'ملغى', variant: 'red' };
  if (row.code_status === 'expired') return { label: 'منتهي (لم يُفعَّل)', variant: 'gray' };
  if (row.code_status === 'issued') return { label: 'بانتظار التسليم', variant: 'yellow' };
  if (row.code_status === 'delivered') return { label: 'جاهز للتفعيل', variant: 'blue' };

  if (row.code_status === 'redeemed') {
    switch (row.session_status) {
      case 'active':
        return { label: 'تنزيل نشط', variant: 'green' };
      case 'completed':
        return { label: 'مكتمل', variant: 'green' };
      case 'compensation_active':
        return { label: 'جلسة تعويضية', variant: 'blue' };
      case 'expired_partial':
        return { label: 'منتهي جزئيًا', variant: 'orange' };
      case 'exhausted':
        return { label: 'استنفد المحاولات', variant: 'red' };
      case 'expired':
        return { label: 'انتهت الجلسة', variant: 'gray' };
      default:
        return { label: 'مُفعّل', variant: 'green' };
    }
  }

  return { label: row.code_status, variant: 'gray' };
}
