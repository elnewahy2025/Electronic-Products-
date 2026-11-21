-- ============================================================
-- 011_rls_policies.sql
-- ============================================================

-- Enable RLS on ALL tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_drive_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_storage_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_version_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_previews ENABLE ROW LEVEL SECURITY;
ALTER TABLE upload_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE scan_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE quarantine_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE allowed_file_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE code_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE code_delivery_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE download_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE download_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE download_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE download_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE compensation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE attempt_exception_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_archives ENABLE ROW LEVEL SECURITY;
ALTER TABLE restore_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_archives ENABLE ROW LEVEL SECURITY;
ALTER TABLE general_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE download_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE compensation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE attempt_exception_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE watermark_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_settings ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- profiles
-- ============================================================
CREATE POLICY profiles_self_select ON profiles FOR SELECT
  USING (auth.uid() = id OR is_admin_or_above() OR staff_has('staff.user.read'));
CREATE POLICY profiles_self_update ON profiles FOR UPDATE
  USING (auth.uid() = id OR is_super_admin())
  WITH CHECK (auth.uid() = id OR is_super_admin());

-- ============================================================
-- roles / permissions / store_members / member_permissions
-- ============================================================
CREATE POLICY roles_read ON roles FOR SELECT USING (true);
CREATE POLICY roles_write ON roles FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY permissions_read ON permissions FOR SELECT USING (true);
CREATE POLICY permissions_write ON permissions FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY role_permissions_read ON role_permissions FOR SELECT USING (true);
CREATE POLICY role_permissions_write ON role_permissions FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY store_members_self_read ON store_members FOR SELECT
  USING (profile_id = auth.uid() OR is_admin_or_above());
CREATE POLICY store_members_write ON store_members FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY member_permissions_self_read ON member_permissions FOR SELECT
  USING (member_id = auth.uid() OR is_admin_or_above());
CREATE POLICY member_permissions_write ON member_permissions FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

-- ============================================================
-- seller_profiles
-- ============================================================
CREATE POLICY seller_profiles_read ON seller_profiles FOR SELECT
  USING (profile_id = auth.uid() OR is_admin_or_above() OR staff_has('seller.read') OR status = 'approved');
CREATE POLICY seller_profiles_insert_self ON seller_profiles FOR INSERT
  WITH CHECK (profile_id = auth.uid());
CREATE POLICY seller_profiles_update_self ON seller_profiles FOR UPDATE
  USING (profile_id = auth.uid() OR staff_has('seller.approve') OR staff_has('seller.suspend') OR is_admin_or_above())
  WITH CHECK (profile_id = auth.uid() OR staff_has('seller.approve') OR staff_has('seller.suspend') OR is_admin_or_above());

-- ============================================================
-- seller_applications / seller_agreements
-- ============================================================
CREATE POLICY seller_applications_read ON seller_applications FOR SELECT
  USING (profile_id = auth.uid() OR is_admin_or_above() OR staff_has('seller.read'));
CREATE POLICY seller_applications_insert_self ON seller_applications FOR INSERT
  WITH CHECK (profile_id = auth.uid());
CREATE POLICY seller_applications_update_staff ON seller_applications FOR UPDATE
  USING (is_admin_or_above() OR staff_has('seller.approve'));

CREATE POLICY seller_agreements_read ON seller_agreements FOR SELECT
  USING (profile_id = auth.uid() OR is_admin_or_above() OR staff_has('seller.read'));
CREATE POLICY seller_agreements_insert_self ON seller_agreements FOR INSERT
  WITH CHECK (profile_id = auth.uid());

-- ============================================================
-- seller_drive_accounts
-- ============================================================
CREATE POLICY drive_accounts_read ON seller_drive_accounts FOR SELECT
  USING (seller_id = auth.uid() OR is_super_admin());
CREATE POLICY drive_accounts_insert_self ON seller_drive_accounts FOR INSERT
  WITH CHECK (seller_id = auth.uid());
CREATE POLICY drive_accounts_update_self ON seller_drive_accounts FOR UPDATE
  USING (seller_id = auth.uid() OR is_super_admin())
  WITH CHECK (seller_id = auth.uid() OR is_super_admin());
CREATE POLICY drive_accounts_delete_self ON seller_drive_accounts FOR DELETE
  USING (seller_id = auth.uid());

