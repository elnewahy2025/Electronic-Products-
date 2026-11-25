-- ============================================================================
-- 071_supabase_advisor_full_remediation.sql
-- Comprehensive remediation for Supabase Security Advisor & Performance Advisor:
--
-- Security Advisor:
--   1. Move `pg_trgm` and `citext` extensions out of `public` into `extensions`
--      (`0014_extension_in_public` + eliminates 78 extension mutable-search-path warnings).
--   2. Upgrade `log_audit` with explicit server-supplied `p_actor_id` fallback,
--      convert `trg_refresh_rating` and `block_session_revoke_after_delivery` to
--      `SECURITY DEFINER`, and lock down `EXECUTE` privileges across all `public`
--      `SECURITY DEFINER` and trigger functions (`service_role`-only for internal/
--      worker/wallet/email/backup/handoff/audit RPCs; `authenticated`-only for
--      signed-in RPCs; `anon` retained strictly on public storefront/RLS helpers).
--   3. Align base-table `SELECT` RLS policies (`orders`, `order_items`, `products`,
--      `seller_drive_accounts`), switch ALL 14 views in `public` to
--      `security_invoker = true` (`0010_security_definer_view`: 14 -> 0 Errors),
--      and tighten view table grants (revoke write grants & `anon` on private views).
--   4. Set immutable `search_path = public, extensions` on every custom function
--      in `public` (`0011_function_search_path_mutable`: -> 0 Warnings).
--   5. Drop broad `product_images_public_read` policy on `storage.objects` so
--      clients cannot enumerate the `product-images` bucket while public object
--      URLs continue serving normally (`0025_public_bucket_allows_listing`).
--   6. Add explicit deny-all client policies on the 6 server-only RLS tables
--      (`0008_rls_enabled_no_policy`: 6 -> 0 Info).
--
-- Performance Advisor:
--   7. Drop duplicate indexes (`idx_notifications_user_all`,
--      `idx_products_seller_published`) (`0009_duplicate_index`: 2 -> 0 Warnings).
--   8. Split `FOR ALL` write policies on tables that already define `FOR SELECT`
--      policies into explicit `INSERT` / `UPDATE` / `DELETE` policies, and drop
--      redundant `service_role` RLS checks (`0006_multiple_permissive_policies`: -> 0).
--   9. Wrap bare `auth.uid()`, `auth.role()`, `auth.jwt()`, and `auth.email()`
--      calls in `(select ...)` across all `public` RLS policies
--      (`0003_auth_rls_initplan`: -> 0 Warnings).
--  10. Create covering B-tree indexes on all unindexed foreign keys in `public`
--      (`0001_unindexed_foreign_keys`: -> 0 Info).
-- ============================================================================

-- ── 1. Move extensions from `public` to `extensions` ─────────────────────────
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'pg_trgm' AND n.nspname = 'public'
  ) THEN
    ALTER EXTENSION pg_trgm SET SCHEMA extensions;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'citext' AND n.nspname = 'public'
  ) THEN
    ALTER EXTENSION citext SET SCHEMA extensions;
  END IF;
END $$;

-- ── 2. Upgrade `log_audit` + internal trigger helpers before privilege lock ──
DROP FUNCTION IF EXISTS public.log_audit(text, text, uuid, jsonb, jsonb, text, inet, text, uuid);

