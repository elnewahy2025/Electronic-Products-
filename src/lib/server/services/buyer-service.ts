import 'server-only';
import { createClient } from '@/lib/supabase/server';

export type BuyerStats = {
  total_orders: number;
  pending_orders: number;
  active_codes: number;
  active_sessions: number;
  unread_notifications: number;
};

export type BuyerOrderRow = {
  purchase_request_id: string;
  status: string;
  total_amount: number;
  currency: string;
  amount_in_usd: number;
  customer_email?: string | null;
  created_at: string;
  product_titles: string[];
  code_count: number;
};

export async function getBuyerStats(): Promise<BuyerStats> {
  const db = await createClient();
  const { data } = await db.rpc('buyer_dashboard_stats');
  const stats = (data ?? {}) as Partial<BuyerStats>;
  return {
    total_orders: stats.total_orders ?? 0,
    pending_orders: stats.pending_orders ?? 0,
    active_codes: stats.active_codes ?? 0,
    active_sessions: stats.active_sessions ?? 0,
    unread_notifications: stats.unread_notifications ?? 0,
  };
}

export async function listBuyerOrders(): Promise<BuyerOrderRow[]> {
  const db = await createClient();
  const { data } = await db.rpc('buyer_orders_list');

  return ((data ?? []) as any[]).map(row => ({
    purchase_request_id: row.purchase_request_id,
    status: row.status,
    total_amount: Number(row.total_amount),
    currency: row.currency,
    amount_in_usd: Number(row.amount_in_usd),
    created_at: row.created_at,
    product_titles: row.product_titles
      ? String(row.product_titles).split(', ').filter(Boolean)
      : [],
    code_count: Number(row.code_count ?? 0),
  }));
}

export type BuyerOrderDetail = {
  request: BuyerOrderRow;
  items: Array<{
    order_item_id: string | null;
    product_id: string;
    product_title: string;
    product_slug: string;
    price: number;
    currency: string;
    code: {
      code_id: string;
      code_prefix: string;
      code_status: string;
      expires_at: string;
      redeemed_at: string | null;
      session_id: string | null;
    } | null;
    attempts: { used: number; max: number; remaining: number } | null;
  }>;
  compensation_requests: Array<{
    id: string;
    code_id: string;
    status: string;
    sequence_number: number;
    admin_reason: string | null;
    requested_at: string;
    decided_at: string | null;
  }>;
};

export async function getBuyerOrderDetail(requestId: string): Promise<BuyerOrderDetail | null> {
  const db = await createClient();
  const { data, error } = await db.rpc('buyer_order_detail', { p_request_id: requestId });
  if (error || !data) return null;

  const payload = data as any;
  const request = payload.request;
  const items = (payload.items ?? []) as any[];

  return {
    request: {
      purchase_request_id: request.purchase_request_id,
      status: request.status,
      total_amount: Number(request.total_amount),
      currency: request.currency,
      amount_in_usd: Number(request.amount_in_usd),
      customer_email: request.customer_email ?? null,
      created_at: request.created_at,
      product_titles: items.map(i => i.product_title),
      code_count: items.filter(i => i.code).length,
    },
    items: items.map(i => ({
      order_item_id: i.order_item_id,
      product_id: i.product_id,
      product_title: i.product_title,
      product_slug: i.product_slug,
      price: Number(i.price),
      currency: i.currency,
      code: i.code,
      attempts: i.attempts,
    })),
    compensation_requests: (payload.compensation_requests ?? []) as any,
  };
}

export type BuyerCodeRow = {
  code_id: string;
  code_prefix: string;
  code_status: string;
  issued_at: string;
  delivered_at: string | null;
  redeemed_at: string | null;
  expires_at: string;
  session_id: string | null;
  product_id: string;
  product_title: string;
  product_slug: string;
};

export async function listBuyerCodes(): Promise<BuyerCodeRow[]> {
  const db = await createClient();
  const { data } = await db
    .from('buyer_codes_full')
    .select('code_id, code_prefix, code_status, issued_at, delivered_at, redeemed_at, expires_at, session_id, product_id, product_title, product_slug')
    .order('issued_at', { ascending: false })
    .limit(100);
  return (data ?? []) as BuyerCodeRow[];
}

export type BuyerSessionRow = {
  session_id: string;
  status: string;
  started_at: string;
  expires_at: string;
  ended_at: string | null;
  is_compensation: boolean;
  code_prefix: string;
  order_item_id: string;
  product_title: string;
  product_slug: string;
};

export async function listBuyerSessions(statusFilter?: string): Promise<BuyerSessionRow[]> {
  const db = await createClient();
  let q = db
    .from('buyer_sessions_full')
    .select('session_id, status, started_at, expires_at, ended_at, is_compensation, code_prefix, order_item_id, product_title, product_slug')
    .order('started_at', { ascending: false })
    .limit(100);

  if (statusFilter === 'active') q = q.in('status', ['active', 'compensation_active']);
  else if (statusFilter === 'expired') q = q.in('status', ['expired', 'expired_partial', 'exhausted']);
  else if (statusFilter === 'completed') q = q.eq('status', 'completed');

  const { data } = await q;
  return (data ?? []) as BuyerSessionRow[];
}
