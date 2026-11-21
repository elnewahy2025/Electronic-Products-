-- ============================================================
-- 029_storefront_ux.sql
-- Cover image + gallery + updated storefront view
-- ============================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS cover_image_url text;

CREATE TABLE IF NOT EXISTS product_gallery_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_gallery_url_not_empty CHECK (length(trim(url)) > 5)
);

CREATE INDEX IF NOT EXISTS idx_gallery_product
  ON product_gallery_images(product_id, sort_order);

ALTER TABLE product_gallery_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY gallery_public_read ON product_gallery_images FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM products p WHERE p.id = product_gallery_images.product_id AND p.status = 'published')
    OR is_admin_or_above()
    OR EXISTS (SELECT 1 FROM products p WHERE p.id = product_gallery_images.product_id AND p.seller_id = auth.uid())
  );

CREATE POLICY gallery_seller_write ON product_gallery_images FOR ALL
  USING (
    EXISTS (SELECT 1 FROM products p WHERE p.id = product_gallery_images.product_id AND p.seller_id = auth.uid())
    OR is_admin_or_above()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM products p WHERE p.id = product_gallery_images.product_id AND p.seller_id = auth.uid())
    OR is_admin_or_above()
  );

-- Cap at 8 images per product (trigger)
CREATE OR REPLACE FUNCTION limit_gallery_images() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
    FROM product_gallery_images WHERE product_id = NEW.product_id;
  IF v_count >= 8 THEN
    RAISE EXCEPTION 'gallery_limit_reached: max 8 images';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_limit_gallery ON product_gallery_images;
CREATE TRIGGER trg_limit_gallery
  BEFORE INSERT ON product_gallery_images
  FOR EACH ROW EXECUTE FUNCTION limit_gallery_images();

-- Rebuild storefront view with cover image
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
  COALESCE(
    (SELECT AVG(r.rating)::numeric(3,1)
     FROM reviews r WHERE r.product_id = p.id AND r.status = 'published'),
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

-- Update search_storefront RPC to return cover_image_url
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
DECLARE v_q text;
BEGIN
  v_q := normalize_arabic(p_query);
  RETURN QUERY
  WITH filtered AS (
    SELECT sp.* FROM storefront_products sp
    WHERE (v_q IS NULL OR v_q = '' OR sp.search_text ILIKE '%' || v_q || '%')
      AND (p_category_slug IS NULL OR sp.category_slug = p_category_slug)
      AND (p_seller_id IS NULL OR sp.seller_id = p_seller_id)
      AND (p_min_price IS NULL OR sp.price_amount >= p_min_price)
      AND (p_max_price IS NULL OR sp.price_amount <= p_max_price)
  ), counted AS (SELECT COUNT(*) AS total FROM filtered)
  SELECT f.id, f.title, f.slug, f.short_description, f.price_amount, f.price_currency,
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
