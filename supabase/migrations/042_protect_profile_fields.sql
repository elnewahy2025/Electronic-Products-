-- ============================================================
-- 042_protect_profile_fields.sql
-- Fix H1: profiles_self_update allows any authenticated user to
-- rewrite any column of their own profile via PostgREST. That lets a
-- buyer set status='active' after suspension, set mfa_enforced=false,
-- forge email_verified_at / mfa_secret_encrypted, or flip account_type
-- to 'seller' / 'staff'.
--
-- RLS cannot restrict individual columns, so enforce a deny-list of
-- privileged fields with a BEFORE UPDATE trigger (the fields called out
-- in docs/08-rls-matrix.md, plus identity/timestamp columns). Admins,
-- service-role callers and SECURITY DEFINER RPCs (which run as postgres)
-- keep full access, so seller approval / staff invite / revoke flows
-- still work.
--
-- A normal user may still change: full_name, phone, avatar_url (the
-- fields the account profile API writes), and updated_at (set by the
-- existing trigger). MFA enrollment is privileged because it persists
-- the encrypted secret and controls the post-login challenge.
-- ============================================================

CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public AS $$
DECLARE
  v_privileged boolean;
  v_changed text[] := ARRAY[]::text[];
BEGIN
  -- SECURITY DEFINER RPCs and the server-side service client run as
  -- postgres/service_role; admins are trusted via their JWT claims.
  SELECT current_user IN ('postgres', 'service_role')
      OR public.is_admin_or_above()
      OR public.is_super_admin()
      OR public.staff_has('staff.user.write')
  INTO v_privileged;

  IF v_privileged THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN
    v_changed := array_append(v_changed, 'id');
  END IF;
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    v_changed := array_append(v_changed, 'email');
  END IF;
  IF NEW.email_verified_at IS DISTINCT FROM OLD.email_verified_at THEN
    v_changed := array_append(v_changed, 'email_verified_at');
  END IF;
  IF NEW.auth_provider IS DISTINCT FROM OLD.auth_provider THEN
    v_changed := array_append(v_changed, 'auth_provider');
  END IF;
  IF NEW.account_type IS DISTINCT FROM OLD.account_type THEN
    v_changed := array_append(v_changed, 'account_type');
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_changed := array_append(v_changed, 'status');
  END IF;
  IF NEW.mfa_enforced IS DISTINCT FROM OLD.mfa_enforced THEN
    v_changed := array_append(v_changed, 'mfa_enforced');
  END IF;
  -- Enrollment/disable now happens exclusively through the MFA API,
  -- which writes with the service-role client. Protecting this flag
  -- stops a user from switching the post-login challenge off.
  IF NEW.mfa_enabled IS DISTINCT FROM OLD.mfa_enabled THEN
    v_changed := array_append(v_changed, 'mfa_enabled');
  END IF;
  IF NEW.mfa_secret_encrypted IS DISTINCT FROM OLD.mfa_secret_encrypted THEN
    v_changed := array_append(v_changed, 'mfa_secret_encrypted');
  END IF;
  IF NEW.last_login_at IS DISTINCT FROM OLD.last_login_at THEN
    v_changed := array_append(v_changed, 'last_login_at');
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    v_changed := array_append(v_changed, 'created_at');
  END IF;

  IF array_length(v_changed, 1) > 0 THEN
    RAISE EXCEPTION 'profile_fields_forbidden: %', array_to_string(v_changed, ', ')
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_protect_fields ON public.profiles;
CREATE TRIGGER trg_profiles_protect_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_privileged_fields();
