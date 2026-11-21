-- ============================================================
-- 012_seed_reference_data.sql
-- ============================================================

-- Roles
INSERT INTO roles (code, name) VALUES
  ('super_admin','Super Admin'),
  ('admin','Admin'),
  ('staff','Staff')
ON CONFLICT (code) DO NOTHING;

-- Permissions (aligned with matrix)
INSERT INTO permissions (code, description) VALUES
  ('settings.manage', 'Manage platform settings'),
  ('role.manage', 'Manage roles'),
  ('permission.assign', 'Assign permissions'),
  ('staff.manage', 'Manage staff accounts'),
  ('staff.user.read', 'Read staff users'),
  ('seller.read', 'Read seller data'),
  ('seller.approve', 'Approve seller'),
  ('seller.reject', 'Reject seller'),
  ('seller.suspend', 'Suspend seller'),
  ('product.read.any', 'Read any product'),
  ('product.suspend', 'Suspend product'),
  ('product.reject', 'Reject product'),
  ('product.delete.any', 'Delete any product'),
  ('category.manage', 'Manage categories'),
  ('filetype.manage', 'Manage allowed file types'),
  ('file.quarantine', 'Quarantine files'),
  ('file.delete', 'Delete files'),
  ('file.preview.regenerate', 'Regenerate previews'),
  ('code.issue', 'Issue codes'),
  ('code.revoke', 'Revoke codes (before delivery only)'),
  ('code.confirm_delivery', 'Confirm code delivery'),
  ('code.read.any', 'Read any codes'),
  ('download.session.revoke', 'Revoke download sessions'),
  ('download.session.extend', 'Extend download sessions'),
  ('download.compensation.request', 'Request compensation'),
  ('download.compensation.approve', 'Approve compensation'),
  ('download.compensation.reject', 'Reject compensation'),
  ('commission.manage', 'Manage commissions globally'),
  ('commission.seller.override', 'Override seller commission'),
  ('exchange_rate.manage', 'Manage exchange rates'),
  ('payout.read', 'Read payouts'),
  ('payout.approve', 'Approve payouts'),
  ('payout.reject', 'Reject payouts'),
  ('wallet.adjust', 'Adjust wallet'),
  ('review.delete', 'Delete reviews'),
  ('review.reply', 'Reply to reviews'),
  ('report.read', 'Read reports'),
  ('report.resolve', 'Resolve reports'),
  ('support.read', 'Read support tickets'),
  ('security.read', 'Read security events'),
  ('backup.run', 'Run backup'),
  ('backup.read', 'Read backup state'),
  ('backup.restore', 'Restore backup'),
  ('retention.manage', 'Manage retention policies'),
  ('audit.read', 'Read audit logs'),
  ('audit.export', 'Export audit logs')
ON CONFLICT (code) DO NOTHING;

-- Super Admin: all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.code = 'super_admin'
ON CONFLICT DO NOTHING;

-- Admin: everything except system-level destructive actions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code = 'admin'
  AND p.code NOT IN (
    'settings.manage','role.manage','permission.assign','staff.manage',
    'backup.run','backup.restore','retention.manage',
    'exchange_rate.manage','wallet.adjust',
    'commission.manage'
  )
ON CONFLICT DO NOTHING;

-- Staff: read/operate only (no destructive, no system)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code = 'staff'
  AND p.code IN (
    'seller.read','seller.approve','seller.reject','seller.suspend',
    'product.read.any','product.suspend','product.reject',
    'category.manage','file.quarantine','file.delete','file.preview.regenerate',
    'code.issue','code.revoke','code.confirm_delivery','code.read.any',
    'download.session.revoke','download.session.extend',
    'download.compensation.request','download.compensation.approve','download.compensation.reject',
    'payout.read','payout.approve','payout.reject',
    'review.delete','review.reply','report.read','report.resolve','support.read',
    'audit.read'
  )
ON CONFLICT DO NOTHING;

-- Default settings singletons
INSERT INTO general_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
INSERT INTO pricing_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
INSERT INTO download_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
INSERT INTO compensation_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
INSERT INTO attempt_exception_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
INSERT INTO watermark_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
INSERT INTO backup_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
INSERT INTO audit_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
INSERT INTO security_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
INSERT INTO payout_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
INSERT INTO commission_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Seed exchange rates (placeholder 1:1, real rates set by Super Admin later)
INSERT INTO exchange_rates (base_currency, quote_currency, rate, effective_at) VALUES
  ('USD','USD',1, now()),
  ('USD','EGP',1, now()),
  ('USD','SAR',1, now()),
  ('USD','KWD',1, now())
ON CONFLICT DO NOTHING;

-- Initial allowed file types (subset; admin can add more)
INSERT INTO allowed_file_types (extension, mime, is_enabled) VALUES
  ('pdf','application/pdf', true),
  ('zip','application/zip', true),
  ('png','image/png', true),
  ('jpg','image/jpeg', true),
  ('jpeg','image/jpeg', true),
  ('mp4','video/mp4', true),
  ('pptx','application/vnd.openxmlformats-officedocument.presentationml.presentation', true),
  ('docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document', true),
  ('xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', true)
ON CONFLICT (extension) DO NOTHING;

-- Default tags
INSERT INTO tags (name, slug) VALUES
  ('PowerPoint','powerpoint'),
  ('تحضير دروس','lesson-prep'),
  ('فيديو','video'),
  ('مواد تعليمية','educational')
ON CONFLICT (slug) DO NOTHING;

-- Retention policies defaults
INSERT INTO retention_policies (entity, retention_days, action) VALUES
  ('audit_logs', 180, 'archive'),
  ('backup_archives', 90, 'archive')
ON CONFLICT (entity) DO NOTHING;