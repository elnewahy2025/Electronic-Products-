-- ============================================================
-- 003_sellers_and_drive.sql
-- ============================================================

CREATE TYPE drive_account_status_enum AS ENUM ('active','revoked','quota_exceeded');
CREATE TYPE application_status_enum AS ENUM ('submitted','under_review','approved','rejected','withdrawn');

CREATE TABLE seller_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status application_status_enum NOT NULL DEFAULT 'submitted',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES profiles(id),
  reviewed_at timestamptz,
  notes text
);
CREATE INDEX idx_seller_applications_profile ON seller_applications(profile_id);

CREATE TABLE seller_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip inet,
  user_agent text,
  UNIQUE (profile_id, version)
);

CREATE TABLE seller_drive_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES seller_profiles(profile_id) ON DELETE RESTRICT,
  google_account_email citext NOT NULL,
  encrypted_refresh_token text,
  scopes text[],
  status drive_account_status_enum NOT NULL DEFAULT 'active',
  quota_total bigint,
  quota_used bigint,
  last_checked_at timestamptz,
  is_default boolean NOT NULL DEFAULT false,
  priority int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (seller_id, google_account_email)
);
CREATE INDEX idx_drive_accounts_seller ON seller_drive_accounts(seller_id);
CREATE TRIGGER trg_drive_accounts_updated_at BEFORE UPDATE ON seller_drive_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Safe view (excludes encrypted_refresh_token)
CREATE VIEW seller_drive_accounts_safe AS
  SELECT id, seller_id, google_account_email, scopes, status,
         quota_total, quota_used, last_checked_at, is_default, priority,
         created_at, updated_at
  FROM seller_drive_accounts;