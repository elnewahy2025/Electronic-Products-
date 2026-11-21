-- ============================================================
-- 018_storefront_search.sql
-- Optimized search functions + view
-- ============================================================

-- Arabic-friendly search (normalizes alef/hamza forms, strips diacritics)
CREATE OR REPLACE FUNCTION normalize_arabic(txt text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          coalesce(txt, ''),
          '[إأآا]', 'ا', 'g'
        ),
        '[ىي]', 'ي', 'g'
      ),
      '[\u064B-\u0652\u0670\u0640]', '', 'g'  -- tashkeel + tatweel
    )
  )
$$;

-- Public search view (only published products)
CREATE OR REPLACE VIEW storefront_products AS
SELECT
  p.id,
  p.title,
  p.slug,
  p.short_description,
  p.price_amount,
  p.price_currency,
  p.published_at,
  p.category_id,
  p.seller_id,
  sp.display_name AS seller_display_name,
  c.name AS category_name,
  c.slug AS category_slug,
  COALESCE(
    (SELECT AVG(r.rating)::numeric(3,1)
     FROM reviews r
     WHERE r.product_id = p.id AND r.status = 'published'),
    0
  ) AS rating_avg,
  (SELECT COUNT(*) FROM reviews r
   WHERE r.product_id = p.id AND r.status = 'published') AS rating_count,
  normalize_arabic(p.title || ' ' || coalesce(p.short_description, '') || ' ' || coalesce(p.description, '')) AS search_text
FROM products p
JOIN seller_profiles sp ON sp.profile_id = p.seller_id AND sp.status = 'approved'
LEFT JOIN categories c ON c.id = p.category_id
WHERE p.status = 'published';

GRANT SELECT ON storefront_products TO anon, authenticated;

-- Search RPC with Arabic normalization + filters + pagination
CREATE OR REPLACE FUNCTION search_storefront(
  p_query text DEFAULT NULL,
  p_category_slug text DEFAULT NULL,
  p_seller_id uuid DEFAULT NULL,
  p_min_price numeric DEFAULT NULL,
  p_max_price numeric DEFAULT NULL,
  p_sort text DEFAULT 'newest',  -- newest | price_asc | price_desc | rating | popular
  p_limit int DEFAULT 24,
  p_offset int DEFAULT 0
) RETURNS TABLE (
  id uuid,
  title text,
  slug text,
  short_description text,
  price_amount numeric,
  price_currency char(3),
  published_at timestamptz,
  seller_id uuid,
  seller_display_name text,
  category_name text,
  category_slug text,
  rating_avg numeric,
  rating_count bigint,
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_q text;
BEGIN
  v_q := normalize_arabic(p_query);

  RETURN QUERY
  WITH filtered AS (
    SELECT sp.*
    FROM storefront_products sp
    WHERE
      (v_q IS NULL OR v_q = '' OR sp.search_text ILIKE '%' || v_q || '%')
      AND (p_category_slug IS NULL OR sp.category_slug = p_category_slug)
      AND (p_seller_id IS NULL OR sp.seller_id = p_seller_id)
      AND (p_min_price IS NULL OR sp.price_amount >= p_min_price)
      AND (p_max_price IS NULL OR sp.price_amount <= p_max_price)
  ),
  counted AS (
    SELECT COUNT(*) AS total FROM filtered
  )
  SELECT
    f.id, f.title, f.slug, f.short_description, f.price_amount, f.price_currency,
    f.published_at, f.seller_id, f.seller_display_name,
    f.category_name, f.category_slug, f.rating_avg, f.rating_count,
    c.total
  FROM filtered f, counted c
  ORDER BY
    CASE p_sort
      WHEN 'price_asc' THEN f.price_amount
      WHEN 'price_desc' THEN -f.price_amount
      ELSE NULL
    END ASC NULLS LAST,
    CASE p_sort
      WHEN 'rating' THEN f.rating_avg
      WHEN 'popular' THEN f.rating_count::numeric
      ELSE NULL
    END DESC NULLS LAST,
    f.published_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION search_storefront TO anon, authenticated;

-- Categories with product counts
CREATE OR REPLACE VIEW storefront_categories AS
SELECT
  c.id, c.name, c.slug, c.parent_id, c.sort_order,
  (SELECT COUNT(*) FROM products p
   WHERE p.category_id = c.id AND p.status = 'published') AS product_count
FROM categories c
WHERE c.is_active = true;

GRANT SELECT ON storefront_categories TO anon, authenticated;

-- Suggested categories (top 8 with products)
CREATE OR REPLACE VIEW storefront_top_categories AS
SELECT id, name, slug, product_count
FROM storefront_categories
WHERE product_count > 0
ORDER BY product_count DESC, sort_order ASC
LIMIT 8;

GRANT SELECT ON storefront_top_categories TO anon, authenticated;