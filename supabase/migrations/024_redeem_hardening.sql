-- ============================================================
-- 024_redeem_hardening.sql
-- Rate limiting + audit trail + defense in depth
-- ============================================================

-- ------------------------------------------------------------
-- Audit trail for all redeem attempts
-- ------------------------------------------------------------
CREATE TABLE redeem_attempts (
  id bigserial PRIMARY KEY,
  ip inet,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  email citext,
  code_hash_prefix text,         -- first 8 hex chars of HMAC-SHA256 hash
  result text NOT NULL,          -- success|not_found|expired|revoked|already_redeemed|not_delivered|forbidden|rate_limited|error
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_redeem_attempts_ip_time ON redeem_attempts(ip, created_at DESC);
CREATE INDEX idx_redeem_attempts_user_time ON redeem_attempts(user_id, created_at DESC);
CREATE INDEX idx_redeem_attempts_email_time ON redeem_attempts(email, created_at DESC);
CREATE INDEX idx_redeem_attempts_result_time ON redeem_attempts(result, created_at DESC);

ALTER TABLE redeem_attempts ENABLE ROW LEVEL SECURITY;

-- Only super_admin can read the audit log (via UI)
CREATE POLICY redeem_attempts_super_read ON redeem_attempts FOR SELECT
  USING (is_super_admin());

-- No INSERT/UPDATE/DELETE policies → only service_role bypasses RLS

-- ------------------------------------------------------------
-- Rate limit check (called via service_role)
-- Only failed attempts count against the limit; success resets the pressure
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_redeem_rate_limit(
  p_ip inet,
  p_user_id uuid
) RETURNS TABLE (
  allowed boolean,
  retry_after_seconds int,
  reason text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_fail int;
  v_user_last timestamptz;
  v_ip_fail int;
  v_ip_last timestamptz;
BEGIN
  -- Per user: 5 failures / 15 min
  IF p_user_id IS NOT NULL THEN
    SELECT COUNT(*), MAX(created_at)
      INTO v_user_fail, v_user_last
      FROM redeem_attempts
      WHERE user_id = p_user_id
        AND result <> 'success'
        AND result <> 'rate_limited'  -- don't count rate-limit rejections themselves
        AND created_at > now() - interval '15 minutes';

    IF v_user_fail >= 5 THEN
      RETURN QUERY SELECT
        false,
        GREATEST(60, CEIL(EXTRACT(EPOCH FROM (v_user_last + interval '15 minutes' - now())))::int),
        'user_rate_limited';
      RETURN;
    END IF;
  END IF;

  -- Per IP: 15 failures / 15 min
  IF p_ip IS NOT NULL THEN
    SELECT COUNT(*), MAX(created_at)
      INTO v_ip_fail, v_ip_last
      FROM redeem_attempts
      WHERE ip = p_ip
        AND result <> 'success'
        AND result <> 'rate_limited'
        AND created_at > now() - interval '15 minutes';

    IF v_ip_fail >= 15 THEN
      RETURN QUERY SELECT
        false,
        GREATEST(60, CEIL(EXTRACT(EPOCH FROM (v_ip_last + interval '15 minutes' - now())))::int),
        'ip_rate_limited';
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT true, 0, NULL::text;
END;
$$;

-- ------------------------------------------------------------
-- Log a redeem attempt (service_role only)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION log_redeem_attempt(
  p_ip inet,
  p_user_id uuid,
  p_email citext,
  p_result text,
  p_code_hash_prefix text DEFAULT NULL,
  p_reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO redeem_attempts(ip, user_id, email, code_hash_prefix, result, reason)
    VALUES (p_ip, p_user_id, p_email, p_code_hash_prefix, p_result, p_reason);
END;
$$;

-- ------------------------------------------------------------
-- Harden redeem_code: ownership + delivery check
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION redeem_code(p_code_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_code purchase_codes%ROWTYPE;
  v_session_id uuid;
  v_duration int;
  v_owner_ok boolean;
BEGIN
  -- 1. Verify ownership (buyer_id or customer_email match)
  SELECT buyer_owns_code(p_code_id) INTO v_owner_ok;
  IF NOT v_owner_ok THEN
    RAISE EXCEPTION 'not_owner';
  END IF;

  -- 2. Lock the code row
  SELECT * INTO v_code FROM purchase_codes WHERE id = p_code_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'code_not_found';
  END IF;

  -- 3. Validate state
  IF v_code.status = 'revoked' THEN
    RAISE EXCEPTION 'code_revoked';
  END IF;
  IF v_code.delivered_at IS NULL THEN
    RAISE EXCEPTION 'code_not_delivered';
  END IF;
  IF v_code.expires_at < now() THEN
    RAISE EXCEPTION 'code_expired';
  END IF;
  IF EXISTS (SELECT 1 FROM code_redemptions WHERE code_id = p_code_id) THEN
    RAISE EXCEPTION 'code_already_redeemed';
  END IF;

  -- 4. Mark redeemed
  INSERT INTO code_redemptions(code_id, redeemed_by, redeemed_at)
    VALUES (p_code_id, auth.uid(), now());

  UPDATE purchase_codes
    SET status = 'redeemed', redeemed_at = now()
    WHERE id = p_code_id;

  -- 5. Create the download session
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

  UPDATE code_redemptions
    SET session_id = v_session_id
    WHERE code_id = p_code_id;

  PERFORM log_audit('code.redeemed', 'purchase_codes', p_code_id, NULL, NULL, NULL);
  PERFORM log_audit('session.created', 'download_sessions', v_session_id, NULL, NULL, NULL);

  RETURN v_session_id;
END;
$$;

-- ------------------------------------------------------------
-- Grants
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION check_redeem_rate_limit(inet, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION log_redeem_attempt(inet, uuid, citext, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION redeem_code(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION check_redeem_rate_limit(inet, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION log_redeem_attempt(inet, uuid, citext, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION redeem_code(uuid) TO authenticated, service_role;