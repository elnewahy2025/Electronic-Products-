-- ============================================================
-- 015_admin_operations.sql
-- Admin-level atomic operations
-- ============================================================

-- Revoke a code BEFORE delivery only
CREATE OR REPLACE FUNCTION revoke_code_before_delivery(
  p_code_id uuid,
  p_reason text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_code purchase_codes%ROWTYPE;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  SELECT * INTO v_code FROM purchase_codes WHERE id = p_code_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'code_not_found'; END IF;
  IF v_code.delivered_at IS NOT NULL THEN
    RAISE EXCEPTION 'code_revocation_blocked_after_delivery';
  END IF;
  IF v_code.status = 'redeemed' THEN
    RAISE EXCEPTION 'code_already_redeemed';
  END IF;

  UPDATE purchase_codes
    SET status = 'revoked',
        revoked_at = now(),
        revoked_by = auth.uid(),
        revoke_reason = p_reason
    WHERE id = p_code_id;

  PERFORM log_audit('code.revocation_confirmed', 'purchase_codes', p_code_id,
    jsonb_build_object('status', v_code.status),
    jsonb_build_object('status', 'revoked'), p_reason);
END;
$$;

-- Issue a replacement code for an expired/undelivered original
CREATE OR REPLACE FUNCTION issue_replacement_code(
  p_original_code_id uuid,
  p_reason text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_original purchase_codes%ROWTYPE;
  v_new_id uuid;
  v_hash text;
  v_prefix char(4);
  v_attempt int := 0;
  v_chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  v_pepper text;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  SELECT * INTO v_original FROM purchase_codes WHERE id = p_original_code_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'code_not_found'; END IF;

  -- Only allow for expired or revoked-without-delivery
  IF v_original.delivered_at IS NOT NULL AND v_original.status <> 'expired' THEN
    RAISE EXCEPTION 'replacement_not_allowed_for_delivered_active';
  END IF;
  IF v_original.status = 'redeemed' THEN
    RAISE EXCEPTION 'replacement_not_allowed_for_redeemed';
  END IF;

  -- Generate a unique code (retry on collision — should be near-impossible)
  LOOP
    v_attempt := v_attempt + 1;
    IF v_attempt > 10 THEN RAISE EXCEPTION 'code_generation_failed'; END IF;

    v_code := '';
    FOR i IN 1..16 LOOP
      v_code := v_code || substr(v_chars, floor(random() * length(v_chars))::int + 1, 1);
      IF i IN (4,8,12) THEN v_code := v_code || '-'; END IF;
    END LOOP;

    -- Hash using pepper from app_settings if available, else raw hash
    SELECT value FROM (SELECT COALESCE(NULLIF(current_setting('app.code_pepper', true), ''), 'default-pepper') AS value) s INTO v_pepper;
    v_hash := encode(hmac(v_code, v_pepper, 'sha256'), 'hex');
    v_prefix := substring(v_code from 1 for 4);

    BEGIN
      INSERT INTO purchase_codes(
        order_item_id, code_hash, code_prefix, status,
        issued_by, issued_at, expires_at,
        replacement_for_code_id, replacement_reason
      ) VALUES (
        v_original.order_item_id, v_hash, v_prefix, 'issued',
        auth.uid(), now(), now() + interval '72 hours',
        p_original_code_id, p_reason
      ) RETURNING id INTO v_new_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      -- retry
      CONTINUE;
    END;
  END LOOP;

  PERFORM log_audit('code.replacement_issued', 'purchase_codes', v_new_id,
    NULL,
    jsonb_build_object('original_code_id', p_original_code_id, 'reason', p_reason),
    p_reason);

  -- Return the plaintext code to caller through an out-of-band channel (audit is hashed only)
  -- The plaintext is only returned once here via a helper table
  INSERT INTO code_plaintext_handoff(code_id, plaintext, expires_at)
    VALUES (v_new_id, v_code, now() + interval '10 minutes');

  RETURN v_new_id;
END;
$$;

-- Ephemeral table for one-time plaintext handoff (auto-purged by cron)
CREATE TABLE IF NOT EXISTS code_plaintext_handoff (
  code_id uuid PRIMARY KEY REFERENCES purchase_codes(id) ON DELETE CASCADE,
  plaintext text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE code_plaintext_handoff ENABLE ROW LEVEL SECURITY;
-- No RLS policy → only service_role can touch it

-- Consume handoff (returns plaintext once, then deletes)
CREATE OR REPLACE FUNCTION consume_plaintext_handoff(p_code_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plain text;
BEGIN
  SELECT plaintext INTO v_plain FROM code_plaintext_handoff
    WHERE code_id = p_code_id AND consumed_at IS NULL AND expires_at > now()
    FOR UPDATE;

  IF v_plain IS NULL THEN
    RAISE EXCEPTION 'handoff_not_available';
  END IF;

  UPDATE code_plaintext_handoff SET consumed_at = now() WHERE code_id = p_code_id;
  DELETE FROM code_plaintext_handoff WHERE code_id = p_code_id;

  RETURN v_plain;
END;
$$;

-- Extend a session
CREATE OR REPLACE FUNCTION extend_session(
  p_session_id uuid,
  p_extra_hours int,
  p_reason text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_session download_sessions%ROWTYPE;
BEGIN
  IF p_extra_hours IS NULL OR p_extra_hours <= 0 THEN
    RAISE EXCEPTION 'invalid_extra_hours';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

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

-- Revoke a session BEFORE any delivery
CREATE OR REPLACE FUNCTION revoke_session_before_delivery(
  p_session_id uuid,
  p_reason text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_session download_sessions%ROWTYPE;
  v_has_delivery boolean;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  SELECT * INTO v_session FROM download_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;

  SELECT EXISTS (SELECT 1 FROM download_deliveries WHERE session_id = p_session_id) INTO v_has_delivery;
  IF v_has_delivery THEN
    RAISE EXCEPTION 'session_revocation_blocked_after_delivery';
  END IF;

  UPDATE download_sessions
    SET status = 'revoked',
        revoked_at = now(),
        revocation_confirmed_by = auth.uid(),
        revocation_reason = p_reason,
        ended_at = now()
    WHERE id = p_session_id;

  PERFORM log_audit('session.revocation_confirmed', 'download_sessions', p_session_id, NULL, NULL, p_reason);
END;
$$;

-- Approve compensation (creates the compensation session atomically)
-- Note: create_compensation_session already exists from migration 010, reused here
-- Reject compensation
CREATE OR REPLACE FUNCTION reject_compensation(
  p_request_id uuid,
  p_admin_reason text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_admin_reason IS NULL OR length(trim(p_admin_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  UPDATE compensation_requests
    SET status = 'rejected',
        admin_reason = p_admin_reason,
        decided_by = auth.uid(),
        decided_at = now()
    WHERE id = p_request_id AND status = 'pending';

  IF NOT FOUND THEN RAISE EXCEPTION 'compensation_not_pending'; END IF;

  PERFORM log_audit('compensation.rejected', 'compensation_requests', p_request_id, NULL, NULL, p_admin_reason);
END;
$$;

-- Approve seller
CREATE OR REPLACE FUNCTION approve_seller(p_seller_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_prev seller_status_enum;
BEGIN
  SELECT status INTO v_prev FROM seller_profiles WHERE profile_id = p_seller_id FOR UPDATE;
  IF v_prev IS NULL THEN RAISE EXCEPTION 'seller_not_found'; END IF;

  UPDATE seller_profiles
    SET status = 'approved',
        approved_by = auth.uid(),
        approved_at = now(),
        rejected_by = NULL, rejected_at = NULL, rejection_reason = NULL
    WHERE profile_id = p_seller_id;

  UPDATE profiles SET account_type = 'seller' WHERE id = p_seller_id AND account_type = 'buyer';

  -- Create wallet if absent
  INSERT INTO seller_wallets (seller_id, currency, balance)
    VALUES (p_seller_id, 'USD', 0)
    ON CONFLICT DO NOTHING;

  PERFORM log_audit('seller.approved', 'seller_profiles', p_seller_id,
    jsonb_build_object('status', v_prev), jsonb_build_object('status', 'approved'), NULL);
END;
$$;

-- Reject seller
CREATE OR REPLACE FUNCTION reject_seller(p_seller_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  UPDATE seller_profiles
    SET status = 'rejected',
        rejected_by = auth.uid(),
        rejected_at = now(),
        rejection_reason = p_reason
    WHERE profile_id = p_seller_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'seller_not_found'; END IF;

  PERFORM log_audit('seller.rejected', 'seller_profiles', p_seller_id, NULL, NULL, p_reason);
END;
$$;

-- Suspend seller
CREATE OR REPLACE FUNCTION suspend_seller(p_seller_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  UPDATE seller_profiles
    SET status = 'suspended',
        suspended_by = auth.uid(),
        suspended_at = now(),
        suspension_reason = p_reason
    WHERE profile_id = p_seller_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'seller_not_found'; END IF;

  -- Pause all published products
  UPDATE products SET status = 'paused', suspension_reason = p_reason
    WHERE seller_id = p_seller_id AND status = 'published';

  PERFORM log_audit('seller.suspended', 'seller_profiles', p_seller_id, NULL, NULL, p_reason);
END;
$$;

REVOKE ALL ON FUNCTION revoke_code_before_delivery(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION issue_replacement_code(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION consume_plaintext_handoff(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION extend_session(uuid,int,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_session_before_delivery(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION reject_compensation(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION approve_seller(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION reject_seller(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION suspend_seller(uuid,text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION revoke_code_before_delivery(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION issue_replacement_code(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION consume_plaintext_handoff(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION extend_session(uuid,int,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION revoke_session_before_delivery(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION reject_compensation(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION approve_seller(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION reject_seller(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION suspend_seller(uuid,text) TO authenticated, service_role;