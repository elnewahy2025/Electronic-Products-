-- ============================================================
-- 028_seller_reviews.sql
-- Seller reply on reviews + aggregate stats
-- ============================================================

ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS seller_reply text,
  ADD COLUMN IF NOT EXISTS seller_replied_at timestamptz,
  ADD COLUMN IF NOT EXISTS seller_replied_by uuid REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reviews_product_published
  ON reviews(product_id, created_at DESC)
  WHERE status = 'published';

-- Trigger: only the owning seller (or admin) can set/edit the reply
CREATE OR REPLACE FUNCTION restrict_review_reply() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_seller uuid;
BEGIN
  IF NEW.seller_reply IS DISTINCT FROM OLD.seller_reply
     OR NEW.seller_replied_at IS DISTINCT FROM OLD.seller_replied_at
     OR NEW.seller_replied_by IS DISTINCT FROM OLD.seller_replied_by THEN

    SELECT p.seller_id INTO v_seller
    FROM products p WHERE p.id = NEW.product_id;

    IF NOT (is_admin_or_above() OR staff_has('review.reply') OR v_seller = auth.uid()) THEN
      RAISE EXCEPTION 'not_authorized_for_reply';
    END IF;

    IF NEW.seller_reply IS NOT NULL AND length(NEW.seller_reply) > 2000 THEN
      RAISE EXCEPTION 'reply_too_long';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restrict_review_reply ON reviews;
CREATE TRIGGER trg_restrict_review_reply
  BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION restrict_review_reply();

-- Seller reviews view (SECURITY INVOKER → inherits RLS)
-- Ensure owning seller can also SELECT their product's deleted reviews
DROP POLICY IF EXISTS reviews_read ON reviews;
CREATE POLICY reviews_read ON reviews FOR SELECT
  USING (
    status = 'published'
    OR buyer_id = auth.uid()
    OR seller_owns_product(product_id)
    OR staff_has('review.delete')
    OR is_admin_or_above()
  );

CREATE OR REPLACE VIEW seller_reviews_view AS
SELECT
  r.id,
  r.product_id,
  r.buyer_id,
  r.rating,
  r.body,
  r.status,
  r.created_at,
  r.seller_reply,
  r.seller_replied_at,
  r.deleted_by,
  r.delete_reason,
  p.title AS product_title,
  p.slug AS product_slug,
  p.seller_id
FROM reviews r
JOIN products p ON p.id = r.product_id
WHERE p.deleted_at IS NULL;

GRANT SELECT ON seller_reviews_view TO authenticated;

-- Aggregate stats per product (only seller-owned products)
CREATE OR REPLACE FUNCTION seller_review_stats(p_seller_id uuid DEFAULT NULL)
RETURNS TABLE (
  product_id uuid,
  product_title text,
  total_reviews bigint,
  avg_rating numeric,
  r5 bigint,
  r4 bigint,
  r3 bigint,
  r2 bigint,
  r1 bigint,
  replied_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH target_seller AS (
    SELECT COALESCE(p_seller_id, auth.uid()) AS seller_id
  ),
  base AS (
    SELECT r.*, p.title AS product_title
    FROM reviews r
    JOIN products p ON p.id = r.product_id
    WHERE p.seller_id = (SELECT seller_id FROM target_seller)
      AND r.status = 'published'
  )
  SELECT
    b.product_id,
    b.product_title,
    COUNT(*)::bigint AS total_reviews,
    ROUND(AVG(b.rating)::numeric, 2) AS avg_rating,
    COUNT(*) FILTER (WHERE b.rating = 5)::bigint AS r5,
    COUNT(*) FILTER (WHERE b.rating = 4)::bigint AS r4,
    COUNT(*) FILTER (WHERE b.rating = 3)::bigint AS r3,
    COUNT(*) FILTER (WHERE b.rating = 2)::bigint AS r2,
    COUNT(*) FILTER (WHERE b.rating = 1)::bigint AS r1,
    COUNT(*) FILTER (WHERE b.seller_reply IS NOT NULL)::bigint AS replied_count
  FROM base b
  GROUP BY b.product_id, b.product_title
  ORDER BY total_reviews DESC
$$;

GRANT EXECUTE ON FUNCTION seller_review_stats(uuid) TO authenticated;
