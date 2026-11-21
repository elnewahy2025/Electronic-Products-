-- ============================================================
-- 009_settings.sql
-- All settings are singletons (id = 1)
-- ============================================================

CREATE TABLE general_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  default_currency char(3) NOT NULL DEFAULT 'USD',
  allowed_currencies char(3)[] NOT NULL DEFAULT ARRAY['EGP','KWD','SAR','USD']::char(3)[],
  platform_name text,
  platform_contact_email citext,
  platform_contact_phone text,
  timezone text NOT NULL DEFAULT 'Africa/Cairo',
  maintenance_mode boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_general_settings_updated_at BEFORE UPDATE ON general_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE pricing_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  min_product_price numeric(18,4) NOT NULL DEFAULT 0,
  min_product_price_currency char(3) NOT NULL DEFAULT 'USD',
  updated_by uuid REFERENCES profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_min_price_nonneg CHECK (min_product_price >= 0)
);
CREATE TRIGGER trg_pricing_settings_updated_at BEFORE UPDATE ON pricing_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE download_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  session_duration_hours smallint NOT NULL DEFAULT 4,
  max_attempts_per_product smallint NOT NULL DEFAULT 3,
  code_validity_hours smallint NOT NULL DEFAULT 72,
  partial_session_new_duration_hours smallint NOT NULL DEFAULT 4,
  updated_by uuid REFERENCES profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_dl_durations CHECK (
    session_duration_hours > 0
    AND partial_session_new_duration_hours > 0
    AND code_validity_hours > 0
    AND max_attempts_per_product BETWEEN 1 AND 10
  )
);
CREATE TRIGGER trg_download_settings_updated_at BEFORE UPDATE ON download_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE compensation_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  max_sessions_per_product smallint NOT NULL DEFAULT 3,
  session_duration_hours smallint NOT NULL DEFAULT 4,
  requires_admin_approval boolean NOT NULL DEFAULT true,
  reason_required boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_comp_max CHECK (max_sessions_per_product BETWEEN 1 AND 10)
);
CREATE TRIGGER trg_compensation_settings_updated_at BEFORE UPDATE ON compensation_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE attempt_exception_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  warning_threshold smallint NOT NULL DEFAULT 5,
  reason_required boolean NOT NULL DEFAULT true,
  super_admin_only boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_attempt_exception_settings_updated_at BEFORE UPDATE ON attempt_exception_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TYPE watermark_opacity_enum AS ENUM ('low','medium','high');
CREATE TYPE watermark_direction_enum AS ENUM ('diagonal','horizontal');
CREATE TYPE watermark_video_style_enum AS ENUM ('static','periodic','both');

CREATE TABLE watermark_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  text_template text NOT NULL DEFAULT '{platform_name} — نسخة غير مرخصة',
  opacity_level watermark_opacity_enum NOT NULL DEFAULT 'medium',
  direction watermark_direction_enum NOT NULL DEFAULT 'diagonal',
  apply_to_previews_only boolean NOT NULL DEFAULT true,
  apply_to_delivered_files boolean NOT NULL DEFAULT false,
  video_style watermark_video_style_enum NOT NULL DEFAULT 'both',
  updated_by uuid REFERENCES profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_watermark_settings_updated_at BEFORE UPDATE ON watermark_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TYPE backup_schedule_enum AS ENUM ('daily','weekly','manual_only');
CREATE TYPE backup_storage_provider_enum AS ENUM ('r2','s3','admin_server');

