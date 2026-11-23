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

/**
 * PostgREST `.or()` filter shared by every buyer-facing view. The views
 * already carry the ownership predicate; repeating it here prevents a future
 * view regression from exposing another buyer's rows. Guest purchases have
 * buyer_id = NULL and are matched by the authenticated email.
 */
function buyerScope(userId: string, email?: string | null): string {
  // `ilike` preserves guest-purchase visibility when the checkout email and
  // the auth profile email differ only by case.
  return `buyer_id.eq.${userId}${email ? `,customer_email.ilike.${JSON.stringify(email)}` : ''}`;
}

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
  const { data: { user } } = await db.auth.getUser();
  if (!user) return [];

  // buyer_orders_view carries the row-level ownership predicate (including
  // guest-email purchases). The RPC enriches it with product titles/code count.
  const scope = buyerScope(user.id, user.email);
  const { data: visibleOrders } = await db
    .from('buyer_orders_view')
    .select('purchase_request_id, status, total_amount, currency, amount_in_usd, created_at')
    .or(scope)
    .order('created_at', { ascending: false })
    .limit(100);
  if (!visibleOrders?.length) return [];

  const { data: enriched } = await db.rpc('buyer_orders_list');
  const enrichmentById = new Map(
    ((enriched ?? []) as any[]).map(row => [row.purchase_request_id, row])
  );

  return visibleOrders.map(row => {
    const extra: any = enrichmentById.get(row.purchase_request_id) ?? {};
    return {
      purchase_request_id: row.purchase_request_id,
      status: row.status,
      total_amount: Number(row.total_amount),
      currency: row.currency,
      amount_in_usd: Number(row.amount_in_usd),
      created_at: row.created_at,
      product_titles: extra.product_titles
        ? String(extra.product_titles).split(', ').filter(Boolean)
        : [],
      code_count: Number(extra.code_count ?? 0),
    };
  });
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
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;

  // The RPC is the rich projection; the safe view is the authoritative gate.
  // A regression in the RPC cannot expose an order the caller may not see.
  const { data: visible } = await db
    .from('buyer_orders_view')
    .select('purchase_request_id')
    .eq('purchase_request_id', requestId)
    .or(buyerScope(user.id, user.email))
    .maybeSingle();
  if (!visible) return null;

  const { data, error } = await db.rpc('buyer_order_detail', { p_request_id: requestId });
  if (error || !data) return null;

  const payload = data as any;
  const request = payload.request;
  const items = (payload.items ?? []) as any[];
  const codeIds = items
    .map(i => i.code?.code_id)
    .filter((id): id is string => typeof id === 'string');

  // Compensation rows come from the row-scoped safe view rather than trusting
  // the RPC projection. Only the admin-only reason field is exposed there.
  let compensationRequests: BuyerOrderDetail['compensation_requests'] = [];
  if (codeIds.length > 0) {
    const { data: compensations } = await db
      .from('buyer_compensation_view')
      .select('id, code_id, status, sequence_number, admin_reason, requested_at, decided_at')
      .in('code_id', codeIds)
      .order('requested_at', { ascending: false });
    compensationRequests = (compensations ?? []) as BuyerOrderDetail['compensation_requests'];
  }

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
    compensation_requests: compensationRequests,
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
  const { data: { user } } = await db.auth.getUser();
  if (!user) return [];

  // buyer_codes_full carries the display fields and is itself row-scoped
  // (migration 041). buyer_codes_view is the narrower safe view: intersect with
  // it so a future projection regression cannot widen buyer visibility.
  const scope = buyerScope(user.id, user.email);
  const { data: rows } = await db
    .from('buyer_codes_full')
    .select('code_id, code_prefix, code_status, issued_at, delivered_at, redeemed_at, expires_at, session_id, product_id, product_title, product_slug')
    .or(scope)
    .order('issued_at', { ascending: false })
    .limit(100);
  const ids = (rows ?? []).map(row => row.code_id);
  if (ids.length === 0) return [];

  const { data: allowed } = await db
    .from('buyer_codes_view')
    .select('id')
    .in('id', ids);
  const allowedIds = new Set((allowed ?? []).map(row => row.id));

  return (rows ?? [])
    .filter(row => allowedIds.has(row.code_id))
    .filter((row): row is BuyerCodeRow => Boolean(row));
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
  const { data: { user } } = await db.auth.getUser();
  if (!user) return [];

  // See listBuyerCodes: view-level scoping plus an explicit app-level scope.
  const scope = `buyer_id.eq.${user.id}${user.email ? `,customer_email.eq.${JSON.stringify(user.email)}` : ''}`;
  let q = db
    .from('buyer_sessions_full')
    .select('session_id, status, started_at, expires_at, ended_at, is_compensation, code_prefix, order_item_id, product_title, product_slug')
    .or(scope)
    .order('started_at', { ascending: false })
    .limit(100);

  if (statusFilter === 'active') q = q.in('status', ['active', 'compensation_active']);
  else if (statusFilter === 'expired') q = q.in('status', ['expired', 'expired_partial', 'exhausted']);
  else if (statusFilter === 'completed') q = q.eq('status', 'completed');

  const { data } = await q;
  return (data ?? []) as BuyerSessionRow[];
}