-- ============================================================
-- categories
-- ============================================================
CREATE POLICY categories_read ON categories FOR SELECT USING (is_active = true OR staff_has('category.manage') OR is_admin_or_above());
CREATE POLICY categories_write ON categories FOR ALL
  USING (staff_has('category.manage') OR is_admin_or_above())
  WITH CHECK (staff_has('category.manage') OR is_admin_or_above());

-- ============================================================
-- products
-- ============================================================
CREATE POLICY products_read ON products FOR SELECT
  USING (status = 'published' OR seller_id = auth.uid() OR staff_has('product.read.any') OR is_admin_or_above());
CREATE POLICY products_insert_seller ON products FOR INSERT
  WITH CHECK (seller_id = auth.uid() AND is_approved_seller());
CREATE POLICY products_update ON products FOR UPDATE
  USING (seller_id = auth.uid() OR staff_has('product.suspend') OR is_admin_or_above())
  WITH CHECK (seller_id = auth.uid() OR staff_has('product.suspend') OR is_admin_or_above());
CREATE POLICY products_delete ON products FOR DELETE
  USING ((seller_id = auth.uid() AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.product_id = products.id))
         OR staff_has('product.delete.any') OR is_admin_or_above());

-- ============================================================
-- product_versions
-- ============================================================
CREATE POLICY product_versions_read ON product_versions FOR SELECT
  USING (status = 'published' OR seller_owns_product(product_id) OR staff_has('product.read.any') OR is_admin_or_above());
CREATE POLICY product_versions_write ON product_versions FOR ALL
  USING (seller_owns_product(product_id))
  WITH CHECK (seller_owns_product(product_id));

-- ============================================================
-- files / file_versions / file_storage_locations
-- ============================================================
CREATE POLICY files_read ON files FOR SELECT
  USING (seller_id = auth.uid() OR is_admin_or_above() OR staff_has('file.quarantine'));
CREATE POLICY files_insert ON files FOR INSERT
  WITH CHECK (seller_id = auth.uid() AND is_approved_seller());
CREATE POLICY files_update ON files FOR UPDATE
  USING (seller_id = auth.uid() OR is_admin_or_above());
CREATE POLICY files_delete ON files FOR DELETE
  USING (seller_id = auth.uid() AND NOT EXISTS (
    SELECT 1 FROM product_version_files pvf WHERE pvf.file_version_id IN (SELECT id FROM file_versions WHERE file_id = files.id)
  ));

CREATE POLICY file_versions_read ON file_versions FOR SELECT
  USING (EXISTS (SELECT 1 FROM files f WHERE f.id = file_versions.file_id AND f.seller_id = auth.uid())
         OR is_admin_or_above() OR staff_has('file.quarantine'));
CREATE POLICY file_versions_write ON file_versions FOR ALL
  USING (EXISTS (SELECT 1 FROM files f WHERE f.id = file_versions.file_id AND f.seller_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM files f WHERE f.id = file_versions.file_id AND f.seller_id = auth.uid()));

-- storage locations are NEVER readable by client; only server/service_role
CREATE POLICY storage_locations_no_client_read ON file_storage_locations FOR SELECT USING (false);

-- ============================================================
-- product_version_files
-- ============================================================
CREATE POLICY pvf_read ON product_version_files FOR SELECT
  USING (EXISTS (SELECT 1 FROM product_versions pv WHERE pv.id = product_version_files.product_version_id AND pv.status = 'published')
         OR seller_owns_product((SELECT product_id FROM product_versions WHERE id = product_version_files.product_version_id))
         OR is_admin_or_above());
CREATE POLICY pvf_write ON product_version_files FOR ALL
  USING (seller_owns_product((SELECT product_id FROM product_versions WHERE id = product_version_files.product_version_id)))
  WITH CHECK (seller_owns_product((SELECT product_id FROM product_versions WHERE id = product_version_files.product_version_id)));

-- ============================================================
-- file_previews
-- ============================================================
CREATE POLICY previews_read ON file_previews FOR SELECT
  USING (status = 'ready' OR seller_owns_file((SELECT file_id FROM file_versions WHERE id = file_previews.file_version_id))
         OR is_admin_or_above() OR staff_has('file.preview.regenerate'));
CREATE POLICY previews_write ON file_previews FOR ALL
  USING (seller_owns_file((SELECT file_id FROM file_versions WHERE id = file_previews.file_version_id)) OR is_admin_or_above())
  WITH CHECK (seller_owns_file((SELECT file_id FROM file_versions WHERE id = file_previews.file_version_id)) OR is_admin_or_above());