CREATE OR REPLACE FUNCTION public.log_audit(
  p_action text,
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL,
  p_before jsonb DEFAULT NULL,
  p_after jsonb DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_ip inet DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_request_id uuid DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_actor uuid;
  v_role text;
BEGIN
  v_actor := COALESCE(p_actor_id, auth.uid());
  IF v_actor IS NOT NULL THEN
    SELECT account_type::text INTO v_role FROM public.profiles WHERE id = v_actor;
  END IF;

  INSERT INTO public.audit_logs(
    actor_id, actor_role, action, entity_type, entity_id,
    before_value, after_value, reason, ip, user_agent, request_id
  ) VALUES (
    v_actor, v_role, p_action, p_entity_type, p_entity_id,
    p_before, p_after, p_reason, p_ip, p_user_agent, p_request_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_refresh_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM public.refresh_product_rating(COALESCE(NEW.product_id, OLD.product_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.block_session_revoke_after_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.status = 'revoked' AND OLD.status <> 'revoked' THEN
    IF public.session_has_started_delivery(OLD.id) THEN
      RAISE EXCEPTION 'session_revocation_blocked_after_delivery';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Helper for `products_read` so buyers who purchased a product still see its
-- title/slug in `buyer_codes_full` & `buyer_sessions_full` under `security_invoker = true`
-- even if the product was later unpublished/suspended, without RLS recursion.
CREATE OR REPLACE FUNCTION public.buyer_purchased_product(p_product_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    ELSE EXISTS (
      SELECT 1
      FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
      JOIN public.purchase_requests pr ON pr.id = o.purchase_request_id
      WHERE oi.product_id = p_product_id
        AND (
          pr.buyer_id = auth.uid()
          OR public.verified_email_owns(pr.customer_email::text)
        )
    )
  END;
$$;

-- ── 3. Align base-table `SELECT` RLS policies & convert ALL 14 views ─────────
DROP POLICY IF EXISTS orders_read ON public.orders;
CREATE POLICY orders_read ON public.orders
  FOR SELECT TO authenticated
  USING (
    (buyer_id = (select auth.uid()))
    OR public.buyer_owns_purchase(purchase_request_id)
    OR public.staff_has('request.read.any')
    OR public.is_admin_or_above()
  );

DROP POLICY IF EXISTS order_items_read ON public.order_items;
CREATE POLICY order_items_read ON public.order_items
  FOR SELECT TO authenticated
  USING (
    public.buyer_owns_order_item(id)
    OR public.staff_has('request.read.any')
    OR public.is_admin_or_above()
  );

DROP POLICY IF EXISTS products_read ON public.products;
CREATE POLICY products_read ON public.products
  FOR SELECT
  USING (
    (status = 'published'::product_status_enum)
    OR (seller_id = (select auth.uid()))
    OR public.buyer_purchased_product(id)
    OR public.staff_has('product.read.any')
    OR public.is_admin_or_above()
  );

DROP POLICY IF EXISTS drive_accounts_read ON public.seller_drive_accounts;
CREATE POLICY drive_accounts_read ON public.seller_drive_accounts
  FOR SELECT TO authenticated
  USING (
    (seller_id = (select auth.uid()))
    OR public.is_super_admin()
    OR public.is_admin_or_above()
    OR public.staff_has('seller.read')
  );

GRANT SELECT ON public.product_rating_stats TO anon, authenticated, service_role;

-- Switch all 14 public views to SECURITY INVOKER (`0010_security_definer_view` -> 0)
ALTER VIEW public.buyer_orders_view          SET (security_invoker = true);
ALTER VIEW public.buyer_codes_full           SET (security_invoker = true);
ALTER VIEW public.buyer_sessions_full        SET (security_invoker = true);
ALTER VIEW public.buyer_codes_view           SET (security_invoker = true);
ALTER VIEW public.buyer_compensation_view    SET (security_invoker = true);
ALTER VIEW public.files_safe                 SET (security_invoker = true);
ALTER VIEW public.file_versions_safe         SET (security_invoker = true);
ALTER VIEW public.seller_drive_accounts_safe SET (security_invoker = true);
ALTER VIEW public.upload_sessions_safe       SET (security_invoker = true);
ALTER VIEW public.seller_reviews_view        SET (security_invoker = true);
ALTER VIEW public.seller_public_view         SET (security_invoker = true);
ALTER VIEW public.storefront_categories      SET (security_invoker = true);
ALTER VIEW public.storefront_top_categories  SET (security_invoker = true);
ALTER VIEW public.storefront_products        SET (security_invoker = true);

-- Tighten view grants: strip default-privilege INSERT/UPDATE/DELETE/TRUNCATE and
-- revoke `anon` from all 10 authenticated-only buyer/seller views.
REVOKE ALL ON
  public.buyer_orders_view,
  public.buyer_codes_full,
  public.buyer_sessions_full,
  public.buyer_codes_view,
  public.buyer_compensation_view,
  public.files_safe,
  public.file_versions_safe,
  public.seller_drive_accounts_safe,
  public.upload_sessions_safe,
  public.seller_reviews_view,
  public.seller_public_view,
  public.storefront_categories,
  public.storefront_top_categories,
  public.storefront_products
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON
  public.buyer_orders_view,
  public.buyer_codes_full,
  public.buyer_sessions_full,
  public.buyer_codes_view,
  public.buyer_compensation_view,
  public.files_safe,
  public.file_versions_safe,
  public.seller_drive_accounts_safe,
  public.upload_sessions_safe,
  public.seller_reviews_view
TO authenticated, service_role;

GRANT SELECT ON
  public.seller_public_view,
  public.storefront_categories,
  public.storefront_top_categories,
  public.storefront_products
TO anon, authenticated, service_role;

-- ── 4. Immutable `search_path` + strict `EXECUTE` grants on `public` funcs ───
DO $$
DECLARE
  r record;
BEGIN
  -- 4A. Every custom function in `public` gets an immutable `search_path`
  FOR r IN
    SELECT p.oid::regprocedure AS fn_sig,
           p.proname,
           pg_get_function_identity_arguments(p.oid) AS args,
           p.prosecdef,
           (p.prorettype = 'trigger'::regtype) AS is_trg
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions', r.fn_sig);

    -- 4B. Trigger functions never need direct PostgREST EXECUTE by client roles
    IF r.is_trg THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.fn_sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.fn_sig);

    -- 4C. Internal / worker / service_role-only / SQL-internal functions
    ELSIF r.proname IN (
      'acquire_concurrency_lock',
      'release_concurrency_lock',
      'consume_rate_limit',
      'claim_scan_jobs',
      'complete_scan_pass',
      'quarantine_file',
      'claim_preview_jobs',
      'finalize_preview',
      'fail_preview',
      'pick_drive_account',
      'complete_upload_session',
      'register_drive_file',
      'update_drive_quota',
      'create_purchase_request',
      'credit_seller_wallet_for_order_item',
      'consume_plaintext_handoff',
      'claim_email_outbox',
      'enqueue_email',
      'mark_email_sent',
      'mark_email_failed',
      'start_backup_job',
      'complete_backup_job',
      'fail_backup_job',
      'record_backup_restore_evidence',
      'record_restore_verification',
      'is_backup_due',
      'is_restore_test_due',
      'notify_staff_with_permission',
      'check_redeem_rate_limit',
      'log_redeem_attempt',
      'claim_download_token',
      'register_download_token',
      'mark_download_token_completed',
      'expire_partial_session',
      'is_session_fully_delivered',
      'mark_session_completed',
      'record_successful_attempt',
      'refresh_product_rating',
      'resolve_effective_commission_rate',
      'validate_version_publishable',
      'session_has_started_delivery',
      'code_buyer_id',
      'code_is_delivered',
      'is_seller_profile_approved',
      'log_audit',
      'delete_review',
      'revoke_staff'
    )
    OR (r.proname = 'approve_purchase_request' AND r.args = 'p_request_id uuid')
    OR (r.proname = 'issue_replacement_code' AND r.args = 'p_original_code_id uuid, p_reason text')
    THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.fn_sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.fn_sig);

    -- 4D. Public storefront RPCs + RLS helpers referenced on public-readable tables
    ELSIF r.proname IN (
      'search_storefront',
      'track_purchase_by_token',
      'allowed_currencies',
      'min_product_price',
      'seller_review_stats',
      'normalize_arabic',
      'get_usd_rate',
      'is_admin_or_above',
      'is_super_admin',
      'staff_has',
      'seller_owns_product',
      'seller_owns_file',
      'buyer_purchased_product'
    ) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.fn_sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', r.fn_sig);

    -- 4E. All remaining business & ownership RPCs: `authenticated` + `service_role` only
    ELSE
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.fn_sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.fn_sig);
    END IF;
  END LOOP;
END $$;

-- Scope authenticated-only tables' policies that call authenticated-only helpers
-- (`buyer_owns_*`, `verified_email_owns`, `is_approved_seller`) to `authenticated`
-- so `anon` gets immediate zero-row RLS denial without invoking helper functions.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND roles = ARRAY['public']::name[]
      AND tablename IN (
        'code_delivery_attempts',
        'code_redemptions',
        'compensation_requests',
        'content_reports',
        'download_attempts',
        'download_deliveries',
        'download_sessions',
        'favorites',
        'file_versions',
        'files',
        'financial_transactions',
        'member_permissions',
        'notifications',
        'payments',
        'profiles',
        'purchase_codes',
        'purchase_request_items',
        'purchase_requests',
        'quarantine_records',
        'redeem_attempts',
        'scan_jobs',
        'seller_agreements',
        'seller_applications',
        'seller_commissions',
        'seller_drive_accounts',
        'seller_payouts',
        'seller_wallets',
        'store_members',
        'support_messages',
        'support_tickets',
        'upload_sessions'
      )
  LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I TO authenticated', r.policyname, r.tablename);
  END LOOP;
END $$;

-- ── 5. Storage: prevent public listing of `product-images` bucket ────────────
DROP POLICY IF EXISTS product_images_public_read ON storage.objects;

-- ── 6. Explicit deny policies on the 6 service-only RLS tables ───────────────
DO $$
DECLARE
  v_tbl text;
BEGIN
  FOREACH v_tbl IN ARRAY ARRAY[
    'api_concurrency_locks',
    'api_rate_limit_hits',
    'code_plaintext_handoff',
    'mfa_attempts',
    'mfa_enrollments',
    'purchase_request_attestations'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_tbl || '_no_client', v_tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
      v_tbl || '_no_client',
      v_tbl
    );
  END LOOP;
END $$;

-- ── 7. Drop duplicate indexes (`0009_duplicate_index`) ───────────────────────
DROP INDEX IF EXISTS public.idx_notifications_user_all;
DROP INDEX IF EXISTS public.idx_products_seller_published;

-- ── 8. Eliminate `Multiple Permissive Policies` (`0006`) ─────────────────────
-- `service_role` has `BYPASSRLS`, so `scan_jobs_service_write` and
-- `OR auth.role() = 'service_role'` on settings tables only caused duplicate
-- policy evaluation + per-row `auth.role()` init-plan warnings.
DROP POLICY IF EXISTS scan_jobs_service_write ON public.scan_jobs;

DO $$
DECLARE
  v_tbl text;
BEGIN
  FOREACH v_tbl IN ARRAY ARRAY[
    'attempt_exception_settings',
    'audit_settings',
    'backup_settings',
    'commission_settings',
    'compensation_settings',
    'download_settings',
    'general_settings',
    'payout_settings',
    'pricing_settings',
    'security_settings',
    'watermark_settings'
  ] LOOP
    EXECUTE format(
      'ALTER POLICY %I ON public.%I USING (public.is_admin_or_above())',
      v_tbl || '_read',
      v_tbl
    );
  END LOOP;
END $$;

-- Split every `FOR ALL` policy on tables that also have a `FOR SELECT` policy
-- into explicit `INSERT`, `UPDATE`, and `DELETE` policies.
DO $$
DECLARE
  r record;
  v_qual text;
  v_check text;
  v_roles text;
BEGIN
  FOR r IN
    SELECT p.tablename, p.policyname, p.roles, p.qual, p.with_check
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.cmd = 'ALL'
      AND EXISTS (
        SELECT 1
        FROM pg_policies s
        WHERE s.schemaname = 'public'
          AND s.tablename = p.tablename
          AND s.cmd = 'SELECT'
      )
  LOOP
    v_qual := COALESCE(r.qual, 'true');
    v_check := COALESCE(r.with_check, r.qual, 'true');
    SELECT string_agg(quote_ident(role_name), ', ')
      INTO v_roles
      FROM unnest(r.roles) AS role_name;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname || '_insert', r.tablename);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname || '_update', r.tablename);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname || '_delete', r.tablename);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO %s WITH CHECK (%s)',
      r.policyname || '_insert', r.tablename, v_roles, v_check
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO %s USING (%s) WITH CHECK (%s)',
      r.policyname || '_update', r.tablename, v_roles, v_qual, v_check
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO %s USING (%s)',
      r.policyname || '_delete', r.tablename, v_roles, v_qual
    );
  END LOOP;
