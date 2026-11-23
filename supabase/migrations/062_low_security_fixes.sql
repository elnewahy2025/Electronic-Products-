-- ============================================================
-- 062_low_security_fixes.sql
-- #22: Serialize concurrent purchase-request creation per (email, product_id)
--      via pg_advisory_xact_lock to eliminate duplicate-request races.
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_purchase_request(
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
  IF p_email IS NULL OR length(trim(p_email::text)) < 3 THEN
    RAISE EXCEPTION 'email_required';
  END IF;
  IF p_phone IS NULL OR length(trim(p_phone)) < 5 THEN
    RAISE EXCEPTION 'phone_required';
  END IF;

  -- Serialize concurrent submissions for the same (email, product_id)
  -- so two racing requests cannot both pass the 10-minute duplicate check.
  PERFORM pg_advisory_xact_lock(
    hashtext('pr:' || lower(trim(p_email::text)) || ':' || COALESCE(p_product_id::text, ''))
  );

  SELECT * INTO v_product FROM products WHERE id = p_product_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'product_not_found'; END IF;
  IF v_product.status <> 'published' OR v_product.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'product_not_available';
  END IF;

  SELECT * INTO v_version FROM product_versions
    WHERE product_id = p_product_id AND status = 'published'
    ORDER BY published_at DESC NULLS LAST, version_number DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'no_published_version'; END IF;

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
