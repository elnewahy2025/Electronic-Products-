-- ============================================================
-- 026_buyer_notifications.sql
-- Buyer notification system with automated triggers
-- ============================================================

-- Extend notifications
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS link text,
  ADD COLUMN IF NOT EXISTS data jsonb,
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general';

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user_all
  ON notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_category
  ON notifications(user_id, category, created_at DESC);

-- ------------------------------------------------------------
-- Helpers
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION code_buyer_id(p_code_id uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pr.buyer_id
  FROM purchase_codes pc
  JOIN order_items oi ON oi.id = pc.order_item_id
  JOIN orders o ON o.id = oi.order_id
  JOIN purchase_requests pr ON pr.id = o.purchase_request_id
  WHERE pc.id = p_code_id
$$;

CREATE OR REPLACE FUNCTION mark_all_notifications_read()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  WITH updated AS (
    UPDATE notifications
      SET read_at = now()
      WHERE user_id = auth.uid() AND read_at IS NULL
      RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM updated;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION mark_all_notifications_read() TO authenticated;

-- ------------------------------------------------------------
-- Trigger: purchase request approved
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION notify_purchase_approved() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_title text;
BEGIN
  IF NEW.buyer_id IS NULL THEN RETURN NEW; END IF;

  SELECT string_agg(p.title, ', ')
    INTO v_title
  FROM purchase_request_items pri
  JOIN products p ON p.id = pri.product_id
  WHERE pri.purchase_request_id = NEW.id;

  INSERT INTO notifications(user_id, type, category, title, body, link)
  VALUES (
    NEW.buyer_id,
    'purchase_approved',
    'purchase',
    'تم اعتماد طلبك',
    coalesce(v_title, 'طلبك') || ' — تم إصدار الكود. تفقّد بريدك للتفعيل.',
    '/account/orders/' || NEW.id::text
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_purchase_approved ON purchase_requests;
CREATE TRIGGER trg_notify_purchase_approved
  AFTER UPDATE ON purchase_requests
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'approved')
  EXECUTE FUNCTION notify_purchase_approved();

-- ------------------------------------------------------------
-- Trigger: purchase request rejected
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION notify_purchase_rejected() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_title text;
  v_reason text;
BEGIN
  IF NEW.buyer_id IS NULL THEN RETURN NEW; END IF;

  SELECT string_agg(p.title, ', ')
    INTO v_title
  FROM purchase_request_items pri
  JOIN products p ON p.id = pri.product_id
  WHERE pri.purchase_request_id = NEW.id;

  v_reason := coalesce(NEW.cancel_reason, 'لم يُذكر سبب.');

  INSERT INTO notifications(user_id, type, category, title, body, link, data)
  VALUES (
    NEW.buyer_id,
    'purchase_rejected',
    'purchase',
    'تم رفض طلبك',
    coalesce(v_title, 'طلبك') || ' — ' || v_reason,
    '/account/orders/' || NEW.id::text,
    jsonb_build_object('reason', v_reason)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_purchase_rejected ON purchase_requests;
CREATE TRIGGER trg_notify_purchase_rejected
  AFTER UPDATE ON purchase_requests
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'rejected')
  EXECUTE FUNCTION notify_purchase_rejected();

-- ------------------------------------------------------------
-- Trigger: code delivered (buyer notification)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION notify_code_delivered() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_buyer uuid;
  v_product_title text;
  v_order_item uuid;
BEGIN
  IF NEW.delivered_at IS NULL OR OLD.delivered_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_buyer := code_buyer_id(NEW.id);
  IF v_buyer IS NULL THEN RETURN NEW; END IF;

  SELECT oi.id, p.title INTO v_order_item, v_product_title
  FROM order_items oi
  JOIN products p ON p.id = oi.product_id
  WHERE oi.id = NEW.order_item_id;

  INSERT INTO notifications(user_id, type, category, title, body, link)
  VALUES (
    v_buyer,
    'code_delivered',
    'code',
    'كودك جاهز للتفعيل',
    coalesce(v_product_title, 'كود الشراء') || ' — تم إرسال الكود عبر بريدك. اضغط للتفعيل.',
    '/redeem'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_code_delivered ON purchase_codes;
CREATE TRIGGER trg_notify_code_delivered
  AFTER UPDATE ON purchase_codes
  FOR EACH ROW
  EXECUTE FUNCTION notify_code_delivered();

-- ------------------------------------------------------------
-- Trigger: compensation approved / rejected
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION notify_compensation_decided() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_buyer uuid;
  v_type text;
  v_title text;
  v_body text;
  v_link text;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('rejected','fulfilled') THEN RETURN NEW; END IF;

  v_buyer := code_buyer_id(NEW.code_id);
  IF v_buyer IS NULL THEN RETURN NEW; END IF;

  IF NEW.status = 'rejected' THEN
    v_type := 'compensation_rejected';
    v_title := 'تم رفض طلب التعويض';
    v_body := coalesce(NEW.admin_reason, 'لم يُذكر سبب.');
  ELSE
    v_type := 'compensation_approved';
    v_title := 'تمت الموافقة على التعويض';
    v_body := 'تم فتح جلسة تنزيل تعويضية جديدة. اضغط للانتقال.';
  END IF;

  v_link := CASE
    WHEN NEW.approved_session_id IS NOT NULL
      THEN '/account/downloads/' || NEW.approved_session_id::text
    ELSE '/account/orders'
  END;

  INSERT INTO notifications(user_id, type, category, title, body, link, data)
  VALUES (
    v_buyer,
    v_type,
    'compensation',
    v_title,
    v_body,
    v_link,
    jsonb_build_object(
      'compensation_id', NEW.id,
      'sequence_number', NEW.sequence_number,
      'status', NEW.status
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_compensation_decided ON compensation_requests;
CREATE TRIGGER trg_notify_compensation_decided
  AFTER UPDATE ON compensation_requests
  FOR EACH ROW
  EXECUTE FUNCTION notify_compensation_decided();
