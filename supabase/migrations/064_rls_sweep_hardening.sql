-- ============================================================
-- 064_rls_sweep_hardening.sql
-- Full RLS sweep remediation across owner-writable tables:
--   1. file_versions: drop FOR ALL write policy; revoke client writes
--      (prevents sellers from flipping scan_status='ready' on quarantined files).
--   2. file_previews: drop FOR ALL write policy; revoke client writes
--      (prevents forging status='ready', watermark_applied, or public_url).
--   3. upload_sessions: replace FOR ALL with SELECT-only; revoke client writes
--      (all legitimate writes use service_role in upload-service.ts).
--   4. seller_drive_accounts: drop direct INSERT policy; revoke INSERT.
--   5. product_version_files: require owned + scan_status='ready' file_version
--      on INSERT; block changing product_version_id/file_version_id on UPDATE.
--   6. product_versions: require draft + NULL published_at on INSERT; block
--      direct status/published_at/version_number/product_id mutations on UPDATE.
--   7. products: require draft + NULL moderation/publish fields on INSERT;
--      add BEFORE UPDATE trigger protecting moderation/status fields (exempting
--      service_role, SECURITY DEFINER RPCs, admins, and staff_has('product.suspend'));
--      harden publish_product_version() against suspended/rejected sellers & products;
--      add SECURITY DEFINER reopen_product() RPC for safe seller reopen.
-- ============================================================

-- ── 1. file_versions: server/service_role writes only ───────
DROP POLICY IF EXISTS file_versions_write ON public.file_versions;
REVOKE INSERT, UPDATE, DELETE ON public.file_versions FROM authenticated, anon;

-- ── 2. file_previews: server/service_role writes only ───────
DROP POLICY IF EXISTS previews_write ON public.file_previews;
REVOKE INSERT, UPDATE, DELETE ON public.file_previews FROM authenticated, anon;

-- ── 3. upload_sessions: SELECT-only for owners, server writes only ──
DROP POLICY IF EXISTS upload_sessions_owner ON public.upload_sessions;
DROP POLICY IF EXISTS upload_sessions_read ON public.upload_sessions;
CREATE POLICY upload_sessions_read ON public.upload_sessions FOR SELECT
  USING (seller_id = auth.uid() OR is_super_admin());
REVOKE INSERT, UPDATE, DELETE ON public.upload_sessions FROM authenticated, anon;

-- ── 4. seller_drive_accounts: revoke direct client INSERT ───
DROP POLICY IF EXISTS drive_accounts_insert_self ON public.seller_drive_accounts;
REVOKE INSERT ON public.seller_drive_accounts FROM authenticated, anon;

-- ── 5. product_version_files: prevent cross-seller IDOR & quarantine bypass ──
DROP POLICY IF EXISTS pvf_write ON public.product_version_files;
DROP POLICY IF EXISTS pvf_insert ON public.product_version_files;
DROP POLICY IF EXISTS pvf_update ON public.product_version_files;
DROP POLICY IF EXISTS pvf_delete ON public.product_version_files;

CREATE POLICY pvf_insert ON public.product_version_files FOR INSERT
  WITH CHECK (
    public.seller_owns_product(
      (SELECT product_id FROM public.product_versions WHERE id = product_version_files.product_version_id)
    )
    AND EXISTS (
      SELECT 1
      FROM public.file_versions fv
      JOIN public.files f ON f.id = fv.file_id
      WHERE fv.id = product_version_files.file_version_id
        AND f.seller_id = auth.uid()
        AND fv.scan_status = 'ready'
    )
  );

CREATE POLICY pvf_update ON public.product_version_files FOR UPDATE
  USING (
    public.seller_owns_product(
      (SELECT product_id FROM public.product_versions WHERE id = product_version_files.product_version_id)
    )
  )
  WITH CHECK (
    public.seller_owns_product(
      (SELECT product_id FROM public.product_versions WHERE id = product_version_files.product_version_id)
    )
  );

CREATE POLICY pvf_delete ON public.product_version_files FOR DELETE
  USING (
    public.seller_owns_product(
      (SELECT product_id FROM public.product_versions WHERE id = product_version_files.product_version_id)
    )
  );