-- ============================================================
-- upload_sessions / scan_jobs / quarantine_records
-- ============================================================
CREATE POLICY upload_sessions_owner ON upload_sessions FOR ALL
  USING (seller_id = auth.uid())
  WITH CHECK (seller_id = auth.uid());

CREATE POLICY scan_jobs_read ON scan_jobs FOR SELECT
  USING (EXISTS (SELECT 1 FROM file_versions fv JOIN files f ON f.id = fv.file_id WHERE fv.id = scan_jobs.file_version_id AND f.seller_id = auth.uid())
         OR is_admin_or_above() OR staff_has('file.quarantine'));
CREATE POLICY scan_jobs_service_write ON scan_jobs FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY quarantine_read ON quarantine_records FOR SELECT
  USING (EXISTS (SELECT 1 FROM file_versions fv JOIN files f ON f.id = fv.file_id WHERE fv.id = quarantine_records.file_version_id AND f.seller_id = auth.uid())
         OR is_admin_or_above() OR staff_has('file.quarantine'));
CREATE POLICY quarantine_write ON quarantine_records FOR ALL
  USING (staff_has('file.quarantine') OR is_admin_or_above())
  WITH CHECK (staff_has('file.quarantine') OR is_admin_or_above());

-- ============================================================
-- allowed_file_types / tags / product_tags
-- ============================================================
CREATE POLICY aft_read ON allowed_file_types FOR SELECT USING (true);
CREATE POLICY aft_write ON allowed_file_types FOR ALL
  USING (is_admin_or_above() OR staff_has('filetype.manage'))
  WITH CHECK (is_admin_or_above() OR staff_has('filetype.manage'));

CREATE POLICY tags_read ON tags FOR SELECT USING (true);
CREATE POLICY tags_write ON tags FOR ALL
  USING (staff_has('category.manage') OR is_admin_or_above())
  WITH CHECK (staff_has('category.manage') OR is_admin_or_above());

CREATE POLICY product_tags_read ON product_tags FOR SELECT USING (true);
CREATE POLICY product_tags_write ON product_tags FOR ALL
  USING (seller_owns_product(product_id))
  WITH CHECK (seller_owns_product(product_id));

-- ============================================================
-- purchase_requests
-- ============================================================
CREATE POLICY pr_read ON purchase_requests FOR SELECT
  USING (buyer_id = auth.uid() OR customer_email = auth.email()
         OR staff_has('request.read.any') OR is_admin_or_above());
CREATE POLICY pr_insert ON purchase_requests FOR INSERT
  WITH CHECK (buyer_id = auth.uid() OR buyer_id IS NULL);
CREATE POLICY pr_update ON purchase_requests FOR UPDATE
  USING (buyer_id = auth.uid() OR staff_has('request.read.any') OR is_admin_or_above())
  WITH CHECK (buyer_id = auth.uid() OR staff_has('request.read.any') OR is_admin_or_above());

CREATE POLICY pri_read ON purchase_request_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM purchase_requests pr WHERE pr.id = purchase_request_items.purchase_request_id
                 AND (pr.buyer_id = auth.uid() OR pr.customer_email = auth.email() OR staff_has('request.read.any') OR is_admin_or_above())));

CREATE POLICY orders_read ON orders FOR SELECT
  USING (buyer_id = auth.uid() OR staff_has('request.read.any') OR is_admin_or_above());

CREATE POLICY order_items_read ON order_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_items.order_id
                 AND (o.buyer_id = auth.uid() OR staff_has('request.read.any') OR is_admin_or_above())));

-- ============================================================
-- purchase_codes / code_redemptions / code_delivery_attempts
-- ============================================================
CREATE POLICY codes_read ON purchase_codes FOR SELECT
  USING (buyer_owns_code(id) OR staff_has('code.read.any') OR is_admin_or_above());
CREATE POLICY codes_insert ON purchase_codes FOR INSERT
  WITH CHECK (staff_has('code.issue') OR is_admin_or_above());
CREATE POLICY codes_update ON purchase_codes FOR UPDATE
  USING (staff_has('code.issue') OR staff_has('code.confirm_delivery') OR is_admin_or_above())
  WITH CHECK (staff_has('code.issue') OR staff_has('code.confirm_delivery') OR is_admin_or_above());

CREATE POLICY redemptions_read ON code_redemptions FOR SELECT
  USING (buyer_owns_code(code_id) OR staff_has('code.read.any') OR is_admin_or_above());

CREATE POLICY delivery_attempts_read ON code_delivery_attempts FOR SELECT
  USING (buyer_owns_code(code_id) OR staff_has('code.read.any') OR is_admin_or_above());
