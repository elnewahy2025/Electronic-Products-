-- ============================================================
-- 056_category_covers.sql
-- Optional cover artwork for storefront categories.
-- When no cover is set, the storefront renders deterministic
-- subject-appropriate artwork from the category name/slug.
-- ============================================================

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS cover_image_url text,
  ADD COLUMN IF NOT EXISTS cover_storage_path text;

-- New columns are appended so CREATE OR REPLACE VIEW keeps the existing
-- column order for consumers of storefront_categories.
CREATE OR REPLACE VIEW storefront_categories AS
SELECT
  c.id, c.name, c.slug, c.parent_id, c.sort_order,
  (SELECT COUNT(*) FROM products p
    WHERE p.category_id = c.id AND p.status = 'published') AS product_count,
  c.cover_image_url
FROM categories c
WHERE c.is_active = true;

GRANT SELECT ON storefront_categories TO anon, authenticated;

-- Make the new column visible to PostgREST immediately.
NOTIFY pgrst, 'reload schema';
