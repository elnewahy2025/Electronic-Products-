-- ============================================================================
-- Rollback for 071_supabase_advisor_full_remediation.sql
-- ============================================================================

-- 1. Drop auto-created FK indexes from 071
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname LIKE 'idx_fk_%'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', r.indexname);
  END LOOP;
END $$;

-- 2. Restore dropped duplicate indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_all
  ON public.notifications USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_seller_published
  ON public.products USING btree (seller_id, status);

-- 3. Remove explicit no-client policies on the 6 service-only tables
DROP POLICY IF EXISTS api_concurrency_locks_no_client ON public.api_concurrency_locks;
DROP POLICY IF EXISTS api_rate_limit_hits_no_client ON public.api_rate_limit_hits;
DROP POLICY IF EXISTS code_plaintext_handoff_no_client ON public.code_plaintext_handoff;
DROP POLICY IF EXISTS mfa_attempts_no_client ON public.mfa_attempts;
DROP POLICY IF EXISTS mfa_enrollments_no_client ON public.mfa_enrollments;
DROP POLICY IF EXISTS purchase_request_attestations_no_client ON public.purchase_request_attestations;

-- 4. Restore `product_images_public_read` storage policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'product_images_public_read'
  ) THEN
    CREATE POLICY product_images_public_read
      ON storage.objects FOR SELECT
      USING (bucket_id = 'product-images');
  END IF;
END $$;

-- 5. Revert views to default security_invoker = false
ALTER VIEW public.buyer_orders_view          SET (security_invoker = false);
ALTER VIEW public.buyer_codes_full           SET (security_invoker = false);
ALTER VIEW public.buyer_sessions_full        SET (security_invoker = false);
ALTER VIEW public.buyer_codes_view           SET (security_invoker = false);
ALTER VIEW public.buyer_compensation_view    SET (security_invoker = false);
ALTER VIEW public.files_safe                 SET (security_invoker = false);
ALTER VIEW public.file_versions_safe         SET (security_invoker = false);
ALTER VIEW public.seller_drive_accounts_safe SET (security_invoker = false);
ALTER VIEW public.upload_sessions_safe       SET (security_invoker = false);
ALTER VIEW public.seller_reviews_view        SET (security_invoker = false);
ALTER VIEW public.seller_public_view         SET (security_invoker = false);
ALTER VIEW public.storefront_categories      SET (security_invoker = false);
ALTER VIEW public.storefront_top_categories  SET (security_invoker = false);
ALTER VIEW public.storefront_products        SET (security_invoker = false);