CREATE OR REPLACE FUNCTION public.protect_pvf_immutable_refs()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public AS $$
BEGIN
  IF current_user IN ('postgres', 'supabase_admin', 'service_role')
     OR current_setting('role', true) = 'service_role'
     OR public.is_admin_or_above()
     OR public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.product_version_id IS DISTINCT FROM OLD.product_version_id
     OR NEW.file_version_id IS DISTINCT FROM OLD.file_version_id THEN
    RAISE EXCEPTION 'pvf_immutable_refs_forbidden'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pvf_protect_refs ON public.product_version_files;
CREATE TRIGGER trg_pvf_protect_refs
  BEFORE UPDATE ON public.product_version_files
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_pvf_immutable_refs();

-- ── 6. product_versions: block direct status='published' bypass ──
DROP POLICY IF EXISTS product_versions_write ON public.product_versions;
DROP POLICY IF EXISTS product_versions_insert ON public.product_versions;
DROP POLICY IF EXISTS product_versions_update ON public.product_versions;
DROP POLICY IF EXISTS product_versions_delete ON public.product_versions;

CREATE POLICY product_versions_insert ON public.product_versions FOR INSERT
  WITH CHECK (
    public.seller_owns_product(product_id)
    AND status = 'draft'
    AND published_at IS NULL
  );

CREATE POLICY product_versions_update ON public.product_versions FOR UPDATE
  USING (public.seller_owns_product(product_id) OR public.is_admin_or_above())
  WITH CHECK (public.seller_owns_product(product_id) OR public.is_admin_or_above());

CREATE POLICY product_versions_delete ON public.product_versions FOR DELETE
  USING (
    (public.seller_owns_product(product_id) AND status = 'draft')
    OR public.is_admin_or_above()
  );

CREATE OR REPLACE FUNCTION public.protect_product_version_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public AS $$
DECLARE
  v_changed text[] := ARRAY[]::text[];
BEGIN
  IF current_user IN ('postgres', 'supabase_admin', 'service_role')
     OR current_setting('role', true) = 'service_role'
     OR public.is_admin_or_above()
     OR public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.product_id IS DISTINCT FROM OLD.product_id THEN
    v_changed := array_append(v_changed, 'product_id');
  END IF;
  IF NEW.version_number IS DISTINCT FROM OLD.version_number THEN
    v_changed := array_append(v_changed, 'version_number');
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_changed := array_append(v_changed, 'status');
  END IF;
  IF NEW.published_at IS DISTINCT FROM OLD.published_at THEN
    v_changed := array_append(v_changed, 'published_at');
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    v_changed := array_append(v_changed, 'created_at');
  END IF;

  IF array_length(v_changed, 1) > 0 THEN
    RAISE EXCEPTION 'product_version_fields_forbidden: %', array_to_string(v_changed, ', ')
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_versions_protect_fields ON public.product_versions;
CREATE TRIGGER trg_product_versions_protect_fields
  BEFORE UPDATE ON public.product_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_product_version_fields();

-- ── 7. products: protect moderation/status fields + harden publish/reopen ──
DROP POLICY IF EXISTS products_insert_seller ON public.products;
CREATE POLICY products_insert_seller ON public.products FOR INSERT
  WITH CHECK (
    seller_id = auth.uid()
    AND public.is_approved_seller()
    AND status = 'draft'
    AND rejection_reason IS NULL
    AND suspension_reason IS NULL
    AND published_at IS NULL
    AND deleted_at IS NULL
  );

CREATE OR REPLACE FUNCTION public.protect_product_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public AS $$
DECLARE
  v_privileged boolean;
  v_changed text[] := ARRAY[]::text[];
  v_is_soft_delete boolean;
