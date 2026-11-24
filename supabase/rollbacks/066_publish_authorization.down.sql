-- ============================================================
-- Rollback for 066_publish_authorization.sql
-- Removes the publish trigger and the dedicated permission.
-- ============================================================

DROP TRIGGER IF EXISTS trg_products_block_staff_publish ON public.products;
DROP FUNCTION IF EXISTS public.block_suspend_only_product_publish();

DELETE FROM public.role_permissions
WHERE permission_id IN (SELECT id FROM public.permissions WHERE code = 'product.publish');

DELETE FROM public.permissions WHERE code = 'product.publish';