CREATE POLICY delivery_attempts_insert ON code_delivery_attempts FOR INSERT
  WITH CHECK (staff_has('code.confirm_delivery') OR is_admin_or_above());

-- ============================================================
-- download_sessions / tokens / attempts / deliveries
-- ============================================================
CREATE POLICY sessions_read ON download_sessions FOR SELECT
  USING (buyer_owns_session(id) OR staff_has('download.session.revoke') OR is_admin_or_above());
CREATE POLICY sessions_update ON download_sessions FOR UPDATE
  USING (staff_has('download.session.extend') OR staff_has('download.session.revoke') OR is_admin_or_above())
  WITH CHECK (staff_has('download.session.extend') OR staff_has('download.session.revoke') OR is_admin_or_above());

-- tokens are never readable by client
CREATE POLICY tokens_no_client ON download_tokens FOR SELECT USING (false);

CREATE POLICY attempts_read ON download_attempts FOR SELECT
  USING (buyer_owns_order_item(order_item_id) OR staff_has('download.session.revoke') OR is_admin_or_above());

CREATE POLICY deliveries_read ON download_deliveries FOR SELECT
  USING (buyer_owns_session(session_id) OR staff_has('download.session.revoke') OR is_admin_or_above());

-- ============================================================
-- compensation_requests / attempt_exception_requests
-- ============================================================
CREATE POLICY comp_read ON compensation_requests FOR SELECT
  USING (buyer_owns_code(code_id) OR staff_has('download.compensation.approve') OR is_admin_or_above());
CREATE POLICY comp_insert ON compensation_requests FOR INSERT
  WITH CHECK (staff_has('download.compensation.request') OR is_admin_or_above());
CREATE POLICY comp_update ON compensation_requests FOR UPDATE
  USING (staff_has('download.compensation.approve') OR is_admin_or_above())
  WITH CHECK (staff_has('download.compensation.approve') OR is_admin_or_above());

CREATE POLICY aee_all_super_only ON attempt_exception_requests FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- ============================================================
-- finance
-- ============================================================
CREATE POLICY fx_read ON exchange_rates FOR SELECT
  USING (is_admin_or_above() OR staff_has('exchange_rate.manage'));
CREATE POLICY fx_write ON exchange_rates FOR ALL
  USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY commissions_read ON seller_commissions FOR SELECT
  USING (seller_id = auth.uid() OR staff_has('commission.seller.override') OR is_admin_or_above());
CREATE POLICY commissions_write ON seller_commissions FOR ALL
  USING (is_super_admin() OR staff_has('commission.seller.override'))
  WITH CHECK (is_super_admin() OR staff_has('commission.seller.override'));

CREATE POLICY wallets_read ON seller_wallets FOR SELECT
  USING (seller_id = auth.uid() OR staff_has('payout.read') OR is_admin_or_above());

CREATE POLICY fin_tx_read ON financial_transactions FOR SELECT
  USING (EXISTS (SELECT 1 FROM seller_wallets sw WHERE sw.id = financial_transactions.wallet_id AND sw.seller_id = auth.uid())
         OR staff_has('payout.read') OR is_admin_or_above());

CREATE POLICY payouts_read ON seller_payouts FOR SELECT
  USING (seller_id = auth.uid() OR staff_has('payout.read') OR is_admin_or_above());
CREATE POLICY payouts_insert ON seller_payouts FOR INSERT
  WITH CHECK (seller_id = auth.uid());
CREATE POLICY payouts_update ON seller_payouts FOR UPDATE
  USING (staff_has('payout.approve') OR is_admin_or_above())
  WITH CHECK (staff_has('payout.approve') OR is_admin_or_above());

CREATE POLICY payments_super_only ON payments FOR SELECT USING (is_super_admin());

-- ============================================================
-- reviews / favorites / reports / support / notifications
-- ============================================================
CREATE POLICY reviews_read ON reviews FOR SELECT
  USING (status = 'published' OR buyer_id = auth.uid() OR staff_has('review.delete') OR is_admin_or_above());
CREATE POLICY reviews_insert ON reviews FOR INSERT
  WITH CHECK (buyer_id = auth.uid()
    AND EXISTS (SELECT 1 FROM order_items oi WHERE oi.id = reviews.order_item_id AND buyer_owns_order_item(oi.id)));
