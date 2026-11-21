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
  customer_email: string | null;
  created_at: string;
  product_titles: string[];
  code_count: number;
};

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
  const { data } = await db
    .from('buyer_orders_view')
    .select('purchase_request_id, status, total_amount, currency, amount_in_usd, customer_email, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (!data?.length) return [];

  const prIds = data.map(r => r.purchase_request_id);

  const { data: items } = await db
    .from('purchase_request_items')
    .select('purchase_request_id, products!inner(title)')
    .in('purchase_request_id', prIds);

  const { data: codes } = await db
    .from('purchase_codes')
    .select('order_item_id, order_items!inner(order_id, orders!inner(purchase_request_id))');

  const codeCountByPr = new Map<string, number>();
  codes?.forEach((c: any) => {
    const prId = c.order_items?.orders?.purchase_request_id;
    if (prId) codeCountByPr.set(prId, (codeCountByPr.get(prId) ?? 0) + 1);
  });

  const titlesByPr = new Map<string, string[]>();
  items?.forEach((i: any) => {
    const arr = titlesByPr.get(i.purchase_request_id) ?? [];
    arr.push(i.products.title);
    titlesByPr.set(i.purchase_request_id, arr);
  });

  return data.map(r => ({
    ...r,
    product_titles: titlesByPr.get(r.purchase_request_id) ?? [],
    code_count: codeCountByPr.get(r.purchase_request_id) ?? 0,
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

  const { data: request } = await db
    .from('buyer_orders_view')
    .select('purchase_request_id, status, total_amount, currency, amount_in_usd, customer_email, created_at')
    .eq('purchase_request_id', requestId)
    .maybeSingle();

  if (!request) return null;

  const { data: rawItems } = await db
    .from('purchase_request_items')
    .select('id, product_id, products!inner(id, title, slug), unit_price, currency')
    .eq('purchase_request_id', requestId);

  // For each item, find order_item + code + session
  const enriched = await Promise.all((rawItems ?? []).map(async (item: any) => {
    // Find order_item in orders for this request
    const { data: oi } = await db
      .from('order_items')
      .select('id, price, currency, orders!inner(purchase_request_id)')
      .eq('product_id', item.product_id)
      .eq('orders.purchase_request_id', requestId)
      .maybeSingle();

    let code: BuyerOrderDetail['items'][number]['code'] = null;
    let attempts: BuyerOrderDetail['items'][number]['attempts'] = null;

    if (oi) {
      const { data: codeRow } = await db
        .from('buyer_codes_full')
        .select('code_id, code_prefix, code_status, expires_at, redeemed_at, session_id')
        .eq('order_item_id', oi.id)
        .maybeSingle();

      if (codeRow) {
        code = {
          code_id: codeRow.code_id,
          code_prefix: codeRow.code_prefix,
          code_status: codeRow.code_status,
          expires_at: codeRow.expires_at,
          redeemed_at: codeRow.redeemed_at,
          session_id: codeRow.session_id,
        };
      }

      const { data: att } = await db.rpc('buyer_attempts_remaining', {
        p_order_item_id: oi.id,
      });
      const row = Array.isArray(att) ? att[0] : att;
      if (row) attempts = { used: row.used, max: row.max, remaining: row.remaining };
    }

    return {
      order_item_id: oi?.id ?? null,
      product_id: item.product_id,
      product_title: item.products.title,
      product_slug: item.products.slug,
      price: Number(item.unit_price),
      currency: item.currency,
      code,
      attempts,
    };
  }));

  const codeIds = enriched.map(e => e.code?.code_id).filter(Boolean) as string[];
  let compRequests: BuyerOrderDetail['compensation_requests'] = [];
  if (codeIds.length) {
    const { data: comps } = await db
      .from('buyer_compensation_view')
      .select('id, code_id, status, sequence_number, admin_reason, requested_at, decided_at')
      .in('code_id', codeIds)
      .order('requested_at', { ascending: false });
    compRequests = (comps ?? []) as any;
  }

  return {
    request: {
      ...(request as any),
      product_titles: enriched.map(e => e.product_title),
      code_count: codeIds.length,
    },
    items: enriched,
    compensation_requests: compRequests,
  };
}

export async function listBuyerCodes(): Promise<BuyerCodeRow[]> {
  const db = await createClient();
  const { data } = await db
    .from('buyer_codes_full')
    .select('code_id, code_prefix, code_status, issued_at, delivered_at, redeemed_at, expires_at, session_id, product_id, product_title, product_slug')
    .order('issued_at', { ascending: false })
    .limit(100);
  return (data ?? []) as BuyerCodeRow[];
}

export async function listBuyerSessions(statusFilter?: string): Promise<BuyerSessionRow[]> {
  const db = await createClient();
  let q = db
    .from('buyer_sessions_full')
    .select('session_id, status, started_at, expires_at, ended_at, is_compensation, code_prefix, order_item_id, product_title, product_slug')
    .order('started_at', { ascending: false })
    .limit(100);

  if (statusFilter === 'active') {
    q = q.in('status', ['active', 'compensation_active']);
  } else if (statusFilter === 'expired') {
    q = q.in('status', ['expired', 'expired_partial', 'exhausted']);
  } else if (statusFilter === 'completed') {
    q = q.eq('status', 'completed');
  }

  const { data } = await q;
  return (data ?? []) as BuyerSessionRow[];
}