CREATE TABLE backup_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  schedule backup_schedule_enum NOT NULL DEFAULT 'weekly',
  manual_enabled boolean NOT NULL DEFAULT true,
  retention_days smallint NOT NULL DEFAULT 90,
  storage_provider backup_storage_provider_enum,
  encryption_enabled boolean NOT NULL DEFAULT true,
  restore_test_frequency_days smallint NOT NULL DEFAULT 30,
  include_files boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_backup_settings_updated_at BEFORE UPDATE ON backup_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE audit_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  retention_days smallint NOT NULL DEFAULT 180,
  post_retention_action text NOT NULL DEFAULT 'archive',
  append_only_enforced boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_audit_post_retention CHECK (post_retention_action IN ('archive','archive_and_keep_index'))
);
CREATE TRIGGER trg_audit_settings_updated_at BEFORE UPDATE ON audit_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE security_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  mfa_enforced_roles text[] NOT NULL DEFAULT ARRAY['super_admin','admin','staff']::text[],
  code_rate_limit_per_hour int NOT NULL DEFAULT 10,
  login_rate_limit_per_hour int NOT NULL DEFAULT 20,
  session_idle_timeout_minutes int NOT NULL DEFAULT 60,
  password_min_length smallint NOT NULL DEFAULT 10,
  updated_by uuid REFERENCES profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_security_settings_updated_at BEFORE UPDATE ON security_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE payout_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  minimum_amount numeric(18,4) NOT NULL DEFAULT 100,
  minimum_currency char(3) NOT NULL DEFAULT 'USD',
  allowed_methods text[],
  updated_by uuid REFERENCES profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_payout_min_positive CHECK (minimum_amount > 0)
);
CREATE TRIGGER trg_payout_settings_updated_at BEFORE UPDATE ON payout_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE commission_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  default_rate numeric(5,4) NOT NULL DEFAULT 0.10,
  per_seller_override_enabled boolean NOT NULL DEFAULT true,
  per_product_type_override_enabled boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_commission_default_rate CHECK (default_rate >= 0 AND default_rate <= 1)
);
CREATE TRIGGER trg_commission_settings_updated_at BEFORE UPDATE ON commission_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- Protect immutable fields after first setup ----------
CREATE OR REPLACE FUNCTION settings_immutable_fields_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- audit_settings.append_only_enforced must remain true
  IF TG_TABLE_NAME = 'audit_settings' AND OLD.append_only_enforced = true AND NEW.append_only_enforced <> true THEN
    RAISE EXCEPTION 'audit_settings.append_only_enforced_is_immutable';
  END IF;
  -- security_settings.mfa_enforced_roles must always include super_admin, admin, staff
  IF TG_TABLE_NAME = 'security_settings' THEN
    IF NOT (NEW.mfa_enforced_roles @> ARRAY['super_admin','admin','staff']::text[]) THEN
      RAISE EXCEPTION 'security_settings.mfa_enforced_roles_min_required';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_settings_immutable
  BEFORE UPDATE ON audit_settings
  FOR EACH ROW EXECUTE FUNCTION settings_immutable_fields_guard();

CREATE TRIGGER trg_security_settings_immutable
  BEFORE UPDATE ON security_settings
  FOR EACH ROW EXECUTE FUNCTION settings_immutable_fields_guard();

-- ---------- Convenience: single source for currency allow-list ----------
CREATE OR REPLACE FUNCTION allowed_currencies() RETURNS char(3)[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT allowed_currencies FROM general_settings WHERE id = 1
$$;

CREATE OR REPLACE FUNCTION min_product_price() RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT min_product_price FROM pricing_settings WHERE id = 1
$$;

CREATE OR REPLACE FUNCTION product_min_price_check() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_min numeric;
  v_currency char(3);
  v_default char(3);
BEGIN
  SELECT min_product_price INTO v_min FROM pricing_settings WHERE id = 1;
  SELECT min_product_price_currency INTO v_currency FROM pricing_settings WHERE id = 1;
  SELECT default_currency INTO v_default FROM general_settings WHERE id = 1;

  -- Only enforce when the product currency equals the min-price currency baseline
  IF NEW.price_currency = v_currency AND v_min IS NOT NULL AND NEW.price_amount < v_min THEN
    RAISE EXCEPTION 'product_price_below_minimum: % < %', NEW.price_amount, v_min;
  END IF;
  NEW.min_price_checked_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_products_min_price
  BEFORE INSERT OR UPDATE OF price_amount, price_currency ON products
  FOR EACH ROW EXECUTE FUNCTION product_min_price_check();