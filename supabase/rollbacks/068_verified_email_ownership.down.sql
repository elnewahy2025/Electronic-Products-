-- Rollback for 068_verified_email_ownership.sql
-- Restores the pre-068 unverified-email ownership semantics. Policies, views
-- and RPCs keep calling verified_email_owns(), so redefining that helper is
-- enough to restore the old behaviour without rewriting every object.

BEGIN;

DROP TRIGGER IF EXISTS on_auth_user_email_verified ON auth.users;
DROP FUNCTION IF EXISTS public.sync_auth_user_email_verification();

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_raw_type text;
  v_account_type account_type_enum;
  v_full_name text;
  v_phone text;
BEGIN
  v_raw_type := COALESCE(NEW.raw_user_meta_data->>'account_type', 'buyer');
  IF v_raw_type = 'seller' THEN
    v_account_type := 'seller';
  ELSE
    v_account_type := 'buyer';
  END IF;

  v_full_name := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'full_name', '')), '');
  v_phone := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'phone', '')), '');

  INSERT INTO public.profiles (id, email, full_name, phone, account_type, status)
  VALUES (NEW.id, NEW.email, v_full_name, v_phone, v_account_type, 'active')
  ON CONFLICT (id) DO NOTHING;

  IF v_account_type = 'seller' THEN
    INSERT INTO public.seller_profiles (profile_id, display_name, status)
    VALUES (NEW.id, COALESCE(v_full_name, split_part(NEW.email::text, '@', 1)), 'pending')
    ON CONFLICT (profile_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.verified_email_owns(p_email text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL
     AND auth.email() IS NOT NULL
     AND nullif(btrim(p_email), '') IS NOT NULL
     AND lower(auth.email()) = lower(btrim(p_email));
$$;

REVOKE SELECT (id, buyer_id, customer_email, customer_phone, status,
  total_amount, currency, exchange_rate_at_purchase, amount_in_usd,
  cancelled_by, cancel_reason, cancelled_at, created_at, updated_at,
  notes, full_name) ON public.purchase_requests FROM authenticated;
GRANT SELECT ON public.purchase_requests TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.purchase_request_forensics(uuid) FROM PUBLIC, anon, authenticated, service_role;
DROP FUNCTION IF EXISTS public.purchase_request_forensics(uuid);

COMMIT;
