-- ============================================================
-- 032_seller_orders.sql
-- Seller sales list + stats (masked buyer identity)
-- ============================================================

-- ------------------------------------------------------------
-- seller_orders: paginated list of sales for the current seller
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION seller_orders(
  p_product_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL,           -- pending | active | completed | expired | revoked
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
) RETURNS TABLE (
  order_item_id uuid,
  product_id uuid,
  product_title text,
  product_slug text,
  price numeric,
  currency char(3),
  ordered_at timestamptz,
  buyer_masked text,
  code_status text,
  code_prefix char(4),
  code_expires_at timestamptz,
  session_status text,
  attempts_used int,
  attempts_max int,
  commission_rate numeric,
  net_amount numeric,
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_seller uuid := auth.uid();
  v_commission numeric;
  v_max_attempts int;
BEGIN
  IF v_seller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  SELECT COALESCE(
    (SELECT rate FROM seller_commissions
     WHERE seller_id = v_seller
       AND (effective_to IS NULL OR effective_to > now())
     ORDER BY effective_from DESC LIMIT 1),
    (SELECT default_rate FROM commission_settings WHERE id = 1),
    0.10
  ) INTO v_commission;

  SELECT COALESCE((SELECT max_attempts_per_product FROM download_settings WHERE id = 1), 3)
    INTO v_max_attempts;

  RETURN QUERY
  WITH base AS (
    SELECT
      oi.id AS order_item_id,
      oi.product_id,
      p.title AS product_title,
      p.slug AS product_slug,
      oi.price,
      oi.currency,
      oi.created_at AS ordered_at,
      pr.customer_email,
      pc.status::text AS code_status,
      pc.code_prefix,
      pc.expires_at AS code_expires_at,
      ds.status::text AS session_status,
      (SELECT COUNT(*)::int FROM download_attempts da
        WHERE da.order_item_id = oi.id AND da.completed = true) AS attempts_used
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    JOIN orders o ON o.id = oi.order_id
    JOIN purchase_requests pr ON pr.id = o.purchase_request_id
    LEFT JOIN purchase_codes pc ON pc.order_item_id = oi.id
    LEFT JOIN download_sessions ds ON ds.code_id = pc.id
    WHERE p.seller_id = v_seller
      AND pr.status IN ('approved', 'completed')
      AND (p_product_id IS NULL OR oi.product_id = p_product_id)
      AND (p_from IS NULL OR oi.created_at >= p_from)
      AND (p_to IS NULL OR oi.created_at <= p_to)
  ),
  filtered AS (
    SELECT * FROM base
    WHERE p_status IS NULL
       OR (p_status = 'pending' AND code_status IN ('issued','delivered'))
       OR (p_status = 'active' AND code_status = 'redeemed'
           AND session_status IN ('active','compensation_active'))
       OR (p_status = 'completed' AND code_status = 'redeemed'
           AND session_status = 'completed')
       OR (p_status = 'expired' AND (code_status = 'expired'
           OR session_status IN ('expired','expired_partial','exhausted')))
       OR (p_status = 'revoked' AND code_status = 'revoked')
  ),
  counted AS (SELECT COUNT(*) AS total FROM filtered)
  SELECT
    f.order_item_id,
    f.product_id,
    f.product_title,
    f.product_slug,
    f.price,
    f.currency,
    f.ordered_at,
    CASE
      WHEN f.customer_email IS NULL THEN 'مشتري'
      ELSE substring(f.customer_email::text from 1 for 2) || '***@' ||
           split_part(f.customer_email::text, '@', 2)
    END,
    f.code_status,
    f.code_prefix,
    f.code_expires_at,
    f.session_status,
    f.attempts_used,
    v_max_attempts,
    v_commission,
    ROUND(f.price * (1 - v_commission), 4),
    c.total
  FROM filtered f, counted c
  ORDER BY f.ordered_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION seller_orders(uuid, text, timestamptz, timestamptz, int, int) TO authenticated;

-- ------------------------------------------------------------
-- seller_sales_stats: aggregate metrics for current seller
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION seller_sales_stats()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_seller uuid := auth.uid();
  v_commission numeric;
  v_result jsonb;
BEGIN
  IF v_seller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  SELECT COALESCE(
    (SELECT rate FROM seller_commissions
     WHERE seller_id = v_seller
       AND (effective_to IS NULL OR effective_to > now())
     ORDER BY effective_from DESC LIMIT 1),
    (SELECT default_rate FROM commission_settings WHERE id = 1),
    0.10
  ) INTO v_commission;

  WITH base AS (
    SELECT
      oi.id,
      oi.product_id,
      oi.price,
      oi.currency,
      oi.created_at,
      p.title,
      p.slug,
      pc.status::text AS code_status,
      ds.status::text AS session_status
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    JOIN orders o ON o.id = oi.order_id
    JOIN purchase_requests pr ON pr.id = o.purchase_request_id
    LEFT JOIN purchase_codes pc ON pc.order_item_id = oi.id
    LEFT JOIN download_sessions ds ON ds.code_id = pc.id
    WHERE p.seller_id = v_seller
      AND pr.status IN ('approved', 'completed')
  )
  SELECT jsonb_build_object(
    'total_sales', (SELECT COUNT(*) FROM base),
    'total_gross', (SELECT COALESCE(SUM(price), 0) FROM base),
    'total_net', (SELECT COALESCE(ROUND(SUM(price) * (1 - v_commission), 4), 0) FROM base),
    'currency', (SELECT currency FROM base GROUP BY currency ORDER BY COUNT(*) DESC LIMIT 1),
    'has_multiple_currencies', ((SELECT COUNT(DISTINCT currency) FROM base) > 1),
    'commission_rate', v_commission,
    'pending_count', (SELECT COUNT(*) FROM base
      WHERE code_status IN ('issued','delivered')),
    'active_count', (SELECT COUNT(*) FROM base
      WHERE code_status = 'redeemed' AND session_status IN ('active','compensation_active')),
    'completed_count', (SELECT COUNT(*) FROM base WHERE session_status = 'completed'),
    'expired_count', (SELECT COUNT(*) FROM base
      WHERE session_status IN ('expired','expired_partial','exhausted')),
    'revenue_last_30d', (
      SELECT COALESCE(ROUND(SUM(price) * (1 - v_commission), 4), 0)
      FROM base WHERE created_at > now() - interval '30 days'
    ),
    'sales_last_30d', (SELECT COUNT(*) FROM base WHERE created_at > now() - interval '30 days'),
    'top_products', (
      SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) FROM (
        SELECT
          product_id,
          title,
          slug,
          COUNT(*) AS count,
          SUM(price) AS gross,
          ROUND(SUM(price) * (1 - v_commission), 4) AS net
        FROM base
        GROUP BY product_id, title, slug
        ORDER BY COUNT(*) DESC, SUM(price) DESC
        LIMIT 5
      ) t
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION seller_sales_stats() TO authenticated;

-- ------------------------------------------------------------
-- Indexes to make the above fast
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_order_items_created
  ON order_items(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_products_seller_published
  ON products(seller_id, status);