END $$;

-- ── 9. Fix `Auth RLS Initialization Plan` (`0003_auth_rls_initplan`) ─────────
-- Rewrite bare `auth.uid()`, `auth.role()`, `auth.jwt()`, and `auth.email()` in
-- all `public` RLS policies into `(select auth.<fn>())` so PostgreSQL evaluates
-- them once per statement as an InitPlan instead of once per scanned row.
DO $$
DECLARE
  r record;
  v_new_qual text;
  v_new_check text;
  v_sql text;
BEGIN
  FOR r IN
    SELECT tablename, policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        qual ~ 'auth\.(uid|role|jwt|email)\(\)'
        OR with_check ~ 'auth\.(uid|role|jwt|email)\(\)'
      )
  LOOP
    v_new_qual := r.qual;
    v_new_check := r.with_check;

    IF v_new_qual IS NOT NULL THEN
      -- Protect already-wrapped `(select auth.fn())` / `( SELECT auth.fn() AS uid)` first
      v_new_qual := regexp_replace(
        v_new_qual,
        '\(\s*select\s+auth\.(uid|role|jwt|email)\(\)(?:\s+as\s+\w+)?\s*\)',
        '__INITPLAN_AUTH_\1__',
        'gi'
      );
      v_new_qual := regexp_replace(
        v_new_qual,
        'auth\.(uid|role|jwt|email)\(\)',
        '(select auth.\1())',
        'gi'
      );
      v_new_qual := regexp_replace(
        v_new_qual,
        '__INITPLAN_AUTH_(uid|role|jwt|email)__',
        '(select auth.\1())',
        'gi'
      );
    END IF;

    IF v_new_check IS NOT NULL THEN
      v_new_check := regexp_replace(
        v_new_check,
        '\(\s*select\s+auth\.(uid|role|jwt|email)\(\)(?:\s+as\s+\w+)?\s*\)',
        '__INITPLAN_AUTH_\1__',
        'gi'
      );
      v_new_check := regexp_replace(
        v_new_check,
        'auth\.(uid|role|jwt|email)\(\)',
        '(select auth.\1())',
        'gi'
      );
      v_new_check := regexp_replace(
        v_new_check,
        '__INITPLAN_AUTH_(uid|role|jwt|email)__',
        '(select auth.\1())',
        'gi'
      );
    END IF;

    IF v_new_qual IS DISTINCT FROM r.qual OR v_new_check IS DISTINCT FROM r.with_check THEN
      v_sql := format('ALTER POLICY %I ON public.%I', r.policyname, r.tablename);
      IF v_new_qual IS NOT NULL AND r.cmd <> 'INSERT' THEN
        v_sql := v_sql || format(' USING (%s)', v_new_qual);
      END IF;
      IF v_new_check IS NOT NULL AND r.cmd IN ('INSERT', 'UPDATE', 'ALL') THEN
        v_sql := v_sql || format(' WITH CHECK (%s)', v_new_check);
      END IF;
      EXECUTE v_sql;
    END IF;
  END LOOP;
END $$;

-- ── 10. Create covering B-tree indexes for all unindexed FKs in `public` ─────
DO $$
DECLARE
  r record;
  v_idx_name text;
BEGIN
  FOR r IN
    SELECT
      c.conrelid::regclass AS tbl_reg,
      rel.relname AS tbl_name,
      c.conname AS fk_name,
      (
        SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY k.ord)
        FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
      ) AS idx_cols
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    JOIN pg_class rel ON rel.oid = c.conrelid
    WHERE n.nspname = 'public'
      AND c.contype = 'f'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_index i
        WHERE i.indrelid = c.conrelid
          AND i.indpred IS NULL
          AND i.indisvalid
          AND (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] = c.conkey
      )
    ORDER BY rel.relname, c.conname
  LOOP
    v_idx_name := left('idx_fk_' || r.fk_name, 54) || '_' || substr(md5(r.tbl_name || '.' || r.fk_name), 1, 8);
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %s (%s)',
      v_idx_name,
      r.tbl_reg,
      r.idx_cols
    );
  END LOOP;
END $$;
