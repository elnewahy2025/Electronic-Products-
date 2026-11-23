-- ============================================================
-- 041_fix_view_row_scoping.sql
-- Fix C1/C2: views are boundary objects, not just projections.
--
-- Every view below is a SECURITY DEFINER view (Postgres default: it runs
-- as the view owner, which bypasses base-table RLS). The previous
-- definitions exposed FULL TABLES to every `authenticated` role.
--
-- We keep definer semantics deliberately (so guest orders - which have
-- orders.buyer_id NULL - remain visible through their customer_email),
-- but add an explicit row-level ownership predicate INSIDE each view.
-- This is the alternative fix documented in the audit: scope the rows
-- in the view itself rather than relying on base-table RLS.
--
-- Helper functions used here are SECURITY DEFINER and read the caller's
-- JWT claims via auth.uid() / auth.email(), so they work in a definer
-- view exactly as they do in an RLS policy.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Buyer-facing views (orders, codes, sessions)
-- ------------------------------------------------------------

DROP VIEW IF EXISTS buyer_orders_view CASCADE;
CREATE VIEW buyer_orders_view AS
SELECT
  pr.id AS purchase_request_id,
  pr.status,
  pr.total_amount,
  pr.currency,
  pr.amount_in_usd,
  pr.customer_email,
  pr.customer_phone,
  pr.created_at,
  pr.buyer_id,
  o.id AS order_id,
  o.status AS order_status
FROM purchase_requests pr
LEFT JOIN orders o ON o.purchase_request_id = pr.id
WHERE pr.buyer_id = auth.uid()
   OR (pr.customer_email IS NOT NULL AND lower(pr.customer_email::text) = lower(coalesce(auth.email(), '')))
   OR public.is_admin_or_above()
   OR public.staff_has('request.read.any');
GRANT SELECT ON buyer_orders_view TO authenticated;

DROP VIEW IF EXISTS buyer_codes_full CASCADE;
CREATE VIEW buyer_codes_full AS
SELECT
  pc.id AS code_id,
  pc.order_item_id,
  pc.code_prefix,
  pc.status AS code_status,
  pc.issued_at,
  pc.delivered_at,
  pc.redeemed_at,
  pc.expires_at,
  pc.replacement_for_code_id,
  cr.session_id,
  oi.product_id,
  p.title AS product_title,
  p.slug AS product_slug,
  pr.id AS purchase_request_id,
  pr.buyer_id,
  pr.customer_email
FROM purchase_codes pc
JOIN order_items oi ON oi.id = pc.order_item_id
JOIN orders o ON o.id = oi.order_id
JOIN purchase_requests pr ON pr.id = o.purchase_request_id
JOIN products p ON p.id = oi.product_id
LEFT JOIN code_redemptions cr ON cr.code_id = pc.id
WHERE pr.buyer_id = auth.uid()
   OR (pr.customer_email IS NOT NULL AND lower(pr.customer_email::text) = lower(coalesce(auth.email(), '')))
   OR public.is_admin_or_above()
   OR public.staff_has('code.read.any');
GRANT SELECT ON buyer_codes_full TO authenticated;

DROP VIEW IF EXISTS buyer_sessions_full CASCADE;
CREATE VIEW buyer_sessions_full AS
SELECT
  ds.id AS session_id,
  ds.status,
  ds.started_at,
  ds.expires_at,
  ds.ended_at,
  ds.is_compensation,
  ds.parent_session_id,
  ds.attempt_consumed,
  pc.id AS code_id,
  pc.code_prefix,
  oi.id AS order_item_id,
  oi.product_id,
  p.title AS product_title,
  p.slug AS product_slug,
  pr.id AS purchase_request_id,
  pr.buyer_id,
  pr.customer_email
FROM download_sessions ds
JOIN purchase_codes pc ON pc.id = ds.code_id
JOIN order_items oi ON oi.id = ds.order_item_id
JOIN orders o ON o.id = oi.order_id
JOIN purchase_requests pr ON pr.id = o.purchase_request_id
JOIN products p ON p.id = oi.product_id
WHERE pr.buyer_id = auth.uid()
   OR (pr.customer_email IS NOT NULL AND lower(pr.customer_email::text) = lower(coalesce(auth.email(), '')))
   OR public.is_admin_or_above()
   OR public.staff_has('download.session.revoke');
