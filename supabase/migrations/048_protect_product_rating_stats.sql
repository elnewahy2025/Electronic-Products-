-- 048_protect_product_rating_stats.sql
-- M6: the materialized rating snapshot is a derived, system-owned table.
-- It is read by the storefront and refreshed only by the rating trigger.
-- Without RLS / revoked writes, any anon or authenticated PostgREST client
-- could forge avg_rating / review_count and poison search ranking.

ALTER TABLE product_rating_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_rating_stats_read_published ON product_rating_stats;
CREATE POLICY product_rating_stats_read_published
  ON product_rating_stats FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM products p
      WHERE p.id = product_rating_stats.product_id
        AND p.status = 'published'
    )
  );

-- Only the SECURITY DEFINER refresh function (owned by postgres) and
-- service_role may write. Direct DML from clients is denied by RLS anyway,
-- but revoke explicit grants so the privilege surface is unambiguous.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON product_rating_stats FROM PUBLIC, anon, authenticated;
GRANT SELECT ON product_rating_stats TO anon, authenticated;

-- The refresh function only recomputes the snapshot from real reviews, so it
-- cannot forge values. It is invoked by the reviews trigger as the writing
-- role, which needs EXECUTE; leave its default PUBLIC grant in place.
