-- ============================================================
-- 027_security_hardening.sql
-- Comprehensive security fixes
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- PART 1: Add permission checks to every admin RPC
-- ════════════════════════════════════════════════════════════

-- 1.1 confirm_code_delivery
CREATE OR REPLACE FUNCTION confirm_code_delivery(
  p_code_id uuid,
  p_method delivery_confirmation_method_enum
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_code purchase_codes%ROWTYPE;
BEGIN
  IF NOT (is_admin_or_above() OR staff_has('code.confirm_delivery')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_code FROM purchase_codes WHERE id = p_code_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'code_not_found'; END IF;
  IF v_code.delivered_at IS NOT NULL THEN RAISE EXCEPTION 'code_already_delivered'; END IF;

  UPDATE purchase_codes
    SET delivered_at = now(),
        delivered_by = auth.uid(),
        delivery_confirmation_method = p_method,
        status = 'delivered'
    WHERE id = p_code_id;

  PERFORM log_audit(
    CASE WHEN p_method = 'auto' THEN 'code.delivery_confirmed_auto' ELSE 'code.delivery_confirmed_manual' END,
    'purchase_codes', p_code_id, NULL, NULL, NULL
  );
END;
$$;

-- 1.2 revoke_code_before_delivery
CREATE OR REPLACE FUNCTION revoke_code_before_delivery(
  p_code_id uuid, p_reason text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_code purchase_codes%ROWTYPE;
BEGIN
  IF NOT (is_admin_or_above() OR staff_has('code.revoke')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  SELECT * INTO v_code FROM purchase_codes WHERE id = p_code_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'code_not_found'; END IF;
  IF v_code.delivered_at IS NOT NULL THEN
    RAISE EXCEPTION 'code_revocation_blocked_after_delivery';
  END IF;

  UPDATE purchase_codes
    SET status = 'revoked', revoked_at = now(), revoked_by = auth.uid(), revoke_reason = p_reason
    WHERE id = p_code_id;

  PERFORM log_audit('code.revocation_confirmed', 'purchase_codes', p_code_id,
    jsonb_build_object('status', v_code.status),
    jsonb_build_object('status', 'revoked'), p_reason);
END;
$$;

-- 1.3 issue_replacement_code
CREATE OR REPLACE FUNCTION issue_replacement_code(
  p_original_code_id uuid, p_reason text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_original purchase_codes%ROWTYPE;
  v_new_id uuid; v_hash text; v_prefix char(4);
  v_attempt int := 0;
  v_chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text; v_pepper text;
BEGIN
  IF NOT (is_admin_or_above() OR staff_has('code.issue')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required';
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
    SELECT COALESCE(NULLIF(current_setting('app.code_pepper', true), ''), 'default-pepper') INTO v_pepper;
    v_hash := encode(hmac(v_code, v_pepper, 'sha256'), 'hex');
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

-- 1.4 create_compensation_session
CREATE OR REPLACE FUNCTION create_compensation_session(
  p_code_id uuid, p_reason text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_max int; v_seq int; v_req_id uuid; v_session_id uuid; v_dur int;
  v_order_item uuid; v_pv uuid;
BEGIN
  IF NOT (is_admin_or_above()
          OR staff_has('download.compensation.request')
          OR staff_has('download.compensation.approve')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  SELECT max_sessions_per_product INTO v_max FROM compensation_settings WHERE id = 1;
  IF v_max IS NULL THEN v_max := 3; END IF;

  SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO v_seq
    FROM compensation_requests WHERE code_id = p_code_id;
  IF v_seq > v_max THEN RAISE EXCEPTION 'compensation_limit_reached'; END IF;

  SELECT order_item_id INTO v_order_item FROM purchase_codes WHERE id = p_code_id;
  SELECT product_version_id INTO v_pv FROM order_items WHERE id = v_order_item;

  INSERT INTO compensation_requests(code_id, status, reason, requested_by, sequence_number)
    VALUES (p_code_id, 'approved', p_reason, auth.uid(), v_seq)
    RETURNING id INTO v_req_id;

  SELECT session_duration_hours INTO v_dur FROM compensation_settings WHERE id = 1;
  IF v_dur IS NULL THEN v_dur := 4; END IF;

  INSERT INTO download_sessions(
    code_id, order_item_id, product_version_id, status, started_at, expires_at,
    is_compensation, compensation_request_id
  ) VALUES (
    p_code_id, v_order_item, v_pv, 'compensation_active',
    now(), now() + (v_dur || ' hours')::interval, true, v_req_id
  ) RETURNING id INTO v_session_id;

  UPDATE compensation_requests
    SET decided_by = auth.uid(), decided_at = now(),
        approved_session_id = v_session_id, status = 'fulfilled'
    WHERE id = v_req_id;

  PERFORM log_audit('compensation.requested', 'compensation_requests', v_req_id, NULL,
    jsonb_build_object('sequence_number', v_seq), p_reason);
  PERFORM log_audit('compensation_session.created', 'download_sessions', v_session_id, NULL, NULL, NULL);

  RETURN v_session_id;
END;
$$;

-- 1.5 reject_compensation
CREATE OR REPLACE FUNCTION reject_compensation(
  p_request_id uuid, p_admin_reason text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (is_admin_or_above() OR staff_has('download.compensation.reject')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_admin_reason IS NULL OR length(trim(p_admin_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  UPDATE compensation_requests
    SET status = 'rejected', admin_reason = p_admin_reason,
        decided_by = auth.uid(), decided_at = now()
    WHERE id = p_request_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'compensation_not_pending'; END IF;

  PERFORM log_audit('compensation.rejected', 'compensation_requests', p_request_id, NULL, NULL, p_admin_reason);
END;
$$;

-- 1.6 extend_session
CREATE OR REPLACE FUNCTION extend_session(
  p_session_id uuid, p_extra_hours int, p_reason text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_session download_sessions%ROWTYPE;
BEGIN
  IF NOT (is_admin_or_above() OR staff_has('download.session.extend')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_extra_hours IS NULL OR p_extra_hours <= 0 THEN RAISE EXCEPTION 'invalid_extra_hours'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN RAISE EXCEPTION 'reason_required'; END IF;

  SELECT * INTO v_session FROM download_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;
  IF v_session.status NOT IN ('active','compensation_active') THEN
    RAISE EXCEPTION 'session_not_extendable';
  END IF;

  UPDATE download_sessions
    SET expires_at = expires_at + (p_extra_hours || ' hours')::interval
    WHERE id = p_session_id;

  PERFORM log_audit('session.extended', 'download_sessions', p_session_id,
    jsonb_build_object('expires_at', v_session.expires_at),
    jsonb_build_object('expires_at', v_session.expires_at + (p_extra_hours || ' hours')::interval),
    p_reason);
END;
$$;

-- 1.7 revoke_session_before_delivery
CREATE OR REPLACE FUNCTION revoke_session_before_delivery(
  p_session_id uuid, p_reason text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_session download_sessions%ROWTYPE;
  v_has_delivery boolean;
BEGIN
  IF NOT (is_admin_or_above() OR staff_has('download.session.revoke')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN RAISE EXCEPTION 'reason_required'; END IF;

  SELECT * INTO v_session FROM download_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;

  SELECT EXISTS (SELECT 1 FROM download_deliveries WHERE session_id = p_session_id) INTO v_has_delivery;
  IF v_has_delivery THEN RAISE EXCEPTION 'session_revocation_blocked_after_delivery'; END IF;

  UPDATE download_sessions
    SET status = 'revoked', revoked_at = now(),
        revocation_confirmed_by = auth.uid(),
        revocation_reason = p_reason, ended_at = now()
    WHERE id = p_session_id;

  PERFORM log_audit('session.revocation_confirmed', 'download_sessions', p_session_id, NULL, NULL, p_reason);
END;
$$;

-- 1.8 approve_seller / reject_seller / suspend_seller
CREATE OR REPLACE FUNCTION approve_seller(p_seller_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prev seller_status_enum;
BEGIN
  IF NOT (is_admin_or_above() OR staff_has('seller.approve')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT status INTO v_prev FROM seller_profiles WHERE profile_id = p_seller_id FOR UPDATE;
  IF v_prev IS NULL THEN RAISE EXCEPTION 'seller_not_found'; END IF;

  UPDATE seller_profiles
    SET status = 'approved', approved_by = auth.uid(), approved_at = now(),
        rejected_by = NULL, rejected_at = NULL, rejection_reason = NULL
    WHERE profile_id = p_seller_id;

  UPDATE profiles SET account_type = 'seller' WHERE id = p_seller_id AND account_type = 'buyer';
  INSERT INTO seller_wallets (seller_id, currency, balance) VALUES (p_seller_id, 'USD', 0)
    ON CONFLICT DO NOTHING;

  PERFORM log_audit('seller.approved', 'seller_profiles', p_seller_id,
    jsonb_build_object('status', v_prev), jsonb_build_object('status', 'approved'), NULL);
END;
$$;

CREATE OR REPLACE FUNCTION reject_seller(p_seller_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (is_admin_or_above() OR staff_has('seller.reject')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN RAISE EXCEPTION 'reason_required'; END IF;

  UPDATE seller_profiles
    SET status = 'rejected', rejected_by = auth.uid(), rejected_at = now(), rejection_reason = p_reason
    WHERE profile_id = p_seller_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'seller_not_found'; END IF;

  PERFORM log_audit('seller.rejected', 'seller_profiles', p_seller_id, NULL, NULL, p_reason);
END;
$$;

CREATE OR REPLACE FUNCTION suspend_seller(p_seller_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (is_admin_or_above() OR staff_has('seller.suspend')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN RAISE EXCEPTION 'reason_required'; END IF;

  UPDATE seller_profiles
    SET status = 'suspended', suspended_by = auth.uid(), suspended_at = now(), suspension_reason = p_reason
    WHERE profile_id = p_seller_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'seller_not_found'; END IF;

  UPDATE products SET status = 'paused', suspension_reason = p_reason
    WHERE seller_id = p_seller_id AND status = 'published';

  PERFORM log_audit('seller.suspended', 'seller_profiles', p_seller_id, NULL, NULL, p_reason);
END;
$$;

-- 1.9 approve_purchase_request / reject_purchase_request
CREATE OR REPLACE FUNCTION approve_purchase_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_req purchase_requests%ROWTYPE;
  v_order_id uuid;
  v_item record;
  v_code_id uuid; v_code text; v_hash text; v_prefix char(4);
  v_chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_pepper text; v_attempt int;
  v_output jsonb := '[]'::jsonb;
BEGIN
  IF NOT (is_admin_or_above() OR staff_has('code.issue')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_req FROM purchase_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'purchase_request_not_found'; END IF;
  IF v_req.status NOT IN ('created','pending') THEN RAISE EXCEPTION 'purchase_request_not_approvable'; END IF;

  INSERT INTO orders(purchase_request_id, buyer_id, status,
    total_amount, currency, amount_in_usd, exchange_rate_at_purchase)
  VALUES (v_req.id, v_req.buyer_id, 'created',
    v_req.total_amount, v_req.currency, v_req.amount_in_usd, v_req.exchange_rate_at_purchase)
  RETURNING id INTO v_order_id;

  SELECT COALESCE(NULLIF(current_setting('app.code_pepper', true), ''), 'default-pepper') INTO v_pepper;

  FOR v_item IN
    SELECT id, product_id, product_version_id, unit_price, currency, quantity
    FROM purchase_request_items WHERE purchase_request_id = p_request_id
  LOOP
    IF v_item.product_version_id IS NULL THEN RAISE EXCEPTION 'product_version_required'; END IF;

    DECLARE v_order_item_id uuid;
    BEGIN
      INSERT INTO order_items(order_id, product_id, product_version_id, price, currency)
      VALUES (v_order_id, v_item.product_id, v_item.product_version_id, v_item.unit_price, v_item.currency)
      RETURNING id INTO v_order_item_id;

      v_attempt := 0;
      LOOP
        v_attempt := v_attempt + 1;
        IF v_attempt > 10 THEN RAISE EXCEPTION 'code_generation_failed'; END IF;
        v_code := '';
        FOR i IN 1..16 LOOP
          v_code := v_code || substr(v_chars, floor(random() * length(v_chars))::int + 1, 1);
          IF i IN (4,8,12) THEN v_code := v_code || '-'; END IF;
        END LOOP;
        v_hash := encode(hmac(v_code, v_pepper, 'sha256'), 'hex');
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
        'code_prefix', v_prefix, 'product_id', v_item.product_id
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

CREATE OR REPLACE FUNCTION reject_purchase_request(p_request_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (is_admin_or_above() OR staff_has('request.read.any')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN RAISE EXCEPTION 'reason_required'; END IF;

  UPDATE purchase_requests
    SET status = 'rejected', cancel_reason = p_reason,
        cancelled_by = auth.uid(), cancelled_at = now()
    WHERE id = p_request_id AND status IN ('created','pending');
  IF NOT FOUND THEN RAISE EXCEPTION 'purchase_request_not_rejectable'; END IF;

  PERFORM log_audit('purchase_request.rejected', 'purchase_requests', p_request_id, NULL, NULL, p_reason);
END;
$$;

-- 1.10 Payouts
CREATE OR REPLACE FUNCTION approve_payout(p_payout_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (is_admin_or_above() OR staff_has('payout.approve')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  UPDATE seller_payouts
    SET status = 'approved', decided_by = auth.uid(), decided_at = now()
    WHERE id = p_payout_id AND status = 'requested';
  IF NOT FOUND THEN RAISE EXCEPTION 'payout_not_pending'; END IF;
  PERFORM log_audit('payout.approved', 'seller_payouts', p_payout_id, NULL, NULL, NULL);
END;
$$;

CREATE OR REPLACE FUNCTION mark_payout_paid(p_payout_id uuid, p_reference text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (is_admin_or_above() OR staff_has('payout.approve')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  UPDATE seller_payouts
    SET status = 'paid', paid_at = now(), reference = p_reference
    WHERE id = p_payout_id AND status = 'approved';
  IF NOT FOUND THEN RAISE EXCEPTION 'payout_not_approved'; END IF;
  PERFORM log_audit('payout.paid', 'seller_payouts', p_payout_id, NULL,
    jsonb_build_object('reference', p_reference), NULL);
END;
$$;

CREATE OR REPLACE FUNCTION reject_payout(p_payout_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_payout seller_payouts%ROWTYPE;
  v_wallet_id uuid;
BEGIN
  IF NOT (is_admin_or_above() OR staff_has('payout.reject')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN RAISE EXCEPTION 'reason_required'; END IF;

  SELECT * INTO v_payout FROM seller_payouts WHERE id = p_payout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payout_not_found'; END IF;
  IF v_payout.status <> 'requested' THEN RAISE EXCEPTION 'payout_not_pending'; END IF;

  UPDATE seller_payouts
    SET status = 'rejected', decided_by = auth.uid(), decided_at = now(), reference = p_reason
    WHERE id = p_payout_id;

  SELECT id INTO v_wallet_id FROM seller_wallets
    WHERE seller_id = v_payout.seller_id AND currency = v_payout.currency;
  IF v_wallet_id IS NOT NULL THEN
    UPDATE seller_wallets SET balance = balance + v_payout.amount WHERE id = v_wallet_id;
    INSERT INTO financial_transactions(wallet_id, type, amount, currency, reference_type, reference_id)
      VALUES (v_wallet_id, 'adjustment', v_payout.amount, v_payout.currency, 'payout_rejected', p_payout_id);
  END IF;

  PERFORM log_audit('payout.rejected', 'seller_payouts', p_payout_id, NULL, NULL, p_reason);
END;
$$;

-- 1.11 delete_review / resolve_report
CREATE OR REPLACE FUNCTION delete_review(p_review_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_review reviews%ROWTYPE;
  v_seller uuid;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN RAISE EXCEPTION 'reason_required'; END IF;

  SELECT * INTO v_review FROM reviews WHERE id = p_review_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'review_not_found'; END IF;
  IF v_review.status = 'deleted' THEN RAISE EXCEPTION 'already_deleted'; END IF;

  SELECT seller_id INTO v_seller FROM products WHERE id = v_review.product_id;

  IF NOT (is_admin_or_above() OR staff_has('review.delete') OR v_seller = auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE reviews
    SET status = 'deleted', deleted_by = auth.uid(),
        delete_reason = p_reason, deleted_at = now()
    WHERE id = p_review_id;

  PERFORM log_audit('review.deleted', 'reviews', p_review_id,
    jsonb_build_object('status', v_review.status),
    jsonb_build_object('status', 'deleted'), p_reason);
END;
$$;

CREATE OR REPLACE FUNCTION resolve_report(
  p_report_id uuid, p_resolution report_status_enum, p_note text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (is_admin_or_above() OR staff_has('report.resolve')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_resolution NOT IN ('resolved','dismissed') THEN RAISE EXCEPTION 'invalid_resolution'; END IF;
  IF p_note IS NULL OR length(trim(p_note)) < 3 THEN RAISE EXCEPTION 'note_required'; END IF;

  UPDATE content_reports
    SET status = p_resolution, resolved_by = auth.uid(),
        resolved_at = now(), resolution_note = p_note
    WHERE id = p_report_id AND status = 'open';
  IF NOT FOUND THEN RAISE EXCEPTION 'report_not_open'; END IF;

  PERFORM log_audit('report.resolved', 'content_reports', p_report_id,
    NULL, jsonb_build_object('resolution', p_resolution), p_note);
END;
$$;

-- 1.12 Category RPCs
CREATE OR REPLACE FUNCTION set_category_parent(p_category_id uuid, p_parent_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (is_admin_or_above() OR staff_has('category.manage')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF category_would_create_cycle(p_category_id, p_parent_id) THEN
    RAISE EXCEPTION 'category_cycle_detected';
  END IF;
  UPDATE categories SET parent_id = p_parent_id, updated_at = now() WHERE id = p_category_id;
  PERFORM log_audit('category.updated', 'categories', p_category_id, NULL,
    jsonb_build_object('parent_id', p_parent_id), NULL);
END;
$$;

CREATE OR REPLACE FUNCTION delete_category_safe(
  p_category_id uuid, p_mode text, p_fallback_category_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_child_count int; v_product_count int; v_slug text;
BEGIN
  IF NOT (is_admin_or_above() OR staff_has('category.manage')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_mode NOT IN ('reassign','block') THEN RAISE EXCEPTION 'invalid_mode'; END IF;
  IF p_fallback_category_id = p_category_id THEN RAISE EXCEPTION 'invalid_fallback'; END IF;

  IF p_fallback_category_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM categories WHERE id = p_fallback_category_id) THEN
      RAISE EXCEPTION 'fallback_not_found';
    END IF;
    IF category_would_create_cycle(p_category_id, p_fallback_category_id) THEN
      RAISE EXCEPTION 'fallback_inside_subtree';
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_child_count FROM categories WHERE parent_id = p_category_id;
  SELECT COUNT(*) INTO v_product_count FROM products
    WHERE category_id = p_category_id AND status <> 'deleted';

  IF p_mode = 'block' AND (v_child_count > 0 OR v_product_count > 0) THEN
    RAISE EXCEPTION 'category_has_dependents: children=% products=%', v_child_count, v_product_count;
  END IF;

  SELECT slug INTO v_slug FROM categories WHERE id = p_category_id;
  IF v_slug IS NULL THEN RAISE EXCEPTION 'category_not_found'; END IF;

  IF v_child_count > 0 THEN
    UPDATE categories SET parent_id = p_fallback_category_id WHERE parent_id = p_category_id;
  END IF;
  IF v_product_count > 0 THEN
    UPDATE products SET category_id = p_fallback_category_id WHERE category_id = p_category_id;
  END IF;

  DELETE FROM categories WHERE id = p_category_id;

  PERFORM log_audit('category.deleted', 'categories', p_category_id,
    jsonb_build_object('slug', v_slug, 'children', v_child_count, 'products', v_product_count),
    jsonb_build_object('mode', p_mode, 'fallback', p_fallback_category_id), NULL);

  RETURN jsonb_build_object(
    'reassigned_children', v_child_count,
    'reassigned_products', v_product_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION reorder_categories(p_order jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_item jsonb;
BEGIN
  IF NOT (is_admin_or_above() OR staff_has('category.manage')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  FOR v_item IN SELECT jsonb_array_elements(p_order) LOOP
    UPDATE categories SET sort_order = (v_item->>'sort_order')::int, updated_at = now()
      WHERE id = (v_item->>'id')::uuid;
  END LOOP;
  PERFORM log_audit('category.reordered', 'categories', NULL, NULL,
    jsonb_build_object('count', jsonb_array_length(p_order)), NULL);
END;
$$;

-- ════════════════════════════════════════════════════════════
-- PART 2: Revoke dangerous service-only RPCs from authenticated
-- ════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION record_successful_attempt(uuid, uuid, download_attempt_type_enum) FROM authenticated;
REVOKE EXECUTE ON FUNCTION mark_session_completed(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION expire_partial_session(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION pick_drive_account(uuid, bigint) FROM authenticated;
REVOKE EXECUTE ON FUNCTION update_drive_quota(uuid, bigint, bigint) FROM authenticated;

-- ════════════════════════════════════════════════════════════
-- PART 3: RLS policy fixes
-- ════════════════════════════════════════════════════════════

-- files_update: add WITH CHECK to prevent seller_id hijack
DROP POLICY IF EXISTS files_update ON files;
CREATE POLICY files_update ON files FOR UPDATE
  USING (seller_id = auth.uid() OR is_admin_or_above())
  WITH CHECK (seller_id = auth.uid() OR is_admin_or_above());

-- allowed_file_types: restrict read to admins + filetype managers
DROP POLICY IF EXISTS aft_read ON allowed_file_types;
CREATE POLICY aft_read ON allowed_file_types FOR SELECT
  USING (is_admin_or_above() OR staff_has('filetype.manage'));

-- seller_payouts: revoke direct INSERT (must go through request_payout RPC)
REVOKE INSERT ON seller_payouts FROM authenticated;
DROP POLICY IF EXISTS payouts_insert ON seller_payouts;

-- seller_drive_accounts: enforce a single default per seller
CREATE UNIQUE INDEX IF NOT EXISTS uq_drive_one_default_per_seller
  ON seller_drive_accounts(seller_id) WHERE is_default = true;

-- ════════════════════════════════════════════════════════════
-- PART 4: Field-level restriction triggers
-- ════════════════════════════════════════════════════════════

-- 4.1 notifications: only read_at can change
CREATE OR REPLACE FUNCTION restrict_notification_updates() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.type IS DISTINCT FROM OLD.type
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.body IS DISTINCT FROM OLD.body
     OR NEW.link IS DISTINCT FROM OLD.link
     OR NEW.data IS DISTINCT FROM OLD.data
     OR NEW.category IS DISTINCT FROM OLD.category
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'notification_immutable_fields';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restrict_notification_updates ON notifications;
CREATE TRIGGER trg_restrict_notification_updates
  BEFORE UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION restrict_notification_updates();

-- 4.2 reviews: block content edits + prevent un-delete
CREATE OR REPLACE FUNCTION restrict_review_updates() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.product_id IS DISTINCT FROM OLD.product_id
     OR NEW.buyer_id IS DISTINCT FROM OLD.buyer_id
     OR NEW.order_item_id IS DISTINCT FROM OLD.order_item_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'review_immutable_fields';
  END IF;

  IF OLD.status = 'deleted' AND NEW.status <> 'deleted' AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'cannot_undelete_review';
  END IF;

  IF (NEW.rating IS DISTINCT FROM OLD.rating OR NEW.body IS DISTINCT FROM OLD.body)
     AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'review_content_immutable';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restrict_review_updates ON reviews;
CREATE TRIGGER trg_restrict_review_updates
  BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION restrict_review_updates();

-- 4.3 purchase_codes: block code_hash / order_item_id / issued_at changes
CREATE OR REPLACE FUNCTION restrict_code_updates() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.order_item_id IS DISTINCT FROM OLD.order_item_id
     OR NEW.code_hash IS DISTINCT FROM OLD.code_hash
     OR NEW.code_prefix IS DISTINCT FROM OLD.code_prefix
     OR NEW.issued_by IS DISTINCT FROM OLD.issued_by
     OR NEW.issued_at IS DISTINCT FROM OLD.issued_at THEN
    RAISE EXCEPTION 'code_immutable_fields';
  END IF;

  IF NEW.expires_at IS DISTINCT FROM OLD.expires_at
     AND OLD.status IN ('delivered','redeemed') THEN
    RAISE EXCEPTION 'code_expiry_immutable_after_delivery';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restrict_code_updates ON purchase_codes;
CREATE TRIGGER trg_restrict_code_updates
  BEFORE UPDATE ON purchase_codes
  FOR EACH ROW EXECUTE FUNCTION restrict_code_updates();
