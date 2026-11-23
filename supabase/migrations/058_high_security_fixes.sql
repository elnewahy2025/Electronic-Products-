-- ============================================================
-- 058_high_security_fixes.sql
-- HIGH #1: purchase_requests dedicated write permission + full field guards
-- HIGH #2 & #3: persistent PostgreSQL rate-limit store & atomic RPC
-- ============================================================

-- ------------------------------------------------------------
-- 1. Dedicated permission `request.update` (separate from read-only `request.read.any`)
-- ------------------------------------------------------------
INSERT INTO public.permissions (code, description)
VALUES ('request.update', 'Update purchase request details or cancel/reject status')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code = 'request.update'
WHERE r.code = 'super_admin'
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 2. Tighten `purchase_requests` UPDATE policy (remove read-only `request.read.any`)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS pr_update ON public.purchase_requests;
CREATE POLICY pr_update ON public.purchase_requests FOR UPDATE
  USING (
    (buyer_id = auth.uid() AND status IN ('created', 'pending'))
    OR staff_has('request.update')
    OR is_super_admin()
  )
  WITH CHECK (
    (buyer_id = auth.uid() AND status IN ('created', 'pending', 'cancelled'))
    OR staff_has('request.update')
    OR is_super_admin()
  );

-- ------------------------------------------------------------
-- 3. Guard EVERY sensitive column for ALL non-service-role/non-RPC callers
--    - Trusted SECURITY DEFINER RPCs run as table owner (postgres / supabase_admin)
--    - Service-role calls run as service_role
--    - Direct PostgREST callers (buyers, staff, admins) run as authenticated
--      and are ALWAYS checked by this trigger.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_purchase_request_update() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_can_staff_update boolean;
BEGIN
  -- Only service_role and SECURITY DEFINER RPCs (running as postgres/supabase_admin)
  -- may mutate financial/audit/approval fields directly.
  IF current_user IN ('service_role', 'postgres', 'supabase_admin')
     OR current_setting('role', true) = 'service_role'
  THEN
    RETURN NEW;
  END IF;

  -- Immutable financial, identity, token, and forensic columns for ALL direct callers
  -- (buyers AND staff/admins with request.update).
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.buyer_id IS DISTINCT FROM OLD.buyer_id
     OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.exchange_rate_at_purchase IS DISTINCT FROM OLD.exchange_rate_at_purchase
     OR NEW.amount_in_usd IS DISTINCT FROM OLD.amount_in_usd
     OR NEW.access_token_hash IS DISTINCT FROM OLD.access_token_hash
     OR NEW.ip IS DISTINCT FROM OLD.ip
     OR NEW.user_agent IS DISTINCT FROM OLD.user_agent
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'purchase_request_protected_field_change';
  END IF;

  v_can_staff_update := (staff_has('request.update') OR is_super_admin());

  IF v_can_staff_update THEN
    -- Approval must always go through approve_purchase_request() RPC so order,
    -- commission snapshot, purchase codes, and seller wallet are created atomically.
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved', 'completed') THEN
      RAISE EXCEPTION 'purchase_request_approval_must_use_rpc';
    END IF;
    RETURN NEW;
  END IF;

  -- Buyer path: can only edit non-sensitive contact/notes fields while created/pending,
  -- or cancel their own created/pending request.
  IF OLD.status NOT IN ('created', 'pending') THEN
    RAISE EXCEPTION 'purchase_request_status_change_forbidden';
  END IF;

  IF NEW.customer_email IS DISTINCT FROM OLD.customer_email THEN
    RAISE EXCEPTION 'purchase_request_protected_field_change';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status <> 'cancelled' THEN
      RAISE EXCEPTION 'purchase_request_status_change_forbidden';
    END IF;
    IF NEW.cancelled_by IS NOT NULL AND NEW.cancelled_by IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'purchase_request_protected_field_change';
    END IF;
  ELSE
    -- When not cancelling, buyers cannot forge cancellation metadata
    IF NEW.cancelled_by IS DISTINCT FROM OLD.cancelled_by
       OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at
       OR NEW.cancel_reason IS DISTINCT FROM OLD.cancel_reason
    THEN
      RAISE EXCEPTION 'purchase_request_protected_field_change';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_requests_update_guard ON public.purchase_requests;
CREATE TRIGGER trg_purchase_requests_update_guard
  BEFORE UPDATE ON public.purchase_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_request_update();

-- ------------------------------------------------------------
-- 4. Persistent PostgreSQL rate-limit store + atomic RPC
--    Used by server-side auth throttling (HIGH #2) and costly seller/Drive endpoints (HIGH #3).
--    Service-role only (no client access via PostgREST).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.api_rate_limit_hits (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scope text NOT NULL,
  bucket_key text NOT NULL,
  ip inet,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limit_hits_lookup
  ON public.api_rate_limit_hits (scope, bucket_key, created_at DESC);

ALTER TABLE public.api_rate_limit_hits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.api_rate_limit_hits FROM anon, authenticated, PUBLIC;

CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_scope text,
  p_bucket_key text,
  p_limit int,
  p_window_seconds int,
  p_ip inet DEFAULT NULL
)
RETURNS TABLE(allowed boolean, remaining int, retry_after_seconds int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_window_start timestamptz := v_now - make_interval(secs => GREATEST(1, p_window_seconds));
  v_count int;
  v_oldest timestamptz;
  v_retry int;
BEGIN
  IF p_limit <= 0 THEN
    RETURN QUERY SELECT false, 0, GREATEST(1, p_window_seconds);
    RETURN;
  END IF;

  -- Serialize concurrent checks on the same (scope, bucket_key)
  PERFORM pg_advisory_xact_lock(hashtext(p_scope || ':' || p_bucket_key));

  -- Opportunistic cleanup of stale rows (> 24h) for this bucket
  DELETE FROM public.api_rate_limit_hits
  WHERE scope = p_scope
    AND bucket_key = p_bucket_key
    AND created_at < v_now - interval '24 hours';

  SELECT COUNT(*)::int, MIN(created_at)
    INTO v_count, v_oldest
  FROM public.api_rate_limit_hits
  WHERE scope = p_scope
    AND bucket_key = p_bucket_key
    AND created_at >= v_window_start;

  IF v_count >= p_limit THEN
    v_retry := GREATEST(
      1,
      CEIL(EXTRACT(EPOCH FROM ((v_oldest + make_interval(secs => GREATEST(1, p_window_seconds))) - v_now)))::int
    );
    RETURN QUERY SELECT false, 0, v_retry;
    RETURN;
  END IF;

  INSERT INTO public.api_rate_limit_hits (scope, bucket_key, ip, created_at)
  VALUES (p_scope, p_bucket_key, p_ip, v_now);

  RETURN QUERY SELECT true, GREATEST(0, p_limit - v_count - 1), 0;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(text, text, int, int, inet) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, text, int, int, inet) TO service_role;
