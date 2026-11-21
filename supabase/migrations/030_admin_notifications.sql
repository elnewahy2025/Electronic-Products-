-- ============================================================
-- 030_admin_notifications.sql
-- ============================================================

-- ------------------------------------------------------------
-- Helper: notify staff with a given permission (or all staff if NULL)
-- Excludes the acting user so admins don't get pinged about their own actions.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_staff_with_permission(
  p_permission text,
  p_type text,
  p_category text,
  p_title text,
  p_body text,
  p_link text,
  p_data jsonb DEFAULT NULL,
  p_exclude_user uuid DEFAULT NULL
) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count int;
BEGIN
  IF p_permission IS NULL THEN
    WITH inserted AS (
      INSERT INTO notifications(user_id, type, category, title, body, link, data)
      SELECT DISTINCT sm.profile_id, p_type, p_category, p_title, p_body, p_link, p_data
      FROM store_members sm
      WHERE sm.status = 'active'
        AND (p_exclude_user IS NULL OR sm.profile_id <> p_exclude_user)
      RETURNING 1
    )
    SELECT COUNT(*) INTO v_count FROM inserted;
  ELSE
    WITH eligible AS (
      SELECT DISTINCT sm.profile_id
      FROM store_members sm
      WHERE sm.status = 'active'
        AND (p_exclude_user IS NULL OR sm.profile_id <> p_exclude_user)
        AND (
          EXISTS (
            SELECT 1 FROM role_permissions rp
            JOIN permissions p ON p.id = rp.permission_id
            WHERE rp.role_id = sm.role_id AND p.code = p_permission
          )
          OR EXISTS (
            SELECT 1 FROM member_permissions mp
            JOIN permissions p ON p.id = mp.permission_id
            WHERE mp.member_id = sm.profile_id
              AND p.code = p_permission
              AND (mp.expires_at IS NULL OR mp.expires_at > now())
          )
        )
    ),
    inserted AS (
      INSERT INTO notifications(user_id, type, category, title, body, link, data)
      SELECT profile_id, p_type, p_category, p_title, p_body, p_link, p_data
      FROM eligible
      RETURNING 1
    )
    SELECT COUNT(*) INTO v_count FROM inserted;
  END IF;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION notify_staff_with_permission(text,text,text,text,text,text,jsonb,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION notify_staff_with_permission(text,text,text,text,text,text,jsonb,uuid) TO service_role;

-- ------------------------------------------------------------
-- Backfill: recategorize existing purchase-request notifications
-- ------------------------------------------------------------
UPDATE notifications
  SET category = 'admin'
  WHERE type = 'purchase_request_created' AND category = 'general';

-- ------------------------------------------------------------
-- Trigger: new seller application
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_admins_new_seller() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status <> 'pending' THEN RETURN NEW; END IF;

  PERFORM notify_staff_with_permission(
    'seller.approve',
    'admin_seller_pending',
    'admin',
    'طلب انضمام بائع جديد',
    NEW.display_name || ' — بانتظار المراجعة',
    '/admin/sellers/' || NEW.profile_id::text,
    jsonb_build_object('seller_id', NEW.profile_id),
    auth.uid()
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admins_new_seller ON seller_profiles;
CREATE TRIGGER trg_notify_admins_new_seller
  AFTER INSERT ON seller_profiles
  FOR EACH ROW EXECUTE FUNCTION notify_admins_new_seller();

-- ------------------------------------------------------------
-- Trigger: new payout request
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_admins_new_payout() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_seller_name text;
BEGIN
  IF NEW.status <> 'requested' THEN RETURN NEW; END IF;

  SELECT display_name INTO v_seller_name
    FROM seller_profiles WHERE profile_id = NEW.seller_id;

  PERFORM notify_staff_with_permission(
    'payout.approve',
    'admin_payout_pending',
    'admin',
    'طلب سحب مستحقات جديد',
    coalesce(v_seller_name, 'بائع') || ' — ' || NEW.amount || ' ' || NEW.currency,
    '/admin/payouts',
    jsonb_build_object('payout_id', NEW.id, 'amount', NEW.amount, 'currency', NEW.currency::text),
    auth.uid()
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admins_new_payout ON seller_payouts;
CREATE TRIGGER trg_notify_admins_new_payout
  AFTER INSERT ON seller_payouts
  FOR EACH ROW EXECUTE FUNCTION notify_admins_new_payout();

-- ------------------------------------------------------------
-- Trigger: file quarantined
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_admins_quarantine() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_seller_name text;
  v_file_name text;
BEGIN
  SELECT sp.display_name, f.original_name
    INTO v_seller_name, v_file_name
  FROM file_versions fv
  JOIN files f ON f.id = fv.file_id
  JOIN seller_profiles sp ON sp.profile_id = f.seller_id
  WHERE fv.id = NEW.file_version_id;

  PERFORM notify_staff_with_permission(
    'file.quarantine',
    'admin_quarantine',
    'admin',
    'ملف جديد في العزل',
    coalesce(v_seller_name, 'بائع') || ' — ' || coalesce(v_file_name, 'ملف') || ': ' || NEW.reason,
    '/admin/quarantine',
    jsonb_build_object('quarantine_id', NEW.id, 'file_version_id', NEW.file_version_id),
    auth.uid()
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admins_quarantine ON quarantine_records;
CREATE TRIGGER trg_notify_admins_quarantine
  AFTER INSERT ON quarantine_records
  FOR EACH ROW EXECUTE FUNCTION notify_admins_quarantine();

-- ------------------------------------------------------------
-- Trigger: compensation created
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_admins_compensation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_title text;
  v_buyer citext;
BEGIN
  SELECT p.title, pr.customer_email
    INTO v_title, v_buyer
  FROM purchase_codes pc
  JOIN order_items oi ON oi.id = pc.order_item_id
  JOIN products p ON p.id = oi.product_id
  JOIN orders o ON o.id = oi.order_id
  JOIN purchase_requests pr ON pr.id = o.purchase_request_id
  WHERE pc.id = NEW.code_id;

  PERFORM notify_staff_with_permission(
    'download.compensation.approve',
    'admin_compensation',
    'admin',
    'تعويض جديد مُنشأ',
    coalesce(v_title, 'منتج') || ' — ' || coalesce(v_buyer::text, 'مشتري') ||
      ' (جلسة ' || NEW.sequence_number || '/3)',
    '/admin/compensation',
    jsonb_build_object('compensation_id', NEW.id, 'code_id', NEW.code_id, 'sequence', NEW.sequence_number),
    auth.uid()
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admins_compensation ON compensation_requests;
CREATE TRIGGER trg_notify_admins_compensation
  AFTER INSERT ON compensation_requests
  FOR EACH ROW EXECUTE FUNCTION notify_admins_compensation();

-- ------------------------------------------------------------
-- Trigger: attempt exception granted
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_admins_exception() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_prefix text;
BEGIN
  SELECT code_prefix INTO v_prefix FROM purchase_codes WHERE id = NEW.code_id;

  PERFORM notify_staff_with_permission(
    NULL,
    'admin_exception',
    'admin',
    'استثناء محاولات',
    'كود ' || coalesce(v_prefix, '—') || ': +' || coalesce(NEW.granted_attempts::text, '?') ||
      ' محاولة — ' || NEW.reason,
    '/admin/exceptions',
    jsonb_build_object('exception_id', NEW.id, 'code_id', NEW.code_id, 'granted', NEW.granted_attempts),
    auth.uid()
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admins_exception ON attempt_exception_requests;
CREATE TRIGGER trg_notify_admins_exception
  AFTER INSERT ON attempt_exception_requests
  FOR EACH ROW EXECUTE FUNCTION notify_admins_exception();