-- no UPDATE (except soft delete handled by policy update below)
CREATE POLICY reviews_soft_delete ON reviews FOR UPDATE
  USING (is_admin_or_above() OR staff_has('review.delete')
         OR EXISTS (SELECT 1 FROM products p WHERE p.id = reviews.product_id AND p.seller_id = auth.uid()))
  WITH CHECK (is_admin_or_above() OR staff_has('review.delete')
         OR EXISTS (SELECT 1 FROM products p WHERE p.id = reviews.product_id AND p.seller_id = auth.uid()));

CREATE POLICY favorites_owner ON favorites FOR ALL
  USING (buyer_id = auth.uid()) WITH CHECK (buyer_id = auth.uid());

CREATE POLICY reports_owner ON content_reports FOR SELECT
  USING (reporter_id = auth.uid() OR staff_has('report.read') OR is_admin_or_above());
CREATE POLICY reports_insert ON content_reports FOR INSERT
  WITH CHECK (reporter_id = auth.uid());
CREATE POLICY reports_update ON content_reports FOR UPDATE
  USING (staff_has('report.resolve') OR is_admin_or_above())
  WITH CHECK (staff_has('report.resolve') OR is_admin_or_above());

CREATE POLICY tickets_owner ON support_tickets FOR SELECT
  USING (owner_id = auth.uid() OR staff_has('support.read') OR is_admin_or_above());
CREATE POLICY tickets_insert ON support_tickets FOR INSERT
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY tickets_update ON support_tickets FOR UPDATE
  USING (staff_has('support.read') OR is_admin_or_above())
  WITH CHECK (staff_has('support.read') OR is_admin_or_above());

CREATE POLICY support_msgs_read ON support_messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM support_tickets t WHERE t.id = support_messages.ticket_id AND (t.owner_id = auth.uid() OR staff_has('support.read') OR is_admin_or_above())));
CREATE POLICY support_msgs_insert ON support_messages FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM support_tickets t WHERE t.id = support_messages.ticket_id AND (t.owner_id = auth.uid() OR staff_has('support.read') OR is_admin_or_above())));

CREATE POLICY notif_owner ON notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY notif_update_self ON notifications FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================
-- ops
-- ============================================================
CREATE POLICY security_events_read ON security_events FOR SELECT
  USING (is_admin_or_above() OR staff_has('security.read'));

CREATE POLICY backup_jobs_read ON backup_jobs FOR SELECT
  USING (staff_has('backup.read') OR is_admin_or_above());
CREATE POLICY backup_jobs_write ON backup_jobs FOR ALL
  USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY backup_archives_read ON backup_archives FOR SELECT
  USING (staff_has('backup.read') OR is_admin_or_above());

CREATE POLICY restore_jobs_read ON restore_jobs FOR SELECT USING (is_admin_or_above());
CREATE POLICY restore_jobs_write ON restore_jobs FOR ALL
  USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY retention_read ON retention_policies FOR SELECT USING (is_admin_or_above());
CREATE POLICY retention_write ON retention_policies FOR ALL
  USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY audit_logs_read ON audit_logs FOR SELECT
  USING (is_admin_or_above() OR staff_has('audit.read'));

CREATE POLICY audit_archives_read ON audit_archives FOR SELECT
  USING (is_super_admin() OR staff_has('audit.read'));

-- ============================================================
-- settings — read for admins, write for Super Admin
-- ============================================================
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'general_settings','pricing_settings','download_settings','compensation_settings',
    'attempt_exception_settings','watermark_settings','backup_settings','audit_settings',
    'security_settings','payout_settings','commission_settings'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format($f$
      CREATE POLICY %1$s_read ON %1$s FOR SELECT USING (is_admin_or_above() OR auth.role() = 'service_role');
      CREATE POLICY %1$s_write ON %1$s FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());
    $f$, t);
  END LOOP;
END $$;

-- ============================================================
-- Public views (SECURITY INVOKER — respect RLS)
-- ============================================================
-- seller_public_view: only display info
CREATE OR REPLACE VIEW seller_public_view AS
SELECT profile_id, display_name, bio, avatar_url
FROM seller_profiles
WHERE status = 'approved';

GRANT SELECT ON seller_public_view TO anon, authenticated;
GRANT SELECT ON buyer_codes_view TO authenticated;
GRANT SELECT ON buyer_compensation_view TO authenticated;
GRANT SELECT ON seller_drive_accounts_safe TO authenticated;
GRANT SELECT ON files_safe TO authenticated;
GRANT SELECT ON file_versions_safe TO authenticated;