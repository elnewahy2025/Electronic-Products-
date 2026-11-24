-- ============================================================
-- Rollback for 064_rls_sweep_hardening.sql
-- Manual use only (kept outside supabase/migrations/).
-- ============================================================

-- 7. products + reopen_product
REVOKE ALL ON FUNCTION public.reopen_product(uuid) FROM PUBLIC, authenticated, service_role;
DROP FUNCTION IF EXISTS public.reopen_product(uuid);

DROP TRIGGER IF EXISTS trg_products_protect_fields ON public.products;
DROP FUNCTION IF EXISTS public.protect_product_privileged_fields();

DROP POLICY IF EXISTS products_insert_seller ON public.products;
CREATE POLICY products_insert_seller ON public.products FOR INSERT
  WITH CHECK (seller_id = auth.uid() AND is_approved_seller());

-- 6. product_versions
DROP TRIGGER IF EXISTS trg_product_versions_protect_fields ON public.product_versions;
DROP FUNCTION IF EXISTS public.protect_product_version_fields();

DROP POLICY IF EXISTS product_versions_insert ON public.product_versions;
DROP POLICY IF EXISTS product_versions_update ON public.product_versions;
DROP POLICY IF EXISTS product_versions_delete ON public.product_versions;
CREATE POLICY product_versions_write ON public.product_versions FOR ALL
  USING (seller_owns_product(product_id))
  WITH CHECK (seller_owns_product(product_id));

-- 5. product_version_files
DROP TRIGGER IF EXISTS trg_pvf_protect_refs ON public.product_version_files;
DROP FUNCTION IF EXISTS public.protect_pvf_immutable_refs();

DROP POLICY IF EXISTS pvf_insert ON public.product_version_files;
DROP POLICY IF EXISTS pvf_update ON public.product_version_files;
DROP POLICY IF EXISTS pvf_delete ON public.product_version_files;
CREATE POLICY pvf_write ON public.product_version_files FOR ALL
  USING (seller_owns_product((SELECT product_id FROM public.product_versions WHERE id = product_version_files.product_version_id)))
  WITH CHECK (seller_owns_product((SELECT product_id FROM public.product_versions WHERE id = product_version_files.product_version_id)));

-- 4. seller_drive_accounts
GRANT INSERT ON public.seller_drive_accounts TO authenticated;
CREATE POLICY drive_accounts_insert_self ON public.seller_drive_accounts FOR INSERT
  WITH CHECK (seller_id = auth.uid());

-- 3. upload_sessions
GRANT INSERT, UPDATE, DELETE ON public.upload_sessions TO authenticated;
DROP POLICY IF EXISTS upload_sessions_read ON public.upload_sessions;
CREATE POLICY upload_sessions_owner ON public.upload_sessions FOR ALL
  USING (seller_id = auth.uid() OR is_super_admin())
  WITH CHECK (seller_id = auth.uid() OR is_super_admin());

-- 2. file_previews
GRANT INSERT, UPDATE, DELETE ON public.file_previews TO authenticated;
CREATE POLICY previews_write ON public.file_previews FOR ALL
  USING (seller_owns_file((SELECT file_id FROM public.file_versions WHERE id = file_previews.file_version_id)) OR is_admin_or_above())
  WITH CHECK (seller_owns_file((SELECT file_id FROM public.file_versions WHERE id = file_previews.file_version_id)) OR is_admin_or_above());

-- 1. file_versions
GRANT INSERT, UPDATE, DELETE ON public.file_versions TO authenticated;
CREATE POLICY file_versions_write ON public.file_versions FOR ALL
  USING (EXISTS (SELECT 1 FROM public.files f WHERE f.id = file_versions.file_id AND f.seller_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.files f WHERE f.id = file_versions.file_id AND f.seller_id = auth.uid()));
