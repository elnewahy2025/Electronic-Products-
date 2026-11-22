-- ============================================================
-- 033_commission_snapshot_and_wallet.sql
-- Commission snapshot at sale + automatic seller wallet crediting
-- ============================================================

-- 1. Add immutable sale-time commission snapshot columns on order_items
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS commission_rate_at_sale numeric(5,4) NOT NULL DEFAULT 0.10
    CONSTRAINT chk_order_item_comm_rate CHECK (commission_rate_at_sale >= 0 AND commission_rate_at_sale <= 1),
  ADD COLUMN IF NOT EXISTS commission_amount numeric(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_seller_amount numeric(18,4) NOT NULL DEFAULT 0;

-- 2. Idempotency guard: prevent double-crediting the same order_item
CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_tx_order_item_type
  ON financial_transactions(reference_type, reference_id, type)
  WHERE reference_type = 'order_item';

-- 3. Helper: resolve effective commission rate for a seller (+ optional category)
CREATE OR REPLACE FUNCTION resolve_effective_commission_rate(
  p_seller_id uuid,
  p_category_id uuid DEFAULT NULL
) RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rate numeric;
BEGIN
  -- 1) Category-specific seller commission override
  IF p_category_id IS NOT NULL THEN
    SELECT sc.rate INTO v_rate
    FROM seller_commissions sc
    WHERE sc.seller_id = p_seller_id
      AND sc.scope = 'category'
      AND sc.reference_id = p_category_id
      AND sc.effective_from <= now()
      AND (sc.effective_to IS NULL OR sc.effective_to > now())
    ORDER BY sc.effective_from DESC
    LIMIT 1;
    IF v_rate IS NOT NULL THEN RETURN v_rate; END IF;
  END IF;

  -- 2) Global seller commission override
  SELECT sc.rate INTO v_rate
  FROM seller_commissions sc
  WHERE sc.seller_id = p_seller_id
    AND sc.scope = 'global'
    AND sc.effective_from <= now()
    AND (sc.effective_to IS NULL OR sc.effective_to > now())
  ORDER BY sc.effective_from DESC
  LIMIT 1;
  IF v_rate IS NOT NULL THEN RETURN v_rate; END IF;

  -- 3) Platform default rate
  SELECT cs.default_rate INTO v_rate
  FROM commission_settings cs
  WHERE cs.id = 1;

  RETURN COALESCE(v_rate, 0.10);
END;
$$;

