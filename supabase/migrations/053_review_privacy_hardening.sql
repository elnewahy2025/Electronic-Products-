-- 053_review_privacy_hardening.sql
-- L7: aggregate stats must not be readable for an arbitrary seller id.
-- L9: only admins/staff with review.delete may soft-delete a review.

CREATE OR REPLACE FUNCTION public.seller_review_stats(p_seller_id uuid DEFAULT NULL)
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
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_seller uuid;
BEGIN
  v_seller := COALESCE(p_seller_id, auth.uid());
  IF v_seller IS NULL THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_seller_id IS NOT NULL
     AND p_seller_id <> auth.uid()
     AND NOT public.is_admin_or_above()
     AND NOT public.staff_has('review.delete') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT r.rating, r.seller_reply, p.title AS product_title, p.id AS product_id
    FROM public.reviews r
    JOIN public.products p ON p.id = r.product_id
    WHERE p.seller_id = v_seller
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
  ORDER BY total_reviews DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.seller_review_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seller_review_stats(uuid) TO authenticated;

-- L9: sellers may still edit/remove their own reply, but only admins/staff may
-- soft-delete a review. Row-level access stays broad enough for reply edits;
-- a trigger enforces the privilege boundary on the moderation columns.
DROP POLICY IF EXISTS reviews_soft_delete ON reviews;
CREATE POLICY reviews_soft_delete ON reviews FOR UPDATE
  USING (public.is_admin_or_above() OR public.staff_has('review.delete')
         OR EXISTS (SELECT 1 FROM public.products p
                    WHERE p.id = reviews.product_id AND p.seller_id = auth.uid()))
  WITH CHECK (public.is_admin_or_above() OR public.staff_has('review.delete')
              OR EXISTS (SELECT 1 FROM public.products p
                         WHERE p.id = reviews.product_id AND p.seller_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.restrict_review_soft_delete() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
     OR NEW.deleted_by IS DISTINCT FROM OLD.deleted_by
     OR NEW.delete_reason IS DISTINCT FROM OLD.delete_reason THEN
    IF NOT (
      public.is_admin_or_above()
      OR public.staff_has('review.delete')
      OR auth.role() = 'service_role'
    ) THEN
      RAISE EXCEPTION 'review_delete_forbidden';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restrict_review_soft_delete ON reviews;
CREATE TRIGGER trg_restrict_review_soft_delete
  BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION public.restrict_review_soft_delete();
