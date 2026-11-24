-- ============================================================
-- 070_p1_medium_security_hardening.sql
--   M-10: Separate support.write from support.read on support_tickets
--         and guard immutable ticket columns via BEFORE UPDATE trigger.
--   M-11: Restrict create_purchase_request() to service_role (with explicit
--         p_buyer_id and 64-hex token hash check) so PostgREST callers cannot
--         spoof p_ip or pass a NULL p_access_token_hash.
-- ============================================================

BEGIN;

-- ── 1. M-10: support.write permission + support_tickets RLS & column guard ──
INSERT INTO public.permissions (code, description)
VALUES ('support.write', 'Update and close support tickets')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code = 'support.write'
WHERE r.code IN ('super_admin', 'admin')
ON CONFLICT DO NOTHING;

DROP POLICY IF EXISTS tickets_update ON public.support_tickets;
CREATE POLICY tickets_update ON public.support_tickets FOR UPDATE
  USING (public.staff_has('support.write') OR public.is_admin_or_above())
  WITH CHECK (public.staff_has('support.write') OR public.is_admin_or_above());

CREATE OR REPLACE FUNCTION public.protect_support_ticket_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public AS $$
DECLARE
  v_changed text[] := ARRAY[]::text[];
BEGIN
  IF current_user IN ('postgres', 'supabase_admin', 'service_role')
     OR current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    v_changed := array_append(v_changed, 'owner_id');
  END IF;
  IF NEW.subject IS DISTINCT FROM OLD.subject THEN
    v_changed := array_append(v_changed, 'subject');
  END IF;
  IF NEW.order_item_id IS DISTINCT FROM OLD.order_item_id THEN
    v_changed := array_append(v_changed, 'order_item_id');
  END IF;
  IF NEW.product_id IS DISTINCT FROM OLD.product_id THEN
    v_changed := array_append(v_changed, 'product_id');
  END IF;
  IF NEW.review_id IS DISTINCT FROM OLD.review_id THEN
    v_changed := array_append(v_changed, 'review_id');
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    v_changed := array_append(v_changed, 'created_at');
  END IF;

  IF array_length(v_changed, 1) > 0 THEN
    RAISE EXCEPTION 'support_ticket_fields_forbidden: %', array_to_string(v_changed, ', ')
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_tickets_protect_fields ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_protect_fields
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_support_ticket_fields();

-- ── 2. M-11: create_purchase_request service_role-only + validated token hash ──
DROP FUNCTION IF EXISTS public.create_purchase_request(uuid, citext, text, text, text, text, inet, text);

CREATE OR REPLACE FUNCTION public.create_purchase_request(
  p_product_id uuid,
  p_email citext,
  p_phone text,
  p_full_name text,
  p_notes text,
  p_access_token_hash text,
  p_ip inet,
  p_user_agent text,
  p_buyer_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_product products%ROWTYPE;
  v_version product_versions%ROWTYPE;
  v_buyer uuid := COALESCE(p_buyer_id, auth.uid());
  v_rate numeric;
  v_amount_usd numeric;
  v_request_id uuid;
  v_email_count int;
  v_ip_count int;
BEGIN
  IF p_email IS NULL OR length(trim(p_email::text)) < 3 THEN
    RAISE EXCEPTION 'email_required';
  END IF;
  IF p_phone IS NULL OR length(trim(p_phone)) < 5 THEN
    RAISE EXCEPTION 'phone_required';
  END IF;
  IF p_access_token_hash IS NULL OR p_access_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_access_token_hash';
  END IF;

  -- Serialize concurrent submissions for the same (email, product_id)
  PERFORM pg_advisory_xact_lock(
    hashtext('pr:' || lower(trim(p_email::text)) || ':' || COALESCE(p_product_id::text, ''))
  );

  SELECT * INTO v_product FROM products WHERE id = p_product_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'product_not_found'; END IF;
  IF v_product.status <> 'published' OR v_product.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'product_not_available';
  END IF;

  SELECT * INTO v_version FROM product_versions
    WHERE product_id = p_product_id AND status = 'published'
    ORDER BY published_at DESC NULLS LAST, version_number DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'no_published_version'; END IF;

  -- Rate limit: same email 3/hour
  SELECT COUNT(*) INTO v_email_count FROM purchase_requests
    WHERE customer_email = p_email AND created_at > now() - interval '1 hour';
  IF v_email_count >= 3 THEN RAISE EXCEPTION 'rate_limit_email'; END IF;

  -- Rate limit: same IP 10/hour
  IF p_ip IS NOT NULL THEN
    SELECT COUNT(*) INTO v_ip_count FROM purchase_requests
      WHERE ip = p_ip AND created_at > now() - interval '1 hour';
    IF v_ip_count >= 10 THEN RAISE EXCEPTION 'rate_limit_ip'; END IF;
  END IF;

  -- Duplicate guard: same email + product within 10 min with pending status
  IF EXISTS (
    SELECT 1 FROM purchase_requests pr
    JOIN purchase_request_items pri ON pri.purchase_request_id = pr.id
    WHERE pr.customer_email = p_email
      AND pri.product_id = p_product_id
      AND pr.created_at > now() - interval '10 minutes'
      AND pr.status IN ('created','pending')
  ) THEN
    RAISE EXCEPTION 'duplicate_request';
  END IF;

  v_rate := get_usd_rate(v_product.price_currency);
  IF v_rate IS NULL THEN RAISE EXCEPTION 'no_exchange_rate'; END IF;
  v_amount_usd := round((v_product.price_amount * v_rate)::numeric, 4);

  INSERT INTO purchase_requests(
    buyer_id, customer_email, customer_phone, full_name, notes,
    status, total_amount, currency, exchange_rate_at_purchase, amount_in_usd,
    access_token_hash, ip, user_agent
  ) VALUES (
    v_buyer, p_email, p_phone, p_full_name, p_notes,
    'created', v_product.price_amount, v_product.price_currency, v_rate, v_amount_usd,
    p_access_token_hash, p_ip, p_user_agent
  ) RETURNING id INTO v_request_id;

  INSERT INTO purchase_request_items(
    purchase_request_id, product_id, product_version_id,
    unit_price, currency, quantity
  ) VALUES (
    v_request_id, p_product_id, v_version.id,
    v_product.price_amount, v_product.price_currency, 1
  );

  -- Notify all active staff
  INSERT INTO notifications(user_id, type, title, body)
  SELECT sm.profile_id, 'purchase_request_created',
    'طلب شراء جديد',
    v_product.title || ' — ' || p_email::text
  FROM store_members sm
  JOIN roles r ON r.id = sm.role_id
  WHERE sm.status = 'active'
    AND r.code IN ('super_admin','admin','staff');

  PERFORM log_audit('purchase_request.created', 'purchase_requests', v_request_id,
    NULL,
    jsonb_build_object(
      'product_id', p_product_id,
      'amount', v_product.price_amount,
      'currency', v_product.price_currency::text
    ), NULL);

  RETURN jsonb_build_object(
    'request_id', v_request_id,
    'short_ref', substring(v_request_id::text, 1, 8),
    'amount', v_product.price_amount,
    'currency', v_product.price_currency,
    'amount_in_usd', v_amount_usd
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_purchase_request(uuid, citext, text, text, text, text, inet, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_purchase_request(uuid, citext, text, text, text, text, inet, text, uuid)
  TO service_role;

COMMIT;
