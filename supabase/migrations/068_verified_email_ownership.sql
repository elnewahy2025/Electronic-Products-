-- ============================================================
-- 068_verified_email_ownership.sql
-- Fix H-08: an unverified JWT email must not grant ownership of guest
-- purchases. Auth is the authority for email verification, and every
-- email-based ownership path now requires a verified profile email.
-- Purchase-request forensic columns are hidden from browser roles.
-- ============================================================

BEGIN;

-- ── 1. Auth is authoritative for email + verification timestamp ──────────
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_raw_type text;
  v_account_type account_type_enum;
  v_full_name text;
  v_phone text;
BEGIN
  v_raw_type := COALESCE(NEW.raw_user_meta_data->>'account_type', 'buyer');
  IF v_raw_type = 'seller' THEN
    v_account_type := 'seller';
  ELSE
    v_account_type := 'buyer';
  END IF;

  v_full_name := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'full_name', '')), '');
  v_phone := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'phone', '')), '');

  INSERT INTO public.profiles
    (id, email, email_verified_at, full_name, phone, account_type, status)
  VALUES
    (NEW.id, NEW.email, NEW.email_confirmed_at, v_full_name, v_phone, v_account_type, 'active')
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        email_verified_at = EXCLUDED.email_verified_at;

  IF v_account_type = 'seller' THEN
    INSERT INTO public.seller_profiles (profile_id, display_name, status)
    VALUES (NEW.id, COALESCE(v_full_name, split_part(NEW.email::text, '@', 1)), 'pending')
    ON CONFLICT (profile_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_auth_user_email_verification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.profiles p
     SET email = NEW.email,
         email_verified_at = NEW.email_confirmed_at,
         updated_at = now()
   WHERE p.id = NEW.id
     AND (p.email IS DISTINCT FROM NEW.email
          OR p.email_verified_at IS DISTINCT FROM NEW.email_confirmed_at);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_verified ON auth.users;
CREATE TRIGGER on_auth_user_email_verified
  AFTER UPDATE OF email, email_confirmed_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_auth_user_email_verification();

-- Backfill existing profiles from the authoritative auth state.
UPDATE public.profiles p
   SET email = u.email,
       email_verified_at = u.email_confirmed_at
  FROM auth.users u
 WHERE p.id = u.id
   AND (p.email IS DISTINCT FROM u.email
        OR p.email_verified_at IS DISTINCT FROM u.email_confirmed_at);

-- ── 2. Verified-email ownership helper ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.verified_email_owns(p_email text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL
     AND auth.email() IS NOT NULL
     AND nullif(btrim(p_email), '') IS NOT NULL
     AND lower(auth.email()) = lower(btrim(p_email))
     AND EXISTS (
       SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid()
         AND p.email_verified_at IS NOT NULL
         AND lower(p.email::text) = lower(btrim(p_email))
     );
$$;

REVOKE ALL ON FUNCTION public.verified_email_owns(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verified_email_owns(text) TO authenticated, service_role;

-- ── 3. buyer_owns_* helpers ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.buyer_owns_purchase(p_purchase_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.purchase_requests pr
     WHERE pr.id = p_purchase_id
       AND (pr.buyer_id = auth.uid()
            OR public.verified_email_owns(pr.customer_email::text))
  );
$$;

CREATE OR REPLACE FUNCTION public.buyer_owns_code(p_code_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.purchase_codes pc
      JOIN public.order_items oi ON oi.id = pc.order_item_id
      JOIN public.orders o ON o.id = oi.order_id
      JOIN public.purchase_requests pr ON pr.id = o.purchase_request_id
     WHERE pc.id = p_code_id
       AND (pr.buyer_id = auth.uid()
            OR public.verified_email_owns(pr.customer_email::text))
  );
$$;

CREATE OR REPLACE FUNCTION public.buyer_owns_order_item(p_order_item_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
      JOIN public.purchase_requests pr ON pr.id = o.purchase_request_id
     WHERE oi.id = p_order_item_id
       AND (pr.buyer_id = auth.uid()
            OR public.verified_email_owns(pr.customer_email::text))
  );
$$;

-- buyer_owns_session() delegates to buyer_owns_code(), so it needs no body change.

-- ── 4. RLS policies ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS pr_read ON public.purchase_requests;
CREATE POLICY pr_read ON public.purchase_requests FOR SELECT
USING (
  buyer_id = auth.uid()
  OR public.verified_email_owns(customer_email::text)
  OR public.staff_has('request.read.any')
  OR public.is_admin_or_above()
);

DROP POLICY IF EXISTS pri_read ON public.purchase_request_items;
CREATE POLICY pri_read ON public.purchase_request_items FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.purchase_requests pr
     WHERE pr.id = public.purchase_request_items.purchase_request_id
       AND (pr.buyer_id = auth.uid()
            OR public.verified_email_owns(pr.customer_email::text)
            OR public.staff_has('request.read.any')
            OR public.is_admin_or_above())
  )
);

-- ── 5. Buyer-facing definer views ───────────────────────────────────────
DROP VIEW IF EXISTS buyer_orders_view CASCADE;
CREATE VIEW buyer_orders_view AS
SELECT
  pr.id AS purchase_request_id,
  pr.status,
  pr.total_amount,
  pr.currency,
  pr.amount_in_usd,
  pr.customer_email,
  pr.customer_phone,
  pr.created_at,
  pr.buyer_id,
  o.id AS order_id,
  o.status AS order_status
FROM purchase_requests pr
LEFT JOIN orders o ON o.purchase_request_id = pr.id
WHERE pr.buyer_id = auth.uid()
   OR public.verified_email_owns(pr.customer_email::text)
   OR public.is_admin_or_above()
   OR public.staff_has('request.read.any');
GRANT SELECT ON buyer_orders_view TO authenticated;

DROP VIEW IF EXISTS buyer_codes_full CASCADE;
CREATE VIEW buyer_codes_full AS
SELECT
  pc.id AS code_id,
  pc.order_item_id,
  pc.code_prefix,
  pc.status AS code_status,
  pc.issued_at,
  pc.delivered_at,
  pc.redeemed_at,
  pc.expires_at,
  pc.replacement_for_code_id,
  cr.session_id,
  oi.product_id,
  p.title AS product_title,
  p.slug AS product_slug,
  pr.id AS purchase_request_id,
  pr.buyer_id,
  pr.customer_email
FROM purchase_codes pc
JOIN order_items oi ON oi.id = pc.order_item_id
JOIN orders o ON o.id = oi.order_id
JOIN purchase_requests pr ON pr.id = o.purchase_request_id
JOIN products p ON p.id = oi.product_id
LEFT JOIN code_redemptions cr ON cr.code_id = pc.id
WHERE pr.buyer_id = auth.uid()
   OR public.verified_email_owns(pr.customer_email::text)
   OR public.is_admin_or_above()
   OR public.staff_has('code.read.any');
GRANT SELECT ON buyer_codes_full TO authenticated;

DROP VIEW IF EXISTS buyer_sessions_full CASCADE;
CREATE VIEW buyer_sessions_full AS
SELECT
  ds.id AS session_id,
  ds.status,
  ds.started_at,
  ds.expires_at,
  ds.ended_at,
  ds.is_compensation,
  ds.parent_session_id,
  ds.attempt_consumed,
  pc.id AS code_id,
  pc.code_prefix,
  oi.id AS order_item_id,
  oi.product_id,
  p.title AS product_title,
  p.slug AS product_slug,
  pr.id AS purchase_request_id,
  pr.buyer_id,
  pr.customer_email
FROM download_sessions ds
JOIN purchase_codes pc ON pc.id = ds.code_id
JOIN order_items oi ON oi.id = ds.order_item_id
JOIN orders o ON o.id = oi.order_id
JOIN purchase_requests pr ON pr.id = o.purchase_request_id
JOIN products p ON p.id = oi.product_id
WHERE pr.buyer_id = auth.uid()
   OR public.verified_email_owns(pr.customer_email::text)
   OR public.is_admin_or_above()
   OR public.staff_has('download.session.revoke');
GRANT SELECT ON buyer_sessions_full TO authenticated;

-- ── 6. Buyer RPCs with email fallbacks ───────────────────────────────────
CREATE OR REPLACE FUNCTION buyer_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN '{}'::jsonb; END IF;

  RETURN jsonb_build_object(
    'total_orders', (
      SELECT COUNT(*) FROM purchase_requests
       WHERE buyer_id = v_uid OR public.verified_email_owns(customer_email::text)
    ),
    'pending_orders', (
      SELECT COUNT(*) FROM purchase_requests
       WHERE (buyer_id = v_uid OR public.verified_email_owns(customer_email::text))
         AND status IN ('created','pending')
    ),
    'active_codes', (
      SELECT COUNT(*) FROM buyer_codes_full
       WHERE (buyer_id = v_uid OR public.verified_email_owns(customer_email::text))
         AND code_status IN ('issued','delivered')
         AND expires_at > now()
    ),
    'active_sessions', (
      SELECT COUNT(*) FROM buyer_sessions_full
       WHERE (buyer_id = v_uid OR public.verified_email_owns(customer_email::text))
         AND status IN ('active','compensation_active')
         AND expires_at > now()
    ),
    'unread_notifications', (
      SELECT COUNT(*) FROM notifications WHERE user_id = v_uid AND read_at IS NULL
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION buyer_attempts_remaining(p_order_item_id uuid)
RETURNS TABLE(used int, max int, remaining int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_max int;
  v_used int;
BEGIN
  IF NOT public.buyer_owns_order_item(p_order_item_id) THEN RETURN; END IF;

  SELECT max_attempts_per_product INTO v_max FROM download_settings WHERE id = 1;
  IF v_max IS NULL THEN v_max := 3; END IF;

  SELECT COUNT(*) INTO v_used
    FROM download_attempts
   WHERE order_item_id = p_order_item_id AND completed = true;

  RETURN QUERY SELECT v_used, v_max, GREATEST(v_max - v_used, 0);
END;
$$;

CREATE OR REPLACE FUNCTION buyer_order_detail(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_request record;
  v_items jsonb;
  v_compensations jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  SELECT pr.id, pr.status, pr.total_amount, pr.currency, pr.amount_in_usd,
         pr.customer_email, pr.created_at, pr.buyer_id
    INTO v_request
    FROM purchase_requests pr
   WHERE pr.id = p_request_id
     AND (pr.buyer_id = v_uid OR public.verified_email_owns(pr.customer_email::text));

  IF v_request IS NULL THEN RETURN NULL; END IF;

  WITH items AS (
    SELECT
      pri.id AS pr_item_id,
      pri.product_id,
      p.title AS product_title,
      p.slug AS product_slug,
      pri.unit_price,
      pri.currency AS item_currency,
      oi.id AS order_item_id,
      pc.id AS code_id,
      pc.code_prefix,
      pc.status AS code_status,
      pc.expires_at AS code_expires_at,
      pc.redeemed_at,
      cr.session_id,
      (SELECT COUNT(*)::int FROM download_attempts da
        WHERE da.order_item_id = oi.id AND da.completed = true) AS attempts_used,
      (SELECT max_attempts_per_product FROM download_settings WHERE id = 1) AS attempts_max
    FROM purchase_request_items pri
    JOIN products p ON p.id = pri.product_id
    LEFT JOIN orders o ON o.purchase_request_id = pri.purchase_request_id
    LEFT JOIN order_items oi ON oi.order_id = o.id AND oi.product_id = pri.product_id
    LEFT JOIN purchase_codes pc ON pc.order_item_id = oi.id
    LEFT JOIN code_redemptions cr ON cr.code_id = pc.id
    WHERE pri.purchase_request_id = p_request_id
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'order_item_id', order_item_id,
      'product_id', product_id,
      'product_title', product_title,
      'product_slug', product_slug,
      'price', unit_price,
      'currency', item_currency,
      'code', CASE WHEN code_id IS NULL THEN NULL ELSE jsonb_build_object(
        'code_id', code_id,
        'code_prefix', code_prefix,
        'code_status', code_status,
        'expires_at', code_expires_at,
        'redeemed_at', redeemed_at,
        'session_id', session_id
      ) END,
      'attempts', CASE WHEN order_item_id IS NULL THEN NULL ELSE jsonb_build_object(
        'used', attempts_used,
        'max', COALESCE(attempts_max, 3),
        'remaining', GREATEST(COALESCE(attempts_max, 3) - attempts_used, 0)
      ) END
    )
    ORDER BY pr_item_id
  ) INTO v_items
  FROM items;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', cr.id,
      'code_id', cr.code_id,
      'status', cr.status,
      'sequence_number', cr.sequence_number,
      'admin_reason', CASE WHEN cr.status = 'rejected' THEN cr.admin_reason ELSE NULL END,
      'requested_at', cr.requested_at,
      'decided_at', cr.decided_at
    )
    ORDER BY cr.requested_at DESC
  ), '[]'::jsonb) INTO v_compensations
  FROM compensation_requests cr
  WHERE cr.code_id IN (
    SELECT pc.id
      FROM purchase_codes pc
      JOIN order_items oi ON oi.id = pc.order_item_id
      JOIN orders o ON o.id = oi.order_id
     WHERE o.purchase_request_id = p_request_id
  );

  RETURN jsonb_build_object(
    'request', jsonb_build_object(
      'purchase_request_id', v_request.id,
      'status', v_request.status,
      'total_amount', v_request.total_amount,
      'currency', v_request.currency,
      'amount_in_usd', v_request.amount_in_usd,
      'customer_email', v_request.customer_email,
      'created_at', v_request.created_at
    ),
    'items', COALESCE(v_items, '[]'::jsonb),
    'compensation_requests', v_compensations
  );
END;
$$;

CREATE OR REPLACE FUNCTION buyer_orders_list()
RETURNS TABLE (
  purchase_request_id uuid,
  status purchase_request_status_enum,
  total_amount numeric,
  currency char(3),
  amount_in_usd numeric,
  created_at timestamptz,
  product_titles text,
  code_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    pr.id,
    pr.status,
    pr.total_amount,
    pr.currency,
    pr.amount_in_usd,
    pr.created_at,
    COALESCE(string_agg(DISTINCT p.title, ', '), '') AS product_titles,
    COUNT(DISTINCT pc.id)::bigint AS code_count
  FROM purchase_requests pr
  LEFT JOIN purchase_request_items pri ON pri.purchase_request_id = pr.id
  LEFT JOIN products p ON p.id = pri.product_id
  LEFT JOIN orders o ON o.purchase_request_id = pr.id
  LEFT JOIN order_items oi ON oi.order_id = o.id
  LEFT JOIN purchase_codes pc ON pc.order_item_id = oi.id
  WHERE pr.buyer_id = auth.uid()
     OR public.verified_email_owns(pr.customer_email::text)
  GROUP BY pr.id, pr.status, pr.total_amount, pr.currency, pr.amount_in_usd, pr.created_at
  ORDER BY pr.created_at DESC
  LIMIT 100
$$;

CREATE OR REPLACE FUNCTION public.download_session_owned_by_current_user(p_session_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.download_sessions ds
      JOIN public.purchase_codes pc ON pc.id = ds.code_id
      JOIN public.order_items oi ON oi.id = pc.order_item_id
      JOIN public.orders o ON o.id = oi.order_id
      JOIN public.purchase_requests pr ON pr.id = o.purchase_request_id
     WHERE ds.id = p_session_id
       AND (
         ds.buyer_id = auth.uid()
         OR pr.buyer_id = auth.uid()
         OR public.verified_email_owns(pr.customer_email::text)
       )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_current_user_review(p_product_id uuid)
RETURNS TABLE (can_review boolean, order_item_id uuid, reason text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_existing uuid;
  v_item uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, 'login_required'::text;
    RETURN;
  END IF;

  SELECT r.id INTO v_existing
    FROM public.reviews r
   WHERE r.product_id = p_product_id AND r.buyer_id = v_uid
   LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, 'already_reviewed'::text;
    RETURN;
  END IF;

  SELECT oi.id INTO v_item
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    JOIN public.purchase_requests pr ON pr.id = o.purchase_request_id
   WHERE oi.product_id = p_product_id
     AND pr.status IN ('approved', 'completed')
     AND (pr.buyer_id = v_uid OR public.verified_email_owns(pr.customer_email::text))
   LIMIT 1;

  IF v_item IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, 'not_purchased'::text;
  ELSE
    RETURN QUERY SELECT true, v_item, NULL::text;
  END IF;
END;
$$;

-- ── 7. Hide forensic columns from browser roles ─────────────────────────
-- RLS policies cannot hide columns. Follow the 057 precedent: revoke broad
-- SELECT and grant only the non-forensic columns to authenticated users.
REVOKE SELECT ON public.purchase_requests FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  id, buyer_id, customer_email, customer_phone, status,
  total_amount, currency, exchange_rate_at_purchase, amount_in_usd,
  cancelled_by, cancel_reason, cancelled_at, created_at, updated_at,
  notes, full_name
) ON public.purchase_requests TO authenticated;

GRANT SELECT ON public.purchase_requests TO service_role;

-- Staff-only escape hatch if a future UI needs the raw tracking metadata.
CREATE OR REPLACE FUNCTION public.purchase_request_forensics(p_request_id uuid)
RETURNS TABLE(access_token_hash text, ip inet, user_agent text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pr.access_token_hash, pr.ip, pr.user_agent
    FROM public.purchase_requests pr
   WHERE pr.id = p_request_id
     AND (public.is_admin_or_above() OR public.staff_has('request.read.any'));
$$;

REVOKE ALL ON FUNCTION public.purchase_request_forensics(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_request_forensics(uuid) TO authenticated, service_role;

COMMIT;
