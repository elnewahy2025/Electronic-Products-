-- ============================================================
-- 057_security_audit_rls_hardening.sql
-- Security Audit — Verification & Remediation Plan, Phase 1
-- ============================================================

-- ------------------------------------------------------------
-- 1. purchase_requests UPDATE guard
-- ------------------------------------------------------------
DROP POLICY IF EXISTS pr_update ON public.purchase_requests;
CREATE POLICY pr_update ON public.purchase_requests FOR UPDATE
  USING (
    (buyer_id = auth.uid() AND status IN ('created', 'pending'))
    OR staff_has('request.read.any')
    OR is_admin_or_above()
  )
  WITH CHECK (
    (buyer_id = auth.uid() AND status IN ('created', 'pending', 'cancelled'))
    OR staff_has('request.read.any')
    OR is_admin_or_above()
  );

-- Postgres has no column-level RLS, so a trigger enforces the field/lifecycle
-- boundary. Staff/admin and SECURITY DEFINER RPC paths are intentionally exempt.
CREATE OR REPLACE FUNCTION guard_purchase_request_update() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_is_buyer boolean := (
    auth.uid() IS NOT NULL
    AND current_setting('role', true) <> 'service_role'
    AND OLD.buyer_id = auth.uid()
    AND NOT is_admin_or_above()
    AND NOT staff_has('request.read.any')
  );
BEGIN
  IF NOT v_is_buyer THEN
    RETURN NEW;
  END IF;

  IF NEW.buyer_id IS DISTINCT FROM OLD.buyer_id
     OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.exchange_rate_at_purchase IS DISTINCT FROM OLD.exchange_rate_at_purchase
     OR NEW.amount_in_usd IS DISTINCT FROM OLD.amount_in_usd
     OR NEW.access_token_hash IS DISTINCT FROM OLD.access_token_hash
  THEN
    RAISE EXCEPTION 'purchase_request_protected_field_change';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (OLD.status IN ('created', 'pending') AND NEW.status = 'cancelled')
  THEN
    RAISE EXCEPTION 'purchase_request_status_change_forbidden';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_requests_update_guard ON public.purchase_requests;
CREATE TRIGGER trg_purchase_requests_update_guard
  BEFORE UPDATE ON public.purchase_requests
  FOR EACH ROW EXECUTE FUNCTION guard_purchase_request_update();

-- ------------------------------------------------------------
-- 2. support_messages INSERT and SELECT guards
-- ------------------------------------------------------------
DROP POLICY IF EXISTS support_msgs_insert ON public.support_messages;
CREATE POLICY support_msgs_insert ON public.support_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_messages.ticket_id
        AND (t.owner_id = auth.uid() OR staff_has('support.read') OR is_admin_or_above())
    )
    AND (
      support_messages.is_internal = false
      OR staff_has('support.read')
      OR is_admin_or_above()
    )
  );

DROP POLICY IF EXISTS support_msgs_read ON public.support_messages;
CREATE POLICY support_msgs_read ON public.support_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_messages.ticket_id
        AND (
          (t.owner_id = auth.uid() AND support_messages.is_internal = false)
          OR staff_has('support.read')
          OR is_admin_or_above()
        )
    )
  );

-- ------------------------------------------------------------
-- 3. profiles.mfa_secret_encrypted column protection
--    PostgreSQL column privileges are additive to table privileges,
--    so revoke table-level SELECT and grant only non-secret columns.
--    (server-side MFA helpers use the service-role client)
-- ------------------------------------------------------------
REVOKE SELECT ON public.profiles FROM authenticated, anon;
GRANT SELECT (
  id,
  auth_provider,
  email,
  email_verified_at,
  phone,
  full_name,
  avatar_url,
  account_type,
  status,
  mfa_enabled,
  mfa_enforced,
  last_login_at,
  created_at,
  updated_at
) ON public.profiles TO authenticated;

-- ------------------------------------------------------------
-- 4. seller_commissions SELECT RLS alignment
-- ------------------------------------------------------------
DROP POLICY IF EXISTS commissions_read ON public.seller_commissions;
CREATE POLICY commissions_read ON public.seller_commissions FOR SELECT
  USING (
    seller_id = auth.uid()
    OR is_super_admin()
    OR staff_has('commission.seller.override')
    OR staff_has('commission.manage')
  );

-- ------------------------------------------------------------
-- Supporting change for Phase 2 upload completion claim
-- ------------------------------------------------------------
ALTER TYPE public.upload_session_status_enum ADD VALUE IF NOT EXISTS 'completing';
