-- ============================================================
-- 031_performance_indexes.sql
-- Indexes + trigram search + query helpers
-- ============================================================

-- Ensure cover_image_url exists if 029_storefront_ux has not been applied yet
ALTER TABLE products ADD COLUMN IF NOT EXISTS cover_image_url text;

-- ------------------------------------------------------------
-- 1. Enable pg_trgm for LIKE '%...%' acceleration
-- ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ------------------------------------------------------------
-- 2. Missing indexes on hot paths
-- ------------------------------------------------------------

-- Buyer orders list (ordered, filtered by buyer + status)
CREATE INDEX IF NOT EXISTS idx_purchase_requests_buyer_time
  ON purchase_requests(buyer_id, created_at DESC)
  WHERE buyer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_requests_email_time
  ON purchase_requests(customer_email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_purchase_requests_status_time
  ON purchase_requests(status, created_at DESC);

-- order_items per product (used by canCurrentUserReview, review eligibility, seller sales)
CREATE INDEX IF NOT EXISTS idx_order_items_product
  ON order_items(product_id);

CREATE INDEX IF NOT EXISTS idx_order_items_order
  ON order_items(order_id);

-- purchase_request_items per product (review duplicate check + deletion guard)
CREATE INDEX IF NOT EXISTS idx_pri_product
  ON purchase_request_items(product_id);

-- Reviews eligibility & distribution
CREATE INDEX IF NOT EXISTS idx_reviews_buyer_product
  ON reviews(buyer_id, product_id);

CREATE INDEX IF NOT EXISTS idx_reviews_product_rating
  ON reviews(product_id, rating, status)
  WHERE status = 'published';

-- Download attempts: counting completed per order_item (attempts remaining)
CREATE INDEX IF NOT EXISTS idx_download_attempts_completed
  ON download_attempts(order_item_id, completed)
  WHERE completed = true;

-- Download deliveries: existence check "started delivery?" per session
CREATE INDEX IF NOT EXISTS idx_deliveries_session_completed
  ON download_deliveries(session_id)
  WHERE completed = true;

-- Purchase codes admin list (ordered by issued_at)
CREATE INDEX IF NOT EXISTS idx_purchase_codes_issued_time
  ON purchase_codes(issued_at DESC);

CREATE INDEX IF NOT EXISTS idx_purchase_codes_status_time
  ON purchase_codes(status, issued_at DESC);

-- Compensation count per code
CREATE INDEX IF NOT EXISTS idx_compensation_code_status
  ON compensation_requests(code_id, status);

-- Products by category (category pages, similar products)
CREATE INDEX IF NOT EXISTS idx_products_category_published
  ON products(category_id, published_at DESC)
  WHERE status = 'published';

-- ------------------------------------------------------------
-- 3. Trigram index for storefront search
--    Replaces the ILIKE '%query%' full scan.
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_products_search_trgm
  ON products USING gin (
    normalize_arabic(coalesce(title, '') || ' ' || coalesce(short_description, '') || ' ' || coalesce(description, ''))
    gin_trgm_ops
  )
  WHERE status = 'published';

-- ------------------------------------------------------------
-- 4. materialized-style stats: product rating snapshot
--    Optional but avoids AVG() subqueries on every search row.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_rating_stats (
  product_id uuid PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  avg_rating numeric(3,2) NOT NULL DEFAULT 0,
  review_count int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION refresh_product_rating(p_product_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO product_rating_stats(product_id, avg_rating, review_count, updated_at)
  SELECT
    p_product_id,
    COALESCE(ROUND(AVG(r.rating)::numeric, 2), 0),
    COUNT(*)::int,
    now()
  FROM reviews r
  WHERE r.product_id = p_product_id AND r.status = 'published'
  HAVING COUNT(*) > 0
  ON CONFLICT (product_id) DO UPDATE
    SET avg_rating = EXCLUDED.avg_rating,
        review_count = EXCLUDED.review_count,
        updated_at = now();

  -- If no reviews remain, zero out
  IF NOT EXISTS (SELECT 1 FROM reviews WHERE product_id = p_product_id AND status = 'published') THEN
    UPDATE product_rating_stats
      SET avg_rating = 0, review_count = 0, updated_at = now()
      WHERE product_id = p_product_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION refresh_product_rating(uuid) TO service_role;

-- Trigger: refresh rating on review insert/update/delete
CREATE OR REPLACE FUNCTION trg_refresh_rating() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM refresh_product_rating(COALESCE(NEW.product_id, OLD.product_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_reviews_refresh_rating_ins ON reviews;
CREATE TRIGGER trg_reviews_refresh_rating_ins
  AFTER INSERT ON reviews
  FOR EACH ROW EXECUTE FUNCTION trg_refresh_rating();

DROP TRIGGER IF EXISTS trg_reviews_refresh_rating_upd ON reviews;
CREATE TRIGGER trg_reviews_refresh_rating_upd
  AFTER UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION trg_refresh_rating();

DROP TRIGGER IF EXISTS trg_reviews_refresh_rating_del ON reviews;
CREATE TRIGGER trg_reviews_refresh_rating_del
  AFTER DELETE ON reviews
  FOR EACH ROW EXECUTE FUNCTION trg_refresh_rating();

-- Backfill existing stats
INSERT INTO product_rating_stats(product_id, avg_rating, review_count)
SELECT
  p.id,
  COALESCE(ROUND(AVG(r.rating)::numeric, 2), 0),
  COUNT(r.id)::int
FROM products p
LEFT JOIN reviews r ON r.product_id = p.id AND r.status = 'published'
GROUP BY p.id
ON CONFLICT (product_id) DO UPDATE
  SET avg_rating = EXCLUDED.avg_rating,
      review_count = EXCLUDED.review_count,
      updated_at = now();

-- ------------------------------------------------------------
-- 5. Rewritten storefront view using the stats table
-- ------------------------------------------------------------
DROP VIEW IF EXISTS storefront_products CASCADE;
CREATE VIEW storefront_products AS
SELECT
  p.id, p.title, p.slug, p.short_description,
  p.price_amount, p.price_currency,
  p.published_at, p.category_id, p.seller_id,
  p.cover_image_url,
  sp.display_name AS seller_display_name,
  c.name AS category_name,
  c.slug AS category_slug,
  COALESCE(prs.avg_rating, 0) AS rating_avg,
  COALESCE(prs.review_count, 0) AS rating_count,
  normalize_arabic(p.title || ' ' || coalesce(p.short_description, '') || ' ' || coalesce(p.description, '')) AS search_text
FROM products p
JOIN seller_profiles sp ON sp.profile_id = p.seller_id AND sp.status = 'approved'
LEFT JOIN categories c ON c.id = p.category_id
LEFT JOIN product_rating_stats prs ON prs.product_id = p.id
WHERE p.status = 'published';

GRANT SELECT ON storefront_products TO anon, authenticated;

-- ------------------------------------------------------------
-- 6. Rewritten search RPC with trigram + stats
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS search_storefront(text, text, uuid, numeric, numeric, text, int, int);

CREATE OR REPLACE FUNCTION search_storefront(
  p_query text DEFAULT NULL,
  p_category_slug text DEFAULT NULL,
  p_seller_id uuid DEFAULT NULL,
  p_min_price numeric DEFAULT NULL,
  p_max_price numeric DEFAULT NULL,
  p_sort text DEFAULT 'newest',
  p_limit int DEFAULT 24,
  p_offset int DEFAULT 0
) RETURNS TABLE (
  id uuid, title text, slug text, short_description text,
  price_amount numeric, price_currency char(3),
  published_at timestamptz, seller_id uuid, seller_display_name text,
  category_name text, category_slug text,
  rating_avg numeric, rating_count bigint,
  cover_image_url text, total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_q text;
  v_has_query boolean;
BEGIN
  v_q := normalize_arabic(p_query);
  v_has_query := v_q IS NOT NULL AND v_q <> '';

  RETURN QUERY
  WITH filtered AS (
    SELECT sp.*
    FROM storefront_products sp
    WHERE
      (NOT v_has_query OR sp.search_text % v_q)
      AND (p_category_slug IS NULL OR sp.category_slug = p_category_slug)
      AND (p_seller_id IS NULL OR sp.seller_id = p_seller_id)
      AND (p_min_price IS NULL OR sp.price_amount >= p_min_price)
      AND (p_max_price IS NULL OR sp.price_amount <= p_max_price)
  ),
  counted AS (SELECT COUNT(*) AS total FROM filtered)
  SELECT
    f.id, f.title, f.slug, f.short_description, f.price_amount, f.price_currency,
    f.published_at, f.seller_id, f.seller_display_name, f.category_name, f.category_slug,
    f.rating_avg, f.rating_count, f.cover_image_url, c.total
  FROM filtered f, counted c
  ORDER BY
    CASE p_sort WHEN 'price_asc' THEN f.price_amount WHEN 'price_desc' THEN -f.price_amount ELSE NULL END ASC NULLS LAST,
    CASE p_sort WHEN 'rating' THEN f.rating_avg WHEN 'popular' THEN f.rating_count::numeric ELSE NULL END DESC NULLS LAST,
    f.published_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION search_storefront TO anon, authenticated;

-- ------------------------------------------------------------
-- 7. FIX N+1: single-query buyer order detail
--    Returns items + code + attempts + compensations in one call.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION buyer_order_detail(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email citext := auth.email();
  v_request record;
  v_items jsonb;
  v_compensations jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  -- 1. Request (ownership enforced)
  SELECT pr.id, pr.status, pr.total_amount, pr.currency, pr.amount_in_usd,
         pr.customer_email, pr.created_at, pr.buyer_id
    INTO v_request
    FROM purchase_requests pr
    WHERE pr.id = p_request_id
      AND (pr.buyer_id = v_uid OR pr.customer_email = v_email);

  IF v_request IS NULL THEN
    RETURN NULL;
  END IF;

  -- 2. Items + code + attempts (single pass)
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

  -- 3. Compensation requests (one query)
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

GRANT EXECUTE ON FUNCTION buyer_order_detail(uuid) TO authenticated;

-- ------------------------------------------------------------
-- 8. FIX N+1: list buyer orders with product titles (single query)
-- ------------------------------------------------------------
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
     OR (pr.buyer_id IS NULL AND pr.customer_email = auth.email())
  GROUP BY pr.id, pr.status, pr.total_amount, pr.currency, pr.amount_in_usd, pr.created_at
  ORDER BY pr.created_at DESC
  LIMIT 100
$$;

GRANT EXECUTE ON FUNCTION buyer_orders_list() TO authenticated;
