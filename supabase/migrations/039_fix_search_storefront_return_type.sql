-- ============================================================
-- 039_fix_search_storefront_return_type.sql
-- Cast rating_count::bigint in search_storefront() to match RETURNS TABLE
-- ============================================================

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
  cover_image_url text,
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_q text := trim(coalesce(p_query, ''));
  v_has_query boolean := length(v_q) > 0;
BEGIN
  RETURN QUERY
  WITH filtered AS (
    SELECT sp.*
    FROM storefront_products sp
    WHERE
      (NOT v_has_query OR sp.search_text % v_q OR sp.search_text ILIKE '%' || v_q || '%')
      AND (p_category_slug IS NULL OR sp.category_slug = p_category_slug)
      AND (p_seller_id IS NULL OR sp.seller_id = p_seller_id)
      AND (p_min_price IS NULL OR sp.price_amount >= p_min_price)
      AND (p_max_price IS NULL OR sp.price_amount <= p_max_price)
  ),
  counted AS (SELECT COUNT(*) AS total FROM filtered)
  SELECT
    f.id, f.title, f.slug, f.short_description, f.price_amount, f.price_currency,
    f.published_at, f.seller_id, f.seller_display_name, f.category_name, f.category_slug,
    f.rating_avg::numeric, f.rating_count::bigint, f.cover_image_url, c.total
  FROM filtered f, counted c
  ORDER BY
    CASE p_sort WHEN 'price_asc' THEN f.price_amount WHEN 'price_desc' THEN -f.price_amount ELSE NULL END ASC NULLS LAST,
    CASE p_sort WHEN 'rating' THEN f.rating_avg WHEN 'popular' THEN f.rating_count::numeric ELSE NULL END DESC NULLS LAST,
    f.published_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION search_storefront(text, text, uuid, numeric, numeric, text, int, int) TO anon, authenticated;
