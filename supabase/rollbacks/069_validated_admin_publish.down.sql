-- Rollback for 069_validated_admin_publish.sql

DROP TRIGGER IF EXISTS trg_products_block_direct_publish ON public.products;
DROP FUNCTION IF EXISTS public.block_direct_product_publish();

REVOKE ALL ON FUNCTION public.admin_publish_product(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
DROP FUNCTION IF EXISTS public.admin_publish_product(uuid);

REVOKE ALL ON FUNCTION public.is_seller_profile_approved(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
DROP FUNCTION IF EXISTS public.is_seller_profile_approved(uuid);

-- Restore the narrower 066 defence if only 069 is rolled back.
CREATE OR REPLACE FUNCTION public.block_suspend_only_product_publish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF public.staff_has('product.suspend')
     AND NOT (public.is_admin_or_above() OR public.is_super_admin()) THEN
    IF NEW.status = 'published' THEN
      RAISE EXCEPTION 'product_publish_forbidden' USING ERRCODE = '42501';
    END IF;
    IF NEW.published_at IS DISTINCT FROM OLD.published_at THEN
      RAISE EXCEPTION 'product_publish_forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_block_staff_publish ON public.products;
CREATE TRIGGER trg_products_block_staff_publish
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.block_suspend_only_product_publish();
