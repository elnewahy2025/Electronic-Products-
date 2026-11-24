import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { rpcNullable } from '@/lib/types/rpc-nullable';

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
    p_product_id: rpcNullable<string>(params.productId),
    p_status: rpcNullable<string>(params.status),
    p_from: rpcNullable<string>(params.from),
    p_to: rpcNullable<string>(params.to),
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

export type SellerOrderCodeDeliveryAttempt = {
  id: string;
  channel: 'email' | 'sms' | 'manual';
  sent_at: string;
  result: 'sent' | 'failed';
};

export type SellerOrderCode = {
  id: string;
  code_prefix: string;
  status: 'issued' | 'delivered' | 'redeemed' | 'expired' | 'revoked';
  issued_at: string;
  delivered_at: string | null;
  delivery_confirmation_method: 'auto' | 'manual' | null;
  redeemed_at: string | null;
  expires_at: string;
  revoked_at: string | null;
  is_replacement: boolean;
  delivery_attempts: SellerOrderCodeDeliveryAttempt[];
};

export type SellerOrderDelivery = {
  id: string;
  file_name: string;
  file_size_bytes: number;
  delivery_type: 'single' | 'zip';
  delivered_at: string;
  bytes_sent: number | null;
  completed: boolean;
  failure_reason: string | null;
};

export type SellerOrderSession = {
  id: string;
  code_id: string;
  status:
    | 'active' | 'completed' | 'expired' | 'expired_partial'
    | 'exhausted' | 'compensation_active' | 'compensation_pending' | 'revoked';
  started_at: string;
  expires_at: string;
  ended_at: string | null;
  is_compensation: boolean;
  attempt_consumed: boolean;
  revoked_at: string | null;
  deliveries: SellerOrderDelivery[];
};

export type SellerOrderAttempt = {
  id: string;
  attempt_number: number;
  type: 'zip' | 'single_files';
  consumed_at: string;
  completed: boolean;
};

export type SellerOrderLedgerTx = {
  id: string;
  type: string;
  amount: number;
  currency: string;
  created_at: string;
};

export type SellerOrderDetail = {
  order_item_id: string;
  order_id: string;
  product_id: string;
  product_title: string;
  product_slug: string;
  cover_image_url: string | null;
  version_number: number;
  price: number;
  currency: string;
  commission_rate_at_sale: number;
  commission_amount: number;
  net_seller_amount: number;
  ordered_at: string;
  order_status: string;
  buyer_masked: string;
  attempts_used: number;
  attempts_max: number;
  codes: SellerOrderCode[];
  sessions: SellerOrderSession[];
  attempts: SellerOrderAttempt[];
  ledger_transactions: SellerOrderLedgerTx[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getSellerOrderDetail(
  orderItemId: string,
): Promise<SellerOrderDetail | null> {
  if (!UUID_RE.test(orderItemId)) return null;

  const db = await createClient();
  const { data, error } = await db.rpc('seller_order_detail', {
    p_order_item_id: orderItemId,
  });

  if (error || !data) return null;

  const d = data as any;
  return {
    order_item_id: d.order_item_id,
    order_id: d.order_id,
    product_id: d.product_id,
    product_title: d.product_title,
    product_slug: d.product_slug,
    cover_image_url: d.cover_image_url ?? null,
    version_number: Number(d.version_number ?? 1),
    price: Number(d.price ?? 0),
    currency: d.currency ?? 'USD',
    commission_rate_at_sale: Number(d.commission_rate_at_sale ?? 0),
    commission_amount: Number(d.commission_amount ?? 0),
    net_seller_amount: Number(d.net_seller_amount ?? 0),
    ordered_at: d.ordered_at,
    order_status: d.order_status,
    buyer_masked: d.buyer_masked ?? 'مشتري',
    attempts_used: Number(d.attempts_used ?? 0),
    attempts_max: Number(d.attempts_max ?? 3),
    codes: (d.codes ?? []).map((c: any) => ({
      id: c.id,
      code_prefix: c.code_prefix,
      status: c.status,
      issued_at: c.issued_at,
      delivered_at: c.delivered_at ?? null,
      delivery_confirmation_method: c.delivery_confirmation_method ?? null,
      redeemed_at: c.redeemed_at ?? null,
      expires_at: c.expires_at,
      revoked_at: c.revoked_at ?? null,
      is_replacement: Boolean(c.is_replacement),
      delivery_attempts: (c.delivery_attempts ?? []).map((a: any) => ({
        id: a.id,
        channel: a.channel,
        sent_at: a.sent_at,
        result: a.result,
      })),
    })),
    sessions: (d.sessions ?? []).map((s: any) => ({
      id: s.id,
      code_id: s.code_id,
      status: s.status,
      started_at: s.started_at,
      expires_at: s.expires_at,
      ended_at: s.ended_at ?? null,
      is_compensation: Boolean(s.is_compensation),
      attempt_consumed: Boolean(s.attempt_consumed),
      revoked_at: s.revoked_at ?? null,
      deliveries: (s.deliveries ?? []).map((dl: any) => ({
        id: dl.id,
        file_name: dl.file_name,
        file_size_bytes: Number(dl.file_size_bytes ?? 0),
        delivery_type: dl.delivery_type,
        delivered_at: dl.delivered_at,
        bytes_sent: dl.bytes_sent !== null && dl.bytes_sent !== undefined ? Number(dl.bytes_sent) : null,
        completed: Boolean(dl.completed),
        failure_reason: dl.failure_reason ?? null,
      })),
    })),
    attempts: (d.attempts ?? []).map((a: any) => ({
      id: a.id,
      attempt_number: Number(a.attempt_number),
      type: a.type,
      consumed_at: a.consumed_at,
      completed: Boolean(a.completed),
    })),
    ledger_transactions: (d.ledger_transactions ?? []).map((tx: any) => ({
      id: tx.id,
      type: tx.type,
      amount: Number(tx.amount),
      currency: tx.currency,
      created_at: tx.created_at,
    })),
  };
}

/**
 * Display status derived from code_status + session_status.
 * Used by the UI to show one label per row.
 */
export function getDisplayStatus(row: {
  code_status: SellerOrderRow['code_status'];
  session_status: SellerOrderRow['session_status'];
}): {
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
