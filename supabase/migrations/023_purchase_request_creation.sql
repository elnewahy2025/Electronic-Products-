-- ============================================================
-- 023_purchase_request_creation.sql
-- ============================================================

ALTER TABLE purchase_requests
  ADD COLUMN IF NOT EXISTS access_token_hash text,
  ADD COLUMN IF NOT EXISTS ip inet,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS full_name text;

CREATE INDEX IF NOT EXISTS idx_purchase_requests_email_time
  ON purchase_requests(customer_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_ip_time
  ON purchase_requests(ip, created_at DESC)
  WHERE ip IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_requests_token
  ON purchase_requests(access_token_hash)
  WHERE access_token_hash IS NOT NULL;

-- USD conversion helper (handles both directions)
CREATE OR REPLACE FUNCTION get_usd_rate(p_currency char(3))
RETURNS numeric
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT rate FROM exchange_rates
     WHERE base_currency = p_currency AND quote_currency = 'USD'
     ORDER BY effective_at DESC, set_at DESC LIMIT 1),
    (SELECT 1.0 / NULLIF(rate, 0) FROM exchange_rates
     WHERE base_currency = 'USD' AND quote_currency = p_currency
     ORDER BY effective_at DESC, set_at DESC LIMIT 1),
    CASE WHEN p_currency = 'USD' THEN 1.0 ELSE NULL END
  )
$$;

GRANT EXECUTE ON FUNCTION get_usd_rate(char) TO anon, authenticated;

-- Create purchase request atomically
CREATE OR REPLACE FUNCTION create_purchase_request(
  p_product_id uuid,
  p_email citext,
  p_phone text,
  p_full_name text,
  p_notes text,
  p_access_token_hash text,
  p_ip inet,
  p_user_agent text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_product products%ROWTYPE;
  v_version product_versions%ROWTYPE;
  v_buyer uuid := auth.uid();
  v_rate numeric;
  v_amount_usd numeric;
  v_request_id uuid;
  v_email_count int;
  v_ip_count int;
BEGIN
  SELECT * INTO v_product FROM products WHERE id = p_product_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'product_not_found'; END IF;
  IF v_product.status <> 'published' OR v_product.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'product_not_available';
  END IF;

  SELECT * INTO v_version FROM product_versions
    WHERE product_id = p_product_id AND status = 'published'
    ORDER BY published_at DESC NULLS LAST, version_number DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'no_published_version'; END IF;

  IF p_email IS NULL OR length(trim(p_email::text)) < 3 THEN
    RAISE EXCEPTION 'email_required';
  END IF;
  IF p_phone IS NULL OR length(trim(p_phone)) < 5 THEN
    RAISE EXCEPTION 'phone_required';
  END IF;

  -- Rate limit: same email 3/hour
  SELECT COUNT(*) INTO v_email_count FROM purchase_requests
    WHERE customer_email = p_email AND created_at > now() - interval '1 hour';
  IF v_email_count >= 3 THEN RAISE EXCEPTION 'rate_limit_email'; END IF;

  -- Rate limit: same IP 10/hour
  IF p_ip IS NOT NULL THEN
    SELECT COUNT(*) INTO v_ip_count FROM purchase_requests
      WHERE ip = p_ip AND created_at > now() - interval '1 hour';
    IF v_ip_count >= 10 THEN RAISE EXCEPTION 'rate_limit_ip'; END IF;
  END IF;

  -- Duplicate guard: same email + product within 10 min with pending status
  IF EXISTS (
    SELECT 1 FROM purchase_requests pr
    JOIN purchase_request_items pri ON pri.purchase_request_id = pr.id
    WHERE pr.customer_email = p_email
      AND pri.product_id = p_product_id
      AND pr.created_at > now() - interval '10 minutes'
      AND pr.status IN ('created','pending')
  ) THEN
    RAISE EXCEPTION 'duplicate_request';
  END IF;

  v_rate := get_usd_rate(v_product.price_currency);
  IF v_rate IS NULL THEN RAISE EXCEPTION 'no_exchange_rate'; END IF;
  v_amount_usd := round((v_product.price_amount * v_rate)::numeric, 4);

  INSERT INTO purchase_requests(
    buyer_id, customer_email, customer_phone, full_name, notes,
    status, total_amount, currency, exchange_rate_at_purchase, amount_in_usd,
    access_token_hash, ip, user_agent
  ) VALUES (
    v_buyer, p_email, p_phone, p_full_name, p_notes,
    'created', v_product.price_amount, v_product.price_currency, v_rate, v_amount_usd,
    p_access_token_hash, p_ip, p_user_agent
  ) RETURNING id INTO v_request_id;

  INSERT INTO purchase_request_items(
    purchase_request_id, product_id, product_version_id,
    unit_price, currency, quantity
  ) VALUES (
    v_request_id, p_product_id, v_version.id,
    v_product.price_amount, v_product.price_currency, 1
  );

  -- Notify all active staff
  INSERT INTO notifications(user_id, type, title, body)
  SELECT sm.profile_id, 'purchase_request_created',
    'طلب شراء جديد',
    v_product.title || ' — ' || p_email::text
  FROM store_members sm
  JOIN roles r ON r.id = sm.role_id
  WHERE sm.status = 'active'
    AND r.code IN ('super_admin','admin','staff');

  PERFORM log_audit('purchase_request.created', 'purchase_requests', v_request_id,
    NULL,
    jsonb_build_object(
      'product_id', p_product_id,
      'amount', v_product.price_amount,
      'currency', v_product.price_currency::text
    ), NULL);

  RETURN jsonb_build_object(
    'request_id', v_request_id,
    'short_ref', substring(v_request_id::text, 1, 8),
    'amount', v_product.price_amount,
    'currency', v_product.price_currency,
    'amount_in_usd', v_amount_usd
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_purchase_request(uuid, citext, text, text, text, text, inet, text)
  TO anon, authenticated;

-- Guest tracking by token
CREATE OR REPLACE FUNCTION track_purchase_by_token(p_token_hash text)
RETURNS TABLE (
  request_id uuid,
  short_ref text,
  status purchase_request_status_enum,
  total_amount numeric,
  currency char(3),
  created_at timestamptz,
  product_title text,
  product_slug text,
  has_codes boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    pr.id,
    substring(pr.id::text, 1, 8),
    pr.status,
    pr.total_amount,
    pr.currency,
    pr.created_at,
    p.title,
    p.slug,
    EXISTS (
      SELECT 1 FROM purchase_codes pc
      JOIN order_items oi ON oi.id = pc.order_item_id
      JOIN orders o ON o.id = oi.order_id
      WHERE o.purchase_request_id = pr.id
    )
  FROM purchase_requests pr
  JOIN purchase_request_items pri ON pri.purchase_request_id = pr.id
  JOIN products p ON p.id = pri.product_id
  WHERE pr.access_token_hash = p_token_hash
    AND pr.access_token_hash IS NOT NULL
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION track_purchase_by_token(text) TO anon, authenticated;