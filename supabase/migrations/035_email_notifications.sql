-- ============================================================
-- 035_email_notifications.sql
-- Transactional email outbox queue + critical event triggers
-- ============================================================

DO $$ BEGIN
  CREATE TYPE email_outbox_status_enum AS ENUM ('queued', 'sending', 'sent', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email citext NOT NULL,
  subject text NOT NULL,
  text_body text NOT NULL,
  html_body text,
  template text NOT NULL DEFAULT 'generic',
  status email_outbox_status_enum NOT NULL DEFAULT 'queued',
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 3,
  last_error text,
  provider_message_id text,
  reference_type text,
  reference_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_email_outbox_queued
  ON email_outbox(created_at ASC)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS idx_email_outbox_status_time
  ON email_outbox(status, created_at DESC);

ALTER TABLE email_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_outbox_admin_read ON email_outbox;
CREATE POLICY email_outbox_admin_read ON email_outbox FOR SELECT
  USING (is_admin_or_above() OR staff_has('audit.read'));

-- ------------------------------------------------------------
-- Helper: enqueue an email (triggers & service_role only)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION enqueue_email(
  p_to_email text,
  p_subject text,
  p_text_body text,
  p_html_body text DEFAULT NULL,
  p_template text DEFAULT 'generic',
  p_reference_type text DEFAULT NULL,
  p_reference_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_to_email IS NULL OR length(trim(p_to_email)) < 5 THEN
    RETURN NULL;
  END IF;

  INSERT INTO email_outbox(
    to_email, subject, text_body, html_body, template, reference_type, reference_id
  )
  VALUES (
    trim(p_to_email), p_subject, p_text_body, p_html_body, p_template, p_reference_type, p_reference_id
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION enqueue_email(text,text,text,text,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION enqueue_email(text,text,text,text,text,text,uuid) TO service_role;

-- ------------------------------------------------------------
-- Atomic claim / complete / fail RPCs (service_role only)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION claim_email_outbox(p_limit int DEFAULT 10)
RETURNS SETOF email_outbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT id
    FROM email_outbox
    WHERE status = 'queued'
      AND attempts < max_attempts
    ORDER BY created_at ASC
    LIMIT GREATEST(1, LEAST(p_limit, 50))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE email_outbox e
    SET status = 'sending',
        attempts = e.attempts + 1
  FROM picked
  WHERE e.id = picked.id
  RETURNING e.*;
END;
$$;

REVOKE ALL ON FUNCTION claim_email_outbox(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_email_outbox(int) TO service_role;

CREATE OR REPLACE FUNCTION mark_email_sent(p_id uuid, p_provider_id text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE email_outbox
    SET status = 'sent',
        sent_at = now(),
        provider_message_id = p_provider_id,
        last_error = NULL
  WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION mark_email_sent(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mark_email_sent(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION mark_email_failed(p_id uuid, p_error text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE email_outbox
    SET status = CASE WHEN attempts < max_attempts THEN 'queued'::email_outbox_status_enum
                      ELSE 'failed'::email_outbox_status_enum END,
        last_error = left(coalesce(p_error, 'unknown_error'), 1000)
  WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION mark_email_failed(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mark_email_failed(uuid, text) TO service_role;

-- ------------------------------------------------------------
-- Trigger 1: Purchase request approved / rejected → buyer email
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_email_on_purchase_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_platform text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.customer_email IS NULL THEN RETURN NEW; END IF;

  SELECT coalesce(platform_name, 'المنصة') INTO v_platform FROM general_settings WHERE id = 1;

  IF NEW.status = 'approved' THEN
    PERFORM enqueue_email(
      NEW.customer_email::text,
      'تم اعتماد طلب الشراء — ' || v_platform,
      'مرحبًا، تم اعتماد طلب الشراء الخاص بك بمبلغ ' || NEW.total_amount || ' ' || NEW.currency ||
      '. سيتم تسليم كود التنزيل قريبًا ويمكنك متابعة طلبك من حسابك.',
      NULL,
      'purchase_approved',
      'purchase_requests',
      NEW.id
    );
  ELSIF NEW.status = 'rejected' THEN
    PERFORM enqueue_email(
      NEW.customer_email::text,
      'تحديث بشأن طلب الشراء — ' || v_platform,
      'مرحبًا، نعتذر عن رفض طلب الشراء الخاص بك.' ||
      CASE WHEN NEW.cancel_reason IS NOT NULL THEN E'\nالسبب: ' || NEW.cancel_reason ELSE '' END,
      NULL,
      'purchase_rejected',
      'purchase_requests',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_email_purchase_status ON purchase_requests;
CREATE TRIGGER trg_email_purchase_status
  AFTER UPDATE OF status ON purchase_requests
  FOR EACH ROW EXECUTE FUNCTION trg_email_on_purchase_status();

-- ------------------------------------------------------------
-- Trigger 2: Code delivery confirmed → buyer email
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_email_on_code_delivered() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email citext;
  v_title text;
  v_platform text;
BEGIN
  IF OLD.delivered_at IS NOT NULL OR NEW.delivered_at IS NULL THEN RETURN NEW; END IF;

  SELECT pr.customer_email, p.title
    INTO v_email, v_title
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  JOIN purchase_requests pr ON pr.id = o.purchase_request_id
  JOIN products p ON p.id = oi.product_id
  WHERE oi.id = NEW.order_item_id;

  IF v_email IS NULL THEN RETURN NEW; END IF;

  SELECT coalesce(platform_name, 'المنصة') INTO v_platform FROM general_settings WHERE id = 1;

  PERFORM enqueue_email(
    v_email::text,
    'كود التنزيل جاهز للتفعيل — ' || coalesce(v_title, v_platform),
    'تم تأكيد تسليم كود التنزيل الخاص بمنتج: ' || coalesce(v_title, 'المنتج') ||
    ' (البادئة: ' || NEW.code_prefix || '). الكود صالح لمدة 72 ساعة من الإصدار. يمكنك تفعيله الآن عبر صفحة /redeem.',
    NULL,
    'code_delivered',
    'purchase_codes',
    NEW.id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_email_code_delivered ON purchase_codes;
CREATE TRIGGER trg_email_code_delivered
  AFTER UPDATE OF delivered_at ON purchase_codes
  FOR EACH ROW EXECUTE FUNCTION trg_email_on_code_delivered();

-- ------------------------------------------------------------
-- Trigger 3: Seller payout status changed → seller email
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_email_on_payout_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email citext;
  v_platform text;
  v_subject text;
  v_body text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('approved', 'paid', 'rejected') THEN RETURN NEW; END IF;

  SELECT email INTO v_email FROM profiles WHERE id = NEW.seller_id;
  IF v_email IS NULL THEN RETURN NEW; END IF;

  SELECT coalesce(platform_name, 'المنصة') INTO v_platform FROM general_settings WHERE id = 1;

  IF NEW.status = 'approved' THEN
    v_subject := 'تمت الموافقة على طلب السحب — ' || v_platform;
    v_body := 'تمت الموافقة على طلب سحب المستحقات بمبلغ ' || NEW.amount || ' ' || NEW.currency || ' وجارٍ تجهيز التحويل.';
  ELSIF NEW.status = 'paid' THEN
    v_subject := 'تم تحويل مستحقاتك بنجاح — ' || v_platform;
    v_body := 'تم صرف وتحويل مبلغ ' || NEW.amount || ' ' || NEW.currency || ' إلى وسيلة الصرف المعتمدة.' ||
              CASE WHEN NEW.reference IS NOT NULL THEN E'\nالمرجع: ' || NEW.reference ELSE '' END;
  ELSE
    v_subject := 'تم رفض طلب السحب — ' || v_platform;
    v_body := 'تم رفض طلب سحب مبلغ ' || NEW.amount || ' ' || NEW.currency || ' وأُعيد الرصيد إلى محفظتك.' ||
              CASE WHEN NEW.reference IS NOT NULL THEN E'\nالسبب: ' || NEW.reference ELSE '' END;
  END IF;

  PERFORM enqueue_email(
    v_email::text,
    v_subject,
    v_body,
    NULL,
    'payout_' || NEW.status::text,
    'seller_payouts',
    NEW.id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_email_payout_status ON seller_payouts;
CREATE TRIGGER trg_email_payout_status
  AFTER UPDATE OF status ON seller_payouts
  FOR EACH ROW EXECUTE FUNCTION trg_email_on_payout_status();

-- ------------------------------------------------------------
-- Trigger 4: Seller account approved / rejected / suspended
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_email_on_seller_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email citext;
  v_platform text;
  v_subject text;
  v_body text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('approved', 'rejected', 'suspended') THEN RETURN NEW; END IF;

  SELECT email INTO v_email FROM profiles WHERE id = NEW.profile_id;
  IF v_email IS NULL THEN RETURN NEW; END IF;

  SELECT coalesce(platform_name, 'المنصة') INTO v_platform FROM general_settings WHERE id = 1;

  IF NEW.status = 'approved' THEN
    v_subject := 'تم اعتماد حسابك كبائع — ' || v_platform;
    v_body := 'تهانينا! تم اعتماد حساب البائع الخاص بك (' || NEW.display_name || '). يمكنك الآن ربط Google Drive ونشر منتجاتك.';
  ELSIF NEW.status = 'rejected' THEN
    v_subject := 'تحديث بشأن طلب الانضمام كبائع — ' || v_platform;
    v_body := 'نعتذر، لم تتم الموافقة على طلب البائع.' ||
              CASE WHEN NEW.rejection_reason IS NOT NULL THEN E'\nالسبب: ' || NEW.rejection_reason ELSE '' END;
  ELSE
    v_subject := 'تم تعليق حساب البائع مؤقتًا — ' || v_platform;
    v_body := 'تم تعليق حساب البائع الخاص بك مؤقتًا.' ||
              CASE WHEN NEW.suspension_reason IS NOT NULL THEN E'\nالسبب: ' || NEW.suspension_reason ELSE '' END;
  END IF;

  PERFORM enqueue_email(
    v_email::text,
    v_subject,
    v_body,
    NULL,
    'seller_' || NEW.status::text,
    'seller_profiles',
    NEW.profile_id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_email_seller_status ON seller_profiles;
CREATE TRIGGER trg_email_seller_status
  AFTER UPDATE OF status ON seller_profiles
  FOR EACH ROW EXECUTE FUNCTION trg_email_on_seller_status();
