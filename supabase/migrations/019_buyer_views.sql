-- ============================================================
-- 019_buyer_views.sql
-- Buyer-scoped views (SECURITY INVOKER → inherit base-table RLS)
-- ============================================================

CREATE OR REPLACE VIEW buyer_orders_view AS
SELECT
  pr.id AS purchase_request_id,
  pr.status,
  pr.total_amount,
  pr.currency,
  pr.amount_in_usd,
  pr.customer_email,
  pr.customer_phone,
  pr.created_at,
  pr.buyer_id,
  o.id AS order_id,
  o.status AS order_status
FROM purchase_requests pr
LEFT JOIN orders o ON o.purchase_request_id = pr.id;

GRANT SELECT ON buyer_orders_view TO authenticated;

CREATE OR REPLACE VIEW buyer_codes_full AS
SELECT
  pc.id AS code_id,
  pc.order_item_id,
  pc.code_prefix,
  pc.status AS code_status,
  pc.issued_at,
  pc.delivered_at,
  pc.redeemed_at,
  pc.expires_at,
  pc.replacement_for_code_id,
  cr.session_id,
  oi.product_id,
  p.title AS product_title,
  p.slug AS product_slug,
  pr.id AS purchase_request_id,
  pr.buyer_id,
  pr.customer_email
FROM purchase_codes pc
JOIN order_items oi ON oi.id = pc.order_item_id
JOIN orders o ON o.id = oi.order_id
JOIN purchase_requests pr ON pr.id = o.purchase_request_id
JOIN products p ON p.id = oi.product_id
LEFT JOIN code_redemptions cr ON cr.code_id = pc.id;

GRANT SELECT ON buyer_codes_full TO authenticated;

CREATE OR REPLACE VIEW buyer_sessions_full AS
SELECT
  ds.id AS session_id,
  ds.status,
  ds.started_at,
  ds.expires_at,
  ds.ended_at,
  ds.is_compensation,
  ds.parent_session_id,
  ds.attempt_consumed,
  pc.id AS code_id,
  pc.code_prefix,
  oi.id AS order_item_id,
  oi.product_id,
  p.title AS product_title,
  p.slug AS product_slug,
  pr.id AS purchase_request_id,
  pr.buyer_id,
  pr.customer_email
FROM download_sessions ds
JOIN purchase_codes pc ON pc.id = ds.code_id
JOIN order_items oi ON oi.id = ds.order_item_id
JOIN orders o ON o.id = oi.order_id
JOIN purchase_requests pr ON pr.id = o.purchase_request_id
JOIN products p ON p.id = oi.product_id;

GRANT SELECT ON buyer_sessions_full TO authenticated;

-- Dashboard stats (SECURITY DEFINER with auth check)
CREATE OR REPLACE FUNCTION buyer_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email citext := auth.email();
BEGIN
  IF v_uid IS NULL THEN RETURN '{}'::jsonb; END IF;

  RETURN jsonb_build_object(
    'total_orders', (
      SELECT COUNT(*) FROM purchase_requests
      WHERE buyer_id = v_uid OR (buyer_id IS NULL AND customer_email = v_email)
    ),
    'pending_orders', (
      SELECT COUNT(*) FROM purchase_requests
      WHERE (buyer_id = v_uid OR (buyer_id IS NULL AND customer_email = v_email))
        AND status IN ('created','pending')
    ),
    'active_codes', (
      SELECT COUNT(*) FROM buyer_codes_full
      WHERE (buyer_id = v_uid OR customer_email = v_email)
        AND code_status IN ('issued','delivered')
        AND expires_at > now()
    ),
    'active_sessions', (
      SELECT COUNT(*) FROM buyer_sessions_full
      WHERE (buyer_id = v_uid OR customer_email = v_email)
        AND status IN ('active','compensation_active')
        AND expires_at > now()
    ),
    'unread_notifications', (
      SELECT COUNT(*) FROM notifications WHERE user_id = v_uid AND read_at IS NULL
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION buyer_dashboard_stats() TO authenticated;

-- Attempts remaining for a given order item
CREATE OR REPLACE FUNCTION buyer_attempts_remaining(p_order_item_id uuid)
RETURNS TABLE(used int, max int, remaining int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email citext := auth.email();
  v_owner_ok boolean;
  v_max int;
  v_used int;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    JOIN purchase_requests pr ON pr.id = o.purchase_request_id
    WHERE oi.id = p_order_item_id
      AND (pr.buyer_id = v_uid OR (pr.buyer_id IS NULL AND pr.customer_email = v_email))
  ) INTO v_owner_ok;

  IF NOT v_owner_ok THEN
    RETURN;
  END IF;

  SELECT max_attempts_per_product INTO v_max FROM download_settings WHERE id = 1;
  IF v_max IS NULL THEN v_max := 3; END IF;

  SELECT COUNT(*) INTO v_used
    FROM download_attempts
    WHERE order_item_id = p_order_item_id AND completed = true;

  RETURN QUERY SELECT v_used, v_max, GREATEST(v_max - v_used, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION buyer_attempts_remaining(uuid) TO authenticated;