GRANT SELECT ON buyer_sessions_full TO authenticated;

-- ------------------------------------------------------------
-- 2. Other buyer-scoped views (unused by app today, but exposed)
-- ------------------------------------------------------------

DROP VIEW IF EXISTS buyer_codes_view CASCADE;
CREATE VIEW buyer_codes_view AS
SELECT pc.id, pc.order_item_id, pc.code_prefix, pc.status,
       pc.issued_at, pc.delivered_at, pc.expires_at, pc.redeemed_at,
       pc.replacement_for_code_id
FROM purchase_codes pc
WHERE public.buyer_owns_code(pc.id)
   OR public.is_admin_or_above()
   OR public.staff_has('code.read.any');
GRANT SELECT ON buyer_codes_view TO authenticated;

DROP VIEW IF EXISTS buyer_compensation_view CASCADE;
CREATE VIEW buyer_compensation_view AS
SELECT
  id, code_id, original_session_id, status,
  reason,
  CASE WHEN status = 'rejected' THEN admin_reason ELSE NULL END AS admin_reason,
  requested_at, decided_at, approved_session_id, sequence_number
FROM compensation_requests
WHERE public.buyer_owns_code(code_id)
   OR public.is_admin_or_above()
   OR public.staff_has('download.compensation.approve');
GRANT SELECT ON buyer_compensation_view TO authenticated;

-- ------------------------------------------------------------
-- 3. Seller/admin metadata views
--    These were also full-table projections. Scope them to the
--    owning seller (plus the admin/staff permissions already used
--    by their base-table RLS policies).
-- ------------------------------------------------------------

DROP VIEW IF EXISTS files_safe CASCADE;
CREATE VIEW files_safe AS
SELECT id, seller_id, original_name, display_name, mime, extension, created_at
FROM files
WHERE seller_id = auth.uid()
   OR public.is_admin_or_above()
   OR public.staff_has('file.quarantine');
GRANT SELECT ON files_safe TO authenticated;

DROP VIEW IF EXISTS file_versions_safe CASCADE;
CREATE VIEW file_versions_safe AS
SELECT id, file_id, version_number, size_bytes, checksum_sha256, mime, extension,
       scan_status, created_at
FROM file_versions
WHERE EXISTS (SELECT 1 FROM files f WHERE f.id = file_versions.file_id AND f.seller_id = auth.uid())
   OR public.is_admin_or_above()
   OR public.staff_has('file.quarantine');
GRANT SELECT ON file_versions_safe TO authenticated;

DROP VIEW IF EXISTS seller_drive_accounts_safe CASCADE;
CREATE VIEW seller_drive_accounts_safe AS
SELECT id, seller_id, google_account_email, scopes, status,
       quota_total, quota_used, last_checked_at, is_default, priority,
       created_at, updated_at
FROM seller_drive_accounts
WHERE seller_id = auth.uid()
   OR public.is_super_admin()
   OR public.is_admin_or_above()
   OR public.staff_has('seller.read');
GRANT SELECT ON seller_drive_accounts_safe TO authenticated;

DROP VIEW IF EXISTS upload_sessions_safe CASCADE;
CREATE VIEW upload_sessions_safe AS
SELECT id, seller_id, file_id, provider, drive_account_id,
       original_name, display_name, mime, extension,
       status, bytes_uploaded, total_bytes, expires_at, completed_at, created_at
FROM upload_sessions
WHERE seller_id = auth.uid()
   OR public.is_super_admin();
GRANT SELECT ON upload_sessions_safe TO authenticated;

DROP VIEW IF EXISTS seller_reviews_view CASCADE;
CREATE VIEW seller_reviews_view AS
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
WHERE p.deleted_at IS NULL
  AND (p.seller_id = auth.uid()
       OR public.is_admin_or_above()
       OR public.staff_has('review.delete'));
GRANT SELECT ON seller_reviews_view TO authenticated;

-- NOTE: storefront_products / seller_public_view are intentionally public
-- and already contain their own visibility clauses. They are unchanged.
