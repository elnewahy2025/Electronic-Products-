-- ============================================================
-- 025_categories_admin.sql
-- Safe category management operations
-- ============================================================

-- Prevent a category from becoming its own ancestor
CREATE OR REPLACE FUNCTION category_would_create_cycle(
  p_category_id uuid,
  p_new_parent_id uuid
) RETURNS boolean
LANGUAGE plpgsql STABLE AS $$
BEGIN
  IF p_new_parent_id IS NULL THEN RETURN false; END IF;
  IF p_category_id = p_new_parent_id THEN RETURN true; END IF;

  -- Walk up from new_parent to root; if we hit p_category, we have a cycle
  RETURN EXISTS (
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_id FROM categories WHERE id = p_new_parent_id
      UNION ALL
      SELECT c.id, c.parent_id
      FROM categories c
      JOIN ancestors a ON c.id = a.parent_id
    )
    SELECT 1 FROM ancestors WHERE id = p_category_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION category_would_create_cycle(uuid, uuid) TO authenticated;

-- Set parent safely (with cycle check)
CREATE OR REPLACE FUNCTION set_category_parent(
  p_category_id uuid,
  p_parent_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF category_would_create_cycle(p_category_id, p_parent_id) THEN
    RAISE EXCEPTION 'category_cycle_detected';
  END IF;

  UPDATE categories
    SET parent_id = p_parent_id,
        updated_at = now()
    WHERE id = p_category_id;

  PERFORM log_audit('category.updated', 'categories', p_category_id,
    NULL, jsonb_build_object('parent_id', p_parent_id), NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION set_category_parent(uuid, uuid) TO authenticated, service_role;

-- Delete a category safely.
-- Mode 'reassign': move children + products to fallback (or null)
-- Mode 'block': refuse if anything is attached
CREATE OR REPLACE FUNCTION delete_category_safe(
  p_category_id uuid,
  p_mode text,                -- 'reassign' | 'block'
  p_fallback_category_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_child_count int;
  v_product_count int;
  v_slug text;
BEGIN
  IF p_mode NOT IN ('reassign','block') THEN
    RAISE EXCEPTION 'invalid_mode';
  END IF;

  IF p_fallback_category_id = p_category_id THEN
    RAISE EXCEPTION 'invalid_fallback';
  END IF;

  IF p_fallback_category_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM categories WHERE id = p_fallback_category_id) THEN
      RAISE EXCEPTION 'fallback_not_found';
    END IF;
    IF category_would_create_cycle(p_category_id, p_fallback_category_id) THEN
      RAISE EXCEPTION 'fallback_inside_subtree';
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_child_count
    FROM categories WHERE parent_id = p_category_id;

  SELECT COUNT(*) INTO v_product_count
    FROM products WHERE category_id = p_category_id AND status <> 'deleted';

  IF p_mode = 'block' AND (v_child_count > 0 OR v_product_count > 0) THEN
    RAISE EXCEPTION 'category_has_dependents: children=% products=%', v_child_count, v_product_count;
  END IF;

  SELECT slug INTO v_slug FROM categories WHERE id = p_category_id;
  IF v_slug IS NULL THEN
    RAISE EXCEPTION 'category_not_found';
  END IF;

  -- Reassign children to fallback (or detach)
  IF v_child_count > 0 THEN
    UPDATE categories SET parent_id = p_fallback_category_id WHERE parent_id = p_category_id;
  END IF;

  -- Reassign products to fallback (or detach)
  IF v_product_count > 0 THEN
    UPDATE products SET category_id = p_fallback_category_id WHERE category_id = p_category_id;
  END IF;

  DELETE FROM categories WHERE id = p_category_id;

  PERFORM log_audit('category.deleted', 'categories', p_category_id,
    jsonb_build_object('slug', v_slug, 'children', v_child_count, 'products', v_product_count),
    jsonb_build_object('mode', p_mode, 'fallback', p_fallback_category_id), NULL);

  RETURN jsonb_build_object(
    'reassigned_children', v_child_count,
    'reassigned_products', v_product_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION delete_category_safe(uuid, text, uuid) TO authenticated, service_role;

-- Bulk reorder siblings
CREATE OR REPLACE FUNCTION reorder_categories(p_order jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item jsonb;
BEGIN
  -- p_order is [{ "id": "...", "sort_order": 0 }, ...]
  FOR v_item IN SELECT jsonb_array_elements(p_order) LOOP
    UPDATE categories
      SET sort_order = (v_item->>'sort_order')::int,
          updated_at = now()
      WHERE id = (v_item->>'id')::uuid;
  END LOOP;

  PERFORM log_audit('category.reordered', 'categories', NULL, NULL,
    jsonb_build_object('count', jsonb_array_length(p_order)), NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION reorder_categories(jsonb) TO authenticated, service_role;

-- Ensure updated_at trigger exists (idempotent)
CREATE OR REPLACE FUNCTION set_updated_at_categories() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_categories_updated_at ON categories;
CREATE TRIGGER trg_categories_updated_at
  BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_categories();

-- Add updated_at column if missing
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'categories' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE categories ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;