BEGIN
  SELECT current_user IN ('postgres', 'supabase_admin', 'service_role')
      OR current_setting('role', true) = 'service_role'
      OR public.is_admin_or_above()
      OR public.is_super_admin()
      OR public.staff_has('product.suspend')
  INTO v_privileged;

  IF v_privileged THEN
    RETURN NEW;
  END IF;

  v_is_soft_delete :=
    OLD.status IN ('draft', 'published', 'paused')
    AND NEW.status = 'deleted';

  IF NEW.seller_id IS DISTINCT FROM OLD.seller_id THEN
    v_changed := array_append(v_changed, 'seller_id');
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT v_is_soft_delete THEN
    v_changed := array_append(v_changed, 'status');
  END IF;
  IF NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason THEN
    v_changed := array_append(v_changed, 'rejection_reason');
  END IF;
  IF NEW.suspension_reason IS DISTINCT FROM OLD.suspension_reason THEN
    v_changed := array_append(v_changed, 'suspension_reason');
  END IF;
  IF NEW.min_price_checked_at IS DISTINCT FROM OLD.min_price_checked_at THEN
    v_changed := array_append(v_changed, 'min_price_checked_at');
  END IF;
  IF NEW.published_at IS DISTINCT FROM OLD.published_at THEN
    v_changed := array_append(v_changed, 'published_at');
  END IF;
  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at AND NOT v_is_soft_delete THEN
    v_changed := array_append(v_changed, 'deleted_at');
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    v_changed := array_append(v_changed, 'created_at');
  END IF;

  IF array_length(v_changed, 1) > 0 THEN
    RAISE EXCEPTION 'product_fields_forbidden: %', array_to_string(v_changed, ', ')
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_protect_fields ON public.products;
CREATE TRIGGER trg_products_protect_fields
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_product_privileged_fields();

-- Harden publish_product_version: require approved seller + non-moderated product
CREATE OR REPLACE FUNCTION public.publish_product_version(p_version_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_version product_versions%ROWTYPE;
  v_product products%ROWTYPE;
  v_prev_version_id uuid;
BEGIN
  IF NOT public.is_approved_seller() THEN
    RAISE EXCEPTION 'seller_not_approved' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_version FROM product_versions WHERE id = p_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'version_not_found'; END IF;

  SELECT * INTO v_product FROM products WHERE id = v_version.product_id FOR UPDATE;
  IF v_product.seller_id <> auth.uid() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_product.status IN ('suspended', 'rejected', 'deleted')
     OR v_product.suspension_reason IS NOT NULL
     OR v_product.rejection_reason IS NOT NULL THEN
    RAISE EXCEPTION 'product_not_publishable' USING ERRCODE = '42501';
  END IF;

  PERFORM validate_version_publishable(p_version_id);

  SELECT id INTO v_prev_version_id
    FROM product_versions
    WHERE product_id = v_product.id AND status = 'published' AND id <> p_version_id
    LIMIT 1;

  -- Archive the previous published version (if any)
  UPDATE product_versions
    SET status = 'archived'
    WHERE product_id = v_product.id
      AND status = 'published'
      AND id <> p_version_id;

  UPDATE product_versions
    SET status = 'published', published_at = coalesce(published_at, now())
    WHERE id = p_version_id;

  -- Also ensure the product is published
  UPDATE products
    SET status = 'published',
        published_at = coalesce(published_at, now())
    WHERE id = v_product.id AND status <> 'published';

  PERFORM log_audit('product.published', 'products', v_product.id,
    jsonb_build_object('previous_version', v_prev_version_id),
    jsonb_build_object('published_version', p_version_id),
    NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION public.publish_product_version(uuid) TO authenticated, service_role;

-- Safe SECURITY DEFINER RPC for seller reopen (replaces direct client UPDATE)
CREATE OR REPLACE FUNCTION public.reopen_product(p_product_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_product products%ROWTYPE;
  v_pub_version_id uuid;
BEGIN
  IF NOT public.is_approved_seller() THEN
    RAISE EXCEPTION 'seller_not_approved' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_product FROM products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'product_not_found'; END IF;
  IF v_product.seller_id <> auth.uid() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_product.status <> 'paused' THEN
    RAISE EXCEPTION 'product_not_paused';
  END IF;

  IF v_product.suspension_reason IS NOT NULL OR v_product.rejection_reason IS NOT NULL THEN
    RAISE EXCEPTION 'product_suspended' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_pub_version_id
    FROM product_versions
    WHERE product_id = v_product.id AND status = 'published'
    LIMIT 1;

  IF v_pub_version_id IS NULL THEN
    RAISE EXCEPTION 'no_published_version';
  END IF;

  -- Re-verify that all files in the published version are still ready (not quarantined)
  PERFORM validate_version_publishable(v_pub_version_id);

  UPDATE products
    SET status = 'published',
        published_at = coalesce(published_at, now())
    WHERE id = v_product.id;

  PERFORM log_audit('product.reopened', 'products', v_product.id,
    jsonb_build_object('status', v_product.status),
    jsonb_build_object('status', 'published'),
    NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.reopen_product(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reopen_product(uuid) TO authenticated, service_role;
