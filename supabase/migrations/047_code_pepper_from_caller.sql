-- Code hashes must use the SAME pepper the app uses to verify them. The old
-- functions fell back to 'default-pepper' because app.code_pepper was never
-- configured in Postgres, so codes issued through the admin API could never be
-- redeemed. Take the pepper from the trusted caller instead.
--
-- New overloads replace the old signatures for client roles; the app passes
-- CODE_HASH_PEPPER explicitly.

CREATE OR REPLACE FUNCTION public.approve_purchase_request(
  p_request_id uuid, p_pepper text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_req purchase_requests%ROWTYPE;
  v_order_id uuid;
  v_item record;
  v_code_id uuid; v_code text; v_hash text; v_prefix char(4);
  v_chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_attempt int;
  v_output jsonb := '[]'::jsonb;
  v_seller_id uuid;
  v_category_id uuid;
  v_comm_rate numeric;
  v_comm_amount numeric;
  v_net_amount numeric;
BEGIN
  IF NOT (is_admin_or_above() OR staff_has('code.issue')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_pepper IS NULL OR length(p_pepper) < 8 THEN
    RAISE EXCEPTION 'pepper_required';
  END IF;

  SELECT * INTO v_req FROM purchase_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'purchase_request_not_found'; END IF;
  IF v_req.status NOT IN ('created','pending') THEN RAISE EXCEPTION 'purchase_request_not_approvable'; END IF;

  INSERT INTO orders(purchase_request_id, buyer_id, status,
    total_amount, currency, amount_in_usd, exchange_rate_at_purchase)
  VALUES (v_req.id, v_req.buyer_id, 'created',
    v_req.total_amount, v_req.currency, v_req.amount_in_usd, v_req.exchange_rate_at_purchase)
  RETURNING id INTO v_order_id;

  FOR v_item IN
    SELECT id, product_id, product_version_id, unit_price, currency, quantity
    FROM purchase_request_items WHERE purchase_request_id = p_request_id
  LOOP
    IF v_item.product_version_id IS NULL THEN RAISE EXCEPTION 'product_version_required'; END IF;

    SELECT p.seller_id, p.category_id
      INTO v_seller_id, v_category_id
      FROM products p WHERE p.id = v_item.product_id;

    v_comm_rate := resolve_effective_commission_rate(v_seller_id, v_category_id);
    v_comm_amount := ROUND(v_item.unit_price * v_comm_rate, 4);
    v_net_amount := ROUND(v_item.unit_price - v_comm_amount, 4);

    DECLARE v_order_item_id uuid;
    BEGIN
      INSERT INTO order_items(
        order_id, product_id, product_version_id, price, currency,
        commission_rate_at_sale, commission_amount, net_seller_amount
      ) VALUES (
        v_order_id, v_item.product_id, v_item.product_version_id, v_item.unit_price, v_item.currency,
        v_comm_rate, v_comm_amount, v_net_amount
      ) RETURNING id INTO v_order_item_id;

      PERFORM credit_seller_wallet_for_order_item(
        v_order_item_id, v_seller_id, v_item.unit_price, v_comm_amount, v_net_amount, v_item.currency
      );

      v_attempt := 0;
      LOOP
        v_attempt := v_attempt + 1;
        IF v_attempt > 10 THEN RAISE EXCEPTION 'code_generation_failed'; END IF;
        v_code := '';
        FOR i IN 1..16 LOOP
          v_code := v_code || substr(v_chars, floor(random() * length(v_chars))::int + 1, 1);
          IF i IN (4,8,12) THEN v_code := v_code || '-'; END IF;
        END LOOP;
        v_hash := encode(hmac(v_code, p_pepper, 'sha256'), 'hex');
        v_prefix := substring(v_code from 1 for 4);
        BEGIN
          INSERT INTO purchase_codes(order_item_id, code_hash, code_prefix, status,
            issued_by, issued_at, expires_at)
          VALUES (v_order_item_id, v_hash, v_prefix, 'issued',
            auth.uid(), now(), now() + interval '72 hours')
          RETURNING id INTO v_code_id;
          EXIT;
        EXCEPTION WHEN unique_violation THEN CONTINUE;
        END;
      END LOOP;

      INSERT INTO code_plaintext_handoff(code_id, plaintext, expires_at)
        VALUES (v_code_id, v_code, now() + interval '10 minutes');

      v_output := v_output || jsonb_build_object(
        'code_id', v_code_id, 'order_item_id', v_order_item_id,
        'code_prefix', v_prefix, 'product_id', v_item.product_id,
        'commission_rate', v_comm_rate, 'net_seller_amount', v_net_amount
      );
    END;
  END LOOP;

  UPDATE purchase_requests SET status = 'approved' WHERE id = p_request_id;

  PERFORM log_audit('purchase_request.approved', 'purchase_requests', p_request_id,
    jsonb_build_object('status', v_req.status),
    jsonb_build_object('status', 'approved', 'order_id', v_order_id), NULL);

  RETURN v_output;
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_replacement_code(
  p_original_code_id uuid, p_reason text, p_pepper text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_original purchase_codes%ROWTYPE;
  v_new_id uuid; v_hash text; v_prefix char(4);
  v_attempt int := 0;
  v_chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
BEGIN
  IF NOT (is_admin_or_above() OR staff_has('code.issue')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;
  IF p_pepper IS NULL OR length(p_pepper) < 8 THEN
    RAISE EXCEPTION 'pepper_required';
  END IF;

  SELECT * INTO v_original FROM purchase_codes WHERE id = p_original_code_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'code_not_found'; END IF;
  IF v_original.delivered_at IS NOT NULL AND v_original.status <> 'expired' THEN
    RAISE EXCEPTION 'replacement_not_allowed_for_delivered_active';
  END IF;
  IF v_original.status = 'redeemed' THEN
    RAISE EXCEPTION 'replacement_not_allowed_for_redeemed';
  END IF;

  LOOP
    v_attempt := v_attempt + 1;
    IF v_attempt > 10 THEN RAISE EXCEPTION 'code_generation_failed'; END IF;
    v_code := '';
    FOR i IN 1..16 LOOP
      v_code := v_code || substr(v_chars, floor(random() * length(v_chars))::int + 1, 1);
      IF i IN (4,8,12) THEN v_code := v_code || '-'; END IF;
    END LOOP;
    v_hash := encode(hmac(v_code, p_pepper, 'sha256'), 'hex');
    v_prefix := substring(v_code from 1 for 4);
    BEGIN
      INSERT INTO purchase_codes(
        order_item_id, code_hash, code_prefix, status, issued_by, issued_at, expires_at,
        replacement_for_code_id, replacement_reason
      ) VALUES (
        v_original.order_item_id, v_hash, v_prefix, 'issued',
        auth.uid(), now(), now() + interval '72 hours',
        p_original_code_id, p_reason
      ) RETURNING id INTO v_new_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN CONTINUE;
    END;
  END LOOP;

  INSERT INTO code_plaintext_handoff(code_id, plaintext, expires_at)
    VALUES (v_new_id, v_code, now() + interval '10 minutes');

  PERFORM log_audit('code.replacement_issued', 'purchase_codes', v_new_id,
    NULL, jsonb_build_object('original_code_id', p_original_code_id, 'reason', p_reason), p_reason);

  RETURN v_new_id;
END;
$$;

-- Retire the old signatures for client roles so no caller can generate a code
-- with the mismatched fallback pepper.
REVOKE ALL ON FUNCTION public.approve_purchase_request(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.issue_replacement_code(uuid, text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.approve_purchase_request(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.issue_replacement_code(uuid, text, text) TO authenticated, service_role;
