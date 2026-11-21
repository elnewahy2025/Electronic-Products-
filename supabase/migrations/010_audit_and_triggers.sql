-- ============================================================
-- 010_audit_and_triggers.sql
-- ============================================================

CREATE TABLE audit_logs (
  id bigserial PRIMARY KEY,
  actor_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  actor_role text,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  before_value jsonb,
  after_value jsonb,
  reason text,
  ip inet,
  user_agent text,
  request_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_id, created_at DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(action, created_at DESC);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

CREATE TABLE audit_archives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  storage_location text NOT NULL,
  checksum text,
  records_count bigint NOT NULL DEFAULT 0,
  archived_at timestamptz NOT NULL DEFAULT now(),
  archived_by uuid REFERENCES profiles(id)
);

-- Append-only enforcement
CREATE TRIGGER trg_audit_logs_append_only
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION raise_append_only_violation();

-- Restrict via table privileges (belt & braces)
REVOKE UPDATE, DELETE ON audit_logs FROM PUBLIC;

-- ---------- The ONLY allowed writer ----------
CREATE OR REPLACE FUNCTION log_audit(
  p_action text,
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL,
  p_before jsonb DEFAULT NULL,
  p_after jsonb DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_ip inet DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_request_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid;
  v_role text;
BEGIN
  v_actor := auth.uid();
  SELECT account_type::text INTO v_role FROM profiles WHERE id = v_actor;

  INSERT INTO audit_logs(
    actor_id, actor_role, action, entity_type, entity_id,
    before_value, after_value, reason, ip, user_agent, request_id
  ) VALUES (
    v_actor, v_role, p_action, p_entity_type, p_entity_id,
    p_before, p_after, p_reason, p_ip, p_user_agent, p_request_id
  );
END;
$$;

REVOKE ALL ON FUNCTION log_audit(text,text,uuid,jsonb,jsonb,text,inet,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION log_audit(text,text,uuid,jsonb,jsonb,text,inet,text,uuid) TO authenticated, service_role;

-- ---------- Atomic operations ----------

-- 1) Redeem a code (atomic, one-shot)
CREATE OR REPLACE FUNCTION redeem_code(p_code_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_code purchase_codes%ROWTYPE;
  v_session_id uuid;
  v_duration int;
BEGIN
  SELECT * INTO v_code FROM purchase_codes WHERE id = p_code_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'code_not_found';
  END IF;
  IF v_code.status = 'revoked' THEN
    RAISE EXCEPTION 'code_revoked';
  END IF;
  IF v_code.expires_at < now() THEN
    RAISE EXCEPTION 'code_expired';
  END IF;
  IF EXISTS (SELECT 1 FROM code_redemptions WHERE code_id = p_code_id) THEN
    RAISE EXCEPTION 'code_already_redeemed';
  END IF;

  INSERT INTO code_redemptions(code_id, redeemed_by)
    VALUES (p_code_id, auth.uid())
    RETURNING session_id INTO v_session_id;

  UPDATE purchase_codes
    SET status = 'redeemed', redeemed_at = now()
    WHERE id = p_code_id;

  SELECT session_duration_hours INTO v_duration FROM download_settings WHERE id = 1;
  IF v_duration IS NULL THEN v_duration := 4; END IF;

  INSERT INTO download_sessions(
    code_id, order_item_id, product_version_id, buyer_id,
    status, started_at, expires_at
  )
  SELECT pc.id, oi.id, oi.product_version_id, auth.uid(),
         'active', now(), now() + (v_duration || ' hours')::interval
  FROM purchase_codes pc
  JOIN order_items oi ON oi.id = pc.order_item_id
  WHERE pc.id = p_code_id
  RETURNING id INTO v_session_id;

  UPDATE code_redemptions SET session_id = v_session_id WHERE code_id = p_code_id;

  PERFORM log_audit('code.redeemed', 'purchase_codes', p_code_id, NULL, NULL, NULL);
  PERFORM log_audit('session.created', 'download_sessions', v_session_id, NULL, NULL, NULL);

  RETURN v_session_id;
END;
$$;

-- 2) Consume an attempt (atomic)
CREATE OR REPLACE FUNCTION consume_attempt(
  p_order_item_id uuid,
  p_session_id uuid,
  p_type download_attempt_type_enum
) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_max int;
  v_used int;
  v_next int;
BEGIN
  -- Lock the order item row to serialize concurrent calls
  PERFORM 1 FROM order_items WHERE id = p_order_item_id FOR UPDATE;

  SELECT max_attempts_per_product INTO v_max FROM download_settings WHERE id = 1;
  IF v_max IS NULL THEN v_max := 3; END IF;

  SELECT COALESCE(MAX(attempt_number), 0) INTO v_used
    FROM download_attempts WHERE order_item_id = p_order_item_id;

  IF v_used >= v_max THEN
    RAISE EXCEPTION 'attempts_exhausted';
  END IF;

  v_next := v_used + 1;
  INSERT INTO download_attempts(order_item_id, session_id, attempt_number, type, completed)
    VALUES (p_order_item_id, p_session_id, v_next, p_type, false);

  PERFORM log_audit('attempt.consumed', 'order_items', p_order_item_id, NULL,
    jsonb_build_object('attempt_number', v_next, 'type', p_type::text), NULL);
  RETURN v_next;
END;
$$;

-- 3) Confirm code delivery (manual or auto)
CREATE OR REPLACE FUNCTION confirm_code_delivery(
  p_code_id uuid,
  p_method delivery_confirmation_method_enum
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_code purchase_codes%ROWTYPE;
BEGIN
  SELECT * INTO v_code FROM purchase_codes WHERE id = p_code_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'code_not_found'; END IF;
  IF v_code.delivered_at IS NOT NULL THEN
    RAISE EXCEPTION 'code_already_delivered';
  END IF;

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

-- 4) Create a compensation session (max 3 per code)
CREATE OR REPLACE FUNCTION create_compensation_session(
  p_code_id uuid,
  p_reason text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_max int;
  v_seq int;
  v_req_id uuid;
  v_session_id uuid;
  v_dur int;
  v_order_item uuid;
  v_pv uuid;
BEGIN
  SELECT max_sessions_per_product INTO v_max FROM compensation_settings WHERE id = 1;
  IF v_max IS NULL THEN v_max := 3; END IF;

  SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO v_seq
    FROM compensation_requests WHERE code_id = p_code_id;
  IF v_seq > v_max THEN
    RAISE EXCEPTION 'compensation_limit_reached';
  END IF;

  SELECT order_item_id INTO v_order_item FROM purchase_codes WHERE id = p_code_id;
  SELECT product_version_id INTO v_pv FROM order_items WHERE id = v_order_item;

  INSERT INTO compensation_requests(code_id, status, reason, requested_by, sequence_number)
    VALUES (p_code_id, 'approved', p_reason, auth.uid(), v_seq)
    RETURNING id INTO v_req_id;

  SELECT session_duration_hours INTO v_dur FROM compensation_settings WHERE id = 1;
  IF v_dur IS NULL THEN v_dur := 4; END IF;

  INSERT INTO download_sessions(
    code_id, order_item_id, product_version_id,
    status, started_at, expires_at, is_compensation, compensation_request_id
  ) VALUES (
    p_code_id, v_order_item, v_pv,
    'compensation_active', now(), now() + (v_dur || ' hours')::interval,
    true, v_req_id
  ) RETURNING id INTO v_session_id;

  UPDATE compensation_requests
    SET decided_by = auth.uid(), decided_at = now(), approved_session_id = v_session_id, status = 'fulfilled'
    WHERE id = v_req_id;

  PERFORM log_audit('compensation.requested', 'compensation_requests', v_req_id, NULL,
    jsonb_build_object('sequence_number', v_seq), p_reason);
  PERFORM log_audit('compensation_session.created', 'download_sessions', v_session_id, NULL, NULL, NULL);

  RETURN v_session_id;
END;
$$;

-- 5) Issue an attempt exception (Super Admin only, enforced at RLS layer + here)
CREATE OR REPLACE FUNCTION issue_attempt_exception(
  p_code_id uuid,
  p_granted int,
  p_reason text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_granted IS NULL OR p_granted <= 0 THEN
    RAISE EXCEPTION 'granted_attempts_must_be_positive';
  END IF;

  INSERT INTO attempt_exception_requests(
    code_id, status, reason, granted_attempts, requested_by, decided_by, decided_at
  ) VALUES (
    p_code_id, 'approved', p_reason, p_granted, auth.uid(), auth.uid(), now()
  ) RETURNING id INTO v_id;

  PERFORM log_audit('attempt.exception_decided', 'attempt_exception_requests', v_id, NULL,
    jsonb_build_object('granted_attempts', p_granted), p_reason);
  RETURN v_id;
END;
$$;

-- 6) Adjust wallet (Super Admin only)
CREATE OR REPLACE FUNCTION adjust_wallet(
  p_wallet_id uuid,
  p_amount numeric,
  p_reason text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_wallet seller_wallets%ROWTYPE;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_wallet FROM seller_wallets WHERE id = p_wallet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found'; END IF;

  UPDATE seller_wallets SET balance = balance + p_amount WHERE id = p_wallet_id;

  INSERT INTO financial_transactions(wallet_id, type, amount, currency, reference_type, reference_id)
    VALUES (p_wallet_id, 'adjustment', p_amount, v_wallet.currency, 'manual_adjustment', p_wallet_id);

  PERFORM log_audit('wallet.adjusted', 'seller_wallets', p_wallet_id,
    jsonb_build_object('balance', v_wallet.balance),
    jsonb_build_object('balance', v_wallet.balance + p_amount), p_reason);
END;
$$;

REVOKE ALL ON FUNCTION redeem_code(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION consume_attempt(uuid,uuid,download_attempt_type_enum) FROM PUBLIC;
REVOKE ALL ON FUNCTION confirm_code_delivery(uuid,delivery_confirmation_method_enum) FROM PUBLIC;
REVOKE ALL ON FUNCTION create_compensation_session(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION issue_attempt_exception(uuid,int,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION adjust_wallet(uuid,numeric,text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION redeem_code(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION consume_attempt(uuid,uuid,download_attempt_type_enum) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION confirm_code_delivery(uuid,delivery_confirmation_method_enum) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION create_compensation_session(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION issue_attempt_exception(uuid,int,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION adjust_wallet(uuid,numeric,text) TO authenticated, service_role;