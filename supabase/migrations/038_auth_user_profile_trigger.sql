-- ============================================================
-- 038_auth_user_profile_trigger.sql
-- Automatically create public.profiles (and pending seller_profiles)
-- whenever a new user signs up in auth.users
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_raw_type text;
  v_account_type account_type_enum;
  v_full_name text;
  v_phone text;
BEGIN
  -- Never allow self-registration as staff
  v_raw_type := COALESCE(NEW.raw_user_meta_data->>'account_type', 'buyer');
  IF v_raw_type = 'seller' THEN
    v_account_type := 'seller';
  ELSE
    v_account_type := 'buyer';
  END IF;

  v_full_name := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'full_name', '')), '');
  v_phone := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'phone', '')), '');

  INSERT INTO public.profiles (id, email, full_name, phone, account_type, status)
  VALUES (
    NEW.id,
    NEW.email,
    v_full_name,
    v_phone,
    v_account_type,
    'active'
  )
  ON CONFLICT (id) DO NOTHING;

  IF v_account_type = 'seller' THEN
    INSERT INTO public.seller_profiles (profile_id, display_name, status)
    VALUES (
      NEW.id,
      COALESCE(v_full_name, split_part(NEW.email, '@', 1)),
      'pending'
    )
    ON CONFLICT (profile_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- Backfill any existing auth.users missing a profile or pending seller_profile
INSERT INTO public.profiles (id, email, full_name, phone, account_type, status)
SELECT
  u.id,
  u.email,
  NULLIF(trim(COALESCE(u.raw_user_meta_data->>'full_name', '')), ''),
  NULLIF(trim(COALESCE(u.raw_user_meta_data->>'phone', '')), ''),
  CASE
    WHEN COALESCE(u.raw_user_meta_data->>'account_type', 'buyer') = 'seller' THEN 'seller'::account_type_enum
    ELSE 'buyer'::account_type_enum
  END,
  'active'
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

INSERT INTO public.seller_profiles (profile_id, display_name, status)
SELECT
  p.id,
  COALESCE(p.full_name, split_part(p.email::text, '@', 1)),
  'pending'
FROM public.profiles p
LEFT JOIN public.seller_profiles sp ON sp.profile_id = p.id
WHERE p.account_type = 'seller'
  AND sp.profile_id IS NULL;
