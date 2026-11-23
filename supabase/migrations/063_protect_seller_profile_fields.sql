-- ============================================================
-- 063_protect_seller_profile_fields.sql
-- Fix CRITICAL: seller_profiles_update_self (011) allowed a user to
-- rewrite privileged columns (including `status = 'approved'`) on
-- their own seller_profiles row via PostgREST, and
-- seller_profiles_insert_self did not constrain `status`.
--
-- Same pattern as 042_protect_profile_fields.sql & 058:
--   * BEFORE UPDATE trigger blocks changes to privileged columns for
--     ordinary users while exempting service_role, SECURITY DEFINER
--     RPCs (postgres/supabase_admin), admins, and staff with seller.*
--     permissions.
--   * INSERT policy requires status = 'pending' and NULL decision fields.
-- ============================================================

CREATE OR REPLACE FUNCTION public.protect_seller_profile_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public AS $$
DECLARE
  v_privileged boolean;
  v_changed text[] := ARRAY[]::text[];
BEGIN
  SELECT current_user IN ('postgres', 'supabase_admin', 'service_role')
      OR current_setting('role', true) = 'service_role'
      OR public.is_admin_or_above()
      OR public.is_super_admin()
      OR public.staff_has('seller.approve')
      OR public.staff_has('seller.reject')
      OR public.staff_has('seller.suspend')
  INTO v_privileged;

  IF v_privileged THEN
    RETURN NEW;
  END IF;

  IF NEW.profile_id IS DISTINCT FROM OLD.profile_id THEN
    v_changed := array_append(v_changed, 'profile_id');
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_changed := array_append(v_changed, 'status');
  END IF;
  IF NEW.approved_by IS DISTINCT FROM OLD.approved_by THEN
    v_changed := array_append(v_changed, 'approved_by');
  END IF;
  IF NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
    v_changed := array_append(v_changed, 'approved_at');
  END IF;
  IF NEW.rejected_by IS DISTINCT FROM OLD.rejected_by THEN
    v_changed := array_append(v_changed, 'rejected_by');
  END IF;
  IF NEW.rejected_at IS DISTINCT FROM OLD.rejected_at THEN
    v_changed := array_append(v_changed, 'rejected_at');
  END IF;
  IF NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason THEN
    v_changed := array_append(v_changed, 'rejection_reason');
  END IF;
  IF NEW.suspended_by IS DISTINCT FROM OLD.suspended_by THEN
    v_changed := array_append(v_changed, 'suspended_by');
  END IF;
  IF NEW.suspended_at IS DISTINCT FROM OLD.suspended_at THEN
    v_changed := array_append(v_changed, 'suspended_at');
  END IF;
  IF NEW.suspension_reason IS DISTINCT FROM OLD.suspension_reason THEN
    v_changed := array_append(v_changed, 'suspension_reason');
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    v_changed := array_append(v_changed, 'created_at');
  END IF;

  IF array_length(v_changed, 1) > 0 THEN
    RAISE EXCEPTION 'seller_profile_fields_forbidden: %', array_to_string(v_changed, ', ')
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seller_profiles_protect_fields ON public.seller_profiles;
CREATE TRIGGER trg_seller_profiles_protect_fields
  BEFORE UPDATE ON public.seller_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_seller_profile_privileged_fields();

DROP POLICY IF EXISTS seller_profiles_insert_self ON public.seller_profiles;
CREATE POLICY seller_profiles_insert_self ON public.seller_profiles FOR INSERT
  WITH CHECK (
    profile_id = auth.uid()
    AND status = 'pending'
    AND approved_by IS NULL AND approved_at IS NULL
    AND rejected_by IS NULL AND rejected_at IS NULL AND rejection_reason IS NULL
    AND suspended_by IS NULL AND suspended_at IS NULL AND suspension_reason IS NULL
  );