REVOKE ALL ON FUNCTION resolve_effective_commission_rate(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_effective_commission_rate(uuid, uuid) TO service_role;

-- 4. Helper: atomically credit seller wallet for an order_item (idempotent)
CREATE OR REPLACE FUNCTION credit_seller_wallet_for_order_item(
  p_order_item_id uuid,
  p_seller_id uuid,
  p_gross numeric,
  p_commission numeric,
  p_net numeric,
  p_currency char(3)
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_wallet_id uuid;
BEGIN
  -- Skip if already credited
  IF EXISTS (
    SELECT 1 FROM financial_transactions
    WHERE reference_type = 'order_item'
      AND reference_id = p_order_item_id
      AND type = 'earning'
  ) THEN
    SELECT id INTO v_wallet_id
    FROM seller_wallets
    WHERE seller_id = p_seller_id AND currency = p_currency;
    RETURN v_wallet_id;
  END IF;

  -- Upsert seller wallet and add net earning atomically
  INSERT INTO seller_wallets(seller_id, currency, balance)
  VALUES (p_seller_id, p_currency, p_net)
  ON CONFLICT (seller_id, currency)
  DO UPDATE SET balance = seller_wallets.balance + EXCLUDED.balance
  RETURNING id INTO v_wallet_id;

  -- Ledger entry 1: gross earning
  INSERT INTO financial_transactions(wallet_id, type, amount, currency, reference_type, reference_id)
  VALUES (v_wallet_id, 'earning', p_gross, p_currency, 'order_item', p_order_item_id);

  -- Ledger entry 2: platform commission deduction (negative)
  IF p_commission > 0 THEN
    INSERT INTO financial_transactions(wallet_id, type, amount, currency, reference_type, reference_id)
    VALUES (v_wallet_id, 'commission', -p_commission, p_currency, 'order_item', p_order_item_id);
  END IF;

  RETURN v_wallet_id;
END;
$$;

REVOKE ALL ON FUNCTION credit_seller_wallet_for_order_item(uuid, uuid, numeric, numeric, numeric, char) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION credit_seller_wallet_for_order_item(uuid, uuid, numeric, numeric, numeric, char) TO service_role;

-- 5. Backfill existing order_items (if any) & credit their wallets idempotently
DO $$
DECLARE
  v_row record;
  v_rate numeric;
  v_comm numeric;
  v_net numeric;
BEGIN
  FOR v_row IN
    SELECT oi.id, oi.price, oi.currency, p.seller_id, p.category_id
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    WHERE oi.net_seller_amount = 0 AND oi.price > 0
  LOOP
    v_rate := resolve_effective_commission_rate(v_row.seller_id, v_row.category_id);
    v_comm := ROUND(v_row.price * v_rate, 4);
    v_net  := ROUND(v_row.price - v_comm, 4);

    UPDATE order_items
      SET commission_rate_at_sale = v_rate,
          commission_amount = v_comm,
          net_seller_amount = v_net
      WHERE id = v_row.id;

    PERFORM credit_seller_wallet_for_order_item(
      v_row.id, v_row.seller_id, v_row.price, v_comm, v_net, v_row.currency
    );
  END LOOP;
END;
$$;

-- 6. Update approve_purchase_request: snapshot commission + credit seller wallet
CREATE OR REPLACE FUNCTION approve_purchase_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_req purchase_requests%ROWTYPE;
  v_order_id uuid;
  v_item record;
  v_code_id uuid; v_code text; v_hash text; v_prefix char(4);
  v_chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_pepper text; v_attempt int;
  v_output jsonb := '[]'::jsonb;
  v_seller_id uuid;
  v_category_id uuid;
  v_comm_rate numeric;
  v_comm_amount numeric;
  v_net_amount numeric;
BEGIN
  IF NOT (is_admin_or_above() OR staff_has('code.issue')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_req FROM purchase_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'purchase_request_not_found'; END IF;
  IF v_req.status NOT IN ('created','pending') THEN RAISE EXCEPTION 'purchase_request_not_approvable'; END IF;

  INSERT INTO orders(purchase_request_id, buyer_id, status,
    total_amount, currency, amount_in_usd, exchange_rate_at_purchase)
  VALUES (v_req.id, v_req.buyer_id, 'created',
    v_req.total_amount, v_req.currency, v_req.amount_in_usd, v_req.exchange_rate_at_purchase)
  RETURNING id INTO v_order_id;

  SELECT COALESCE(NULLIF(current_setting('app.code_pepper', true), ''), 'default-pepper') INTO v_pepper;

  FOR v_item IN
    SELECT id, product_id, product_version_id, unit_price, currency, quantity
    FROM purchase_request_items WHERE purchase_request_id = p_request_id
  LOOP
    IF v_item.product_version_id IS NULL THEN RAISE EXCEPTION 'product_version_required'; END IF;

    SELECT p.seller_id, p.category_id
      INTO v_seller_id, v_category_id
      FROM products p WHERE p.id = v_item.product_id;

    v_comm_rate := resolve_effective_commission_rate(v_seller_id, v_category_id);
    v_comm_amount := ROUND(v_item.unit_price * v_comm_rate, 4);
    v_net_amount := ROUND(v_item.unit_price - v_comm_amount, 4);

    DECLARE v_order_item_id uuid;
    BEGIN
      INSERT INTO order_items(
        order_id, product_id, product_version_id, price, currency,
        commission_rate_at_sale, commission_amount, net_seller_amount
      )
      VALUES (
        v_order_id, v_item.product_id, v_item.product_version_id, v_item.unit_price, v_item.currency,
        v_comm_rate, v_comm_amount, v_net_amount
      )
      RETURNING id INTO v_order_item_id;

      -- Credit seller wallet & record ledger transactions
      PERFORM credit_seller_wallet_for_order_item(
        v_order_item_id, v_seller_id, v_item.unit_price, v_comm_amount, v_net_amount, v_item.currency
      );

      v_attempt := 0;
      LOOP
        v_attempt := v_attempt + 1;
        IF v_attempt > 10 THEN RAISE EXCEPTION 'code_generation_failed'; END IF;
        v_code := '';
        FOR i IN 1..16 LOOP
          v_code := v_code || substr(v_chars, floor(random() * length(v_chars))::int + 1, 1);
          IF i IN (4,8,12) THEN v_code := v_code || '-'; END IF;
        END LOOP;
        v_hash := encode(hmac(v_code, v_pepper, 'sha256'), 'hex');
        v_prefix := substring(v_code from 1 for 4);
        BEGIN
          INSERT INTO purchase_codes(order_item_id, code_hash, code_prefix, status,
            issued_by, issued_at, expires_at)
          VALUES (v_order_item_id, v_hash, v_prefix, 'issued',
            auth.uid(), now(), now() + interval '72 hours')
          RETURNING id INTO v_code_id;
          EXIT;
        EXCEPTION WHEN unique_violation THEN CONTINUE;
        END;
      END LOOP;

      INSERT INTO code_plaintext_handoff(code_id, plaintext, expires_at)
        VALUES (v_code_id, v_code, now() + interval '10 minutes');

      v_output := v_output || jsonb_build_object(
        'code_id', v_code_id, 'order_item_id', v_order_item_id,
        'code_prefix', v_prefix, 'product_id', v_item.product_id,
        'commission_rate', v_comm_rate, 'net_seller_amount', v_net_amount
      );
    END;
  END LOOP;

  UPDATE purchase_requests SET status = 'approved' WHERE id = p_request_id;

  PERFORM log_audit('purchase_request.approved', 'purchase_requests', p_request_id,
    jsonb_build_object('status', v_req.status),
    jsonb_build_object('status', 'approved', 'order_id', v_order_id), NULL);

  RETURN v_output;
END;
$$;

-- 7. Update seller_orders & seller_sales_stats to use snapshotted commission/net
CREATE OR REPLACE FUNCTION seller_orders(
  p_product_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
) RETURNS TABLE (
  order_item_id uuid,
  product_id uuid,
  product_title text,
  product_slug text,
  price numeric,
  currency char(3),
  ordered_at timestamptz,
  buyer_masked text,
  code_status text,
  code_prefix char(4),
  code_expires_at timestamptz,
  session_status text,
  attempts_used int,
  attempts_max int,
  commission_rate numeric,
  net_amount numeric,
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_seller uuid := auth.uid();
  v_max_attempts int;
BEGIN
  IF v_seller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  SELECT COALESCE((SELECT max_attempts_per_product FROM download_settings WHERE id = 1), 3)
    INTO v_max_attempts;

  RETURN QUERY
  WITH base AS (
    SELECT
      oi.id AS order_item_id,
      oi.product_id,
      p.title AS product_title,
      p.slug AS product_slug,
      oi.price,
      oi.currency,
      oi.created_at AS ordered_at,
      oi.commission_rate_at_sale,
      oi.net_seller_amount,
      pr.customer_email,
      pc.status::text AS code_status,
      pc.code_prefix,
      pc.expires_at AS code_expires_at,
      ds.status::text AS session_status,
      (SELECT COUNT(*)::int FROM download_attempts da
        WHERE da.order_item_id = oi.id AND da.completed = true) AS attempts_used
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    JOIN orders o ON o.id = oi.order_id
    JOIN purchase_requests pr ON pr.id = o.purchase_request_id
    LEFT JOIN purchase_codes pc ON pc.order_item_id = oi.id
    LEFT JOIN download_sessions ds ON ds.code_id = pc.id
    WHERE p.seller_id = v_seller
      AND pr.status IN ('approved', 'completed')
      AND (p_product_id IS NULL OR oi.product_id = p_product_id)
      AND (p_from IS NULL OR oi.created_at >= p_from)
      AND (p_to IS NULL OR oi.created_at <= p_to)
  ),
  filtered AS (
    SELECT * FROM base
    WHERE p_status IS NULL
       OR (p_status = 'pending' AND code_status IN ('issued','delivered'))
       OR (p_status = 'active' AND code_status = 'redeemed'
           AND session_status IN ('active','compensation_active'))
       OR (p_status = 'completed' AND code_status = 'redeemed'
           AND session_status = 'completed')
       OR (p_status = 'expired' AND (code_status = 'expired'
           OR session_status IN ('expired','expired_partial','exhausted')))
       OR (p_status = 'revoked' AND code_status = 'revoked')
  ),
  counted AS (SELECT COUNT(*) AS total FROM filtered)
  SELECT
    f.order_item_id,
    f.product_id,
    f.product_title,
    f.product_slug,
    f.price,
    f.currency,
    f.ordered_at,
    CASE
      WHEN f.customer_email IS NULL THEN 'مشتري'
      ELSE substring(f.customer_email::text from 1 for 2) || '***@' ||
           split_part(f.customer_email::text, '@', 2)
    END,
    f.code_status,
    f.code_prefix,
    f.code_expires_at,
    f.session_status,
    f.attempts_used,
    v_max_attempts,
    f.commission_rate_at_sale,
    f.net_seller_amount,
    c.total
  FROM filtered f, counted c
  ORDER BY f.ordered_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

CREATE OR REPLACE FUNCTION seller_sales_stats()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_seller uuid := auth.uid();
  v_commission numeric;
  v_result jsonb;
BEGIN
  IF v_seller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  v_commission := resolve_effective_commission_rate(v_seller, NULL);

  WITH base AS (
    SELECT
      oi.id,
      oi.product_id,
      oi.price,
      oi.net_seller_amount,
      oi.currency,
      oi.created_at,
      p.title,
      p.slug,
      pc.status::text AS code_status,
      ds.status::text AS session_status
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    JOIN orders o ON o.id = oi.order_id
    JOIN purchase_requests pr ON pr.id = o.purchase_request_id
    LEFT JOIN purchase_codes pc ON pc.order_item_id = oi.id
    LEFT JOIN download_sessions ds ON ds.code_id = pc.id
    WHERE p.seller_id = v_seller
      AND pr.status IN ('approved', 'completed')
  )
  SELECT jsonb_build_object(
    'total_sales', (SELECT COUNT(*) FROM base),
    'total_gross', (SELECT COALESCE(SUM(price), 0) FROM base),
    'total_net', (SELECT COALESCE(SUM(net_seller_amount), 0) FROM base),
    'currency', (SELECT currency FROM base GROUP BY currency ORDER BY COUNT(*) DESC LIMIT 1),
    'has_multiple_currencies', ((SELECT COUNT(DISTINCT currency) FROM base) > 1),
    'commission_rate', v_commission,
    'pending_count', (SELECT COUNT(*) FROM base
      WHERE code_status IN ('issued','delivered')),
    'active_count', (SELECT COUNT(*) FROM base
      WHERE code_status = 'redeemed' AND session_status IN ('active','compensation_active')),
    'completed_count', (SELECT COUNT(*) FROM base WHERE session_status = 'completed'),
    'expired_count', (SELECT COUNT(*) FROM base
      WHERE session_status IN ('expired','expired_partial','exhausted')),
    'revenue_last_30d', (
      SELECT COALESCE(SUM(net_seller_amount), 0)
      FROM base WHERE created_at > now() - interval '30 days'
    ),
    'sales_last_30d', (SELECT COUNT(*) FROM base WHERE created_at > now() - interval '30 days'),
    'top_products', (
      SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) FROM (
        SELECT
          product_id,
          title,
          slug,
          COUNT(*) AS count,
          SUM(price) AS gross,
          SUM(net_seller_amount) AS net
        FROM base
        GROUP BY product_id, title, slug
        ORDER BY COUNT(*) DESC, SUM(price) DESC
        LIMIT 5
      ) t
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;
