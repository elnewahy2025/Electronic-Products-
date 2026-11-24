-- ============================================================
-- 069_validated_admin_publish.sql
-- H-02 follow-up: every products.status='published' transition must pass
-- publish validation. Direct client UPDATEs are blocked; admin publishes go
-- through admin_publish_product(); seller publish/reopen RPCs remain
-- definer-owned and keep working.
-- ============================================================

BEGIN;

-- UUID overload: the existing is_approved_seller() only checks auth.uid().
CREATE OR REPLACE FUNCTION public.is_seller_profile_approved(p_seller_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT sp.status = 'approved'
       FROM public.seller_profiles sp
      WHERE sp.profile_id = p_seller_id),
    false
  )
$$;

REVOKE ALL ON FUNCTION public.is_seller_profile_approved(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- Validated admin publish. auth.uid() stays the JWT subject inside the
-- SECURITY DEFINER function, so the permission check and audit see the actor.
CREATE OR REPLACE FUNCTION public.admin_publish_product(p_product_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_product public.products%ROWTYPE;
  v_version_id uuid;
  v_before jsonb;
  v_now timestamptz := now();
BEGIN
  IF NOT public.is_active_user()
     OR coalesce(public.current_account_type(), '') <> 'staff'
     OR NOT public.staff_has('product.publish') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_product FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_product.status = 'deleted' OR v_product.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'product_not_publishable' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_seller_profile_approved(v_product.seller_id) THEN
    RAISE EXCEPTION 'seller_not_approved' USING ERRCODE = '42501';
  END IF;

  SELECT pv.id INTO v_version_id
    FROM public.product_versions pv
   WHERE pv.product_id = v_product.id
     AND pv.status = 'published'
   LIMIT 1;
  IF v_version_id IS NULL THEN
    RAISE EXCEPTION 'no_published_version';
  END IF;

  -- Rejects version_has_no_files and version_has_unready_files.
  PERFORM public.validate_version_publishable(v_version_id);

  v_before := jsonb_build_object(
    'status', v_product.status,
    'published_at', v_product.published_at,
    'suspension_reason', v_product.suspension_reason,
    'rejection_reason', v_product.rejection_reason
  );

  UPDATE public.products
     SET status = 'published',
         published_at = v_now,
         suspension_reason = NULL,
         rejection_reason = NULL
   WHERE id = v_product.id;

  PERFORM public.log_audit(
    'product.published',
    'products',
    v_product.id,
    v_before,
    jsonb_build_object(
      'status', 'published',
      'published_at', v_now,
      'published_version', v_version_id
    ),
    'admin_publish'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_publish_product(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.admin_publish_product(uuid) TO authenticated;

-- Replace 066's narrow staff-only trigger. This function is deliberately
-- SECURITY INVOKER: making it DEFINER would exempt every direct UPDATE.
DROP TRIGGER IF EXISTS trg_products_block_staff_publish ON public.products;
DROP FUNCTION IF EXISTS public.block_suspend_only_product_publish();

CREATE OR REPLACE FUNCTION public.block_direct_product_publish()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public AS $$
BEGIN
  -- Definer RPCs (publish_product_version, reopen_product, admin_publish_product)
  -- run as their owner; service_role/owner writes are allowed by design.
  IF current_user IN ('postgres', 'supabase_admin', 'service_role')
     OR current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF (OLD.status IS DISTINCT FROM 'published' AND NEW.status = 'published')
     OR (NEW.status = 'published' AND (
          NEW.suspension_reason IS DISTINCT FROM OLD.suspension_reason OR
          NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
        ))
     OR NEW.published_at IS DISTINCT FROM OLD.published_at THEN
    RAISE EXCEPTION 'product_publish_forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_block_direct_publish ON public.products;
CREATE TRIGGER trg_products_block_direct_publish
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.block_direct_product_publish();

COMMIT;
