-- Manual rollback for 063_protect_seller_profile_fields.sql
-- Kept outside supabase/migrations so it is never auto-applied as a forward migration.
-- WARNING: Rolling back re-opens seller self-approval; only use in an emergency and fix forward immediately.

DROP TRIGGER IF EXISTS trg_seller_profiles_protect_fields ON public.seller_profiles;
DROP FUNCTION IF EXISTS public.protect_seller_profile_privileged_fields();

DROP POLICY IF EXISTS seller_profiles_insert_self ON public.seller_profiles;
CREATE POLICY seller_profiles_insert_self ON public.seller_profiles FOR INSERT
  WITH CHECK (profile_id = auth.uid());

-- If already recorded in schema_migrations, also run:
--   supabase migration repair --status reverted 063
