-- ============================================================
-- 036_seller_order_detail.sql
-- Single-sale detail RPC for sellers (strictly masked buyer)
-- ============================================================

CREATE OR REPLACE FUNCTION seller_order_detail(p_order_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_seller uuid := auth.uid();
  v_max_attempts int;
  v_base record;
  v_codes jsonb;
  v_sessions jsonb;
  v_attempts jsonb;
  v_ledger jsonb;
  v_attempts_used int;
BEGIN
  IF v_seller IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  SELECT COALESCE((SELECT max_attempts_per_product FROM download_settings WHERE id = 1), 3)
    INTO v_max_attempts;

  SELECT
    oi.id AS order_item_id,
    oi.order_id,
    oi.product_id,
    p.title AS product_title,
    p.slug AS product_slug,
    p.cover_image_url,
    pv.version_number,
    oi.price,
    oi.currency,
    oi.commission_rate_at_sale,
    oi.commission_amount,
    oi.net_seller_amount,
    oi.created_at AS ordered_at,
    o.status::text AS order_status,
    CASE
      WHEN pr.customer_email IS NULL THEN 'مشتري'
      ELSE substring(pr.customer_email::text from 1 for 2) || '***@' ||
           split_part(pr.customer_email::text, '@', 2)
    END AS buyer_masked
  INTO v_base
  FROM order_items oi
  JOIN products p ON p.id = oi.product_id
  JOIN product_versions pv ON pv.id = oi.product_version_id
  JOIN orders o ON o.id = oi.order_id
  JOIN purchase_requests pr ON pr.id = o.purchase_request_id
  WHERE oi.id = p_order_item_id
    AND p.seller_id = v_seller
    AND pr.status IN ('approved', 'completed');

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Codes issued for this order_item (including any replacement codes), no code_hash or staff IDs
  SELECT COALESCE(jsonb_agg(c ORDER BY c.created_at DESC), '[]'::jsonb)
  INTO v_codes
  FROM (
    SELECT
      pc.id,
      pc.code_prefix,
      pc.status::text AS status,
      pc.issued_at,
      pc.delivered_at,
      pc.delivery_confirmation_method::text AS delivery_confirmation_method,
      pc.redeemed_at,
      pc.expires_at,
      pc.revoked_at,
      (pc.replacement_for_code_id IS NOT NULL) AS is_replacement,
      pc.created_at,
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', cda.id,
            'channel', cda.channel::text,
            'sent_at', cda.sent_at,
            'result', cda.result::text
          )
          ORDER BY cda.sent_at DESC
        )
        FROM code_delivery_attempts cda
        WHERE cda.code_id = pc.id
      ), '[]'::jsonb) AS delivery_attempts
    FROM purchase_codes pc
    WHERE pc.order_item_id = p_order_item_id
  ) c;

  -- Download sessions and file deliveries (strictly no buyer_id, IP, or user_agent)
  SELECT COALESCE(jsonb_agg(s ORDER BY s.started_at DESC), '[]'::jsonb)
  INTO v_sessions
  FROM (
    SELECT
      ds.id,
      ds.code_id,
      ds.status::text AS status,
      ds.started_at,
      ds.expires_at,
      ds.ended_at,
      ds.is_compensation,
      ds.attempt_consumed,
      ds.revoked_at,
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', dd.id,
            'file_name', COALESCE(f.display_name, f.original_name),
            'file_size_bytes', fv.size_bytes,
            'delivery_type', dd.delivery_type::text,
            'delivered_at', dd.delivered_at,
            'bytes_sent', dd.bytes_sent,
            'completed', dd.completed,
            'failure_reason', dd.failure_reason
          )
          ORDER BY dd.delivered_at DESC
        )
        FROM download_deliveries dd
        JOIN file_versions fv ON fv.id = dd.file_version_id
        JOIN files f ON f.id = fv.file_id
        WHERE dd.session_id = ds.id
      ), '[]'::jsonb) AS deliveries
    FROM download_sessions ds
    WHERE ds.order_item_id = p_order_item_id
  ) s;

  -- Download attempts
  SELECT COALESCE(jsonb_agg(a ORDER BY a.attempt_number ASC), '[]'::jsonb)
  INTO v_attempts
  FROM (
    SELECT
      da.id,
      da.attempt_number,
      da.type::text AS type,
      da.consumed_at,
      da.completed
    FROM download_attempts da
    WHERE da.order_item_id = p_order_item_id
  ) a;

  SELECT COUNT(*)::int INTO v_attempts_used
  FROM download_attempts da
  WHERE da.order_item_id = p_order_item_id AND da.completed = true;

  -- Wallet ledger transactions referencing this order_item
  SELECT COALESCE(jsonb_agg(t ORDER BY t.created_at ASC), '[]'::jsonb)
  INTO v_ledger
  FROM (
    SELECT
      ft.id,
      ft.type::text AS type,
      ft.amount,
      ft.currency,
      ft.created_at
    FROM financial_transactions ft
    JOIN seller_wallets sw ON sw.id = ft.wallet_id
    WHERE sw.seller_id = v_seller
      AND ft.reference_type = 'order_item'
      AND ft.reference_id = p_order_item_id
  ) t;

  RETURN jsonb_build_object(
    'order_item_id', v_base.order_item_id,
    'order_id', v_base.order_id,
    'product_id', v_base.product_id,
    'product_title', v_base.product_title,
    'product_slug', v_base.product_slug,
    'cover_image_url', v_base.cover_image_url,
    'version_number', v_base.version_number,
    'price', v_base.price,
    'currency', v_base.currency,
    'commission_rate_at_sale', v_base.commission_rate_at_sale,
    'commission_amount', v_base.commission_amount,
    'net_seller_amount', v_base.net_seller_amount,
    'ordered_at', v_base.ordered_at,
    'order_status', v_base.order_status,
    'buyer_masked', v_base.buyer_masked,
    'attempts_used', v_attempts_used,
    'attempts_max', v_max_attempts,
    'codes', v_codes,
    'sessions', v_sessions,
    'attempts', v_attempts,
    'ledger_transactions', v_ledger
  );
END;
$$;

REVOKE ALL ON FUNCTION seller_order_detail(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION seller_order_detail(uuid) TO authenticated;
