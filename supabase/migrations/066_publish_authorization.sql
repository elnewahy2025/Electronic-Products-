-- ============================================================
-- 066_publish_authorization.sql
-- Fix H-02: `product.suspend` (a moderation permission held by the
-- `staff` role) could publish products, both through
-- /api/admin/products/[id]/status and directly via PostgREST,
-- bypassing publish validation.
--
-- 1. Dedicated `product.publish` permission (admin/super only).
-- 2. Trigger defence: staff whose only relevant permission is
--    `product.suspend` may not set status='published' or move
--    published_at, even through a direct table update.
-- ============================================================

INSERT INTO public.permissions (code, description)
VALUES ('product.publish', 'Publish or re-publish moderated products')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code = 'product.publish'
WHERE r.code IN ('super_admin', 'admin')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.block_suspend_only_product_publish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admins/super admins are the only roles allowed to publish. The
  -- `product.suspend` exemption in protect_product_privileged_fields()
  -- must not become a publish/approve path.
  IF public.staff_has('product.suspend')
     AND NOT (public.is_admin_or_above() OR public.is_super_admin())
  THEN
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
  FOR EACH ROW
  EXECUTE FUNCTION public.block_suspend_only_product_publish();
