-- ============================================================
-- 002_profiles_and_roles.sql
-- ============================================================

-- Enums
CREATE TYPE auth_provider_enum AS ENUM ('google','password','both');
CREATE TYPE account_type_enum AS ENUM ('buyer','seller','staff');
CREATE TYPE user_status_enum AS ENUM ('active','suspended','deleted');
CREATE TYPE seller_status_enum AS ENUM ('pending','approved','rejected','suspended');
CREATE TYPE member_status_enum AS ENUM ('active','suspended','revoked');

-- profiles
CREATE TABLE profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_provider auth_provider_enum NOT NULL DEFAULT 'password',
  email citext UNIQUE NOT NULL,
  email_verified_at timestamptz,
  phone text,
  full_name text,
  avatar_url text,
  account_type account_type_enum NOT NULL DEFAULT 'buyer',
  status user_status_enum NOT NULL DEFAULT 'active',
  mfa_enabled boolean NOT NULL DEFAULT false,
  mfa_secret_encrypted text,
  mfa_enforced boolean NOT NULL DEFAULT false,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_profiles_account_type ON profiles(account_type);
CREATE INDEX idx_profiles_status ON profiles(status);
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- roles
CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- permissions
CREATE TABLE permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- role_permissions
CREATE TABLE role_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- store_members
CREATE TABLE store_members (
  profile_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE RESTRICT,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by uuid REFERENCES profiles(id),
  status member_status_enum NOT NULL DEFAULT 'active',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_store_members_updated_at BEFORE UPDATE ON store_members
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- member_permissions (override)
CREATE TABLE member_permissions (
  member_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES profiles(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  PRIMARY KEY (member_id, permission_id)
);

-- Helpers (now safe since tables exist)
CREATE OR REPLACE FUNCTION current_account_type() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT account_type::text FROM profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION is_active_user() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT status = 'active' FROM profiles WHERE id = auth.uid()), false)
$$;

CREATE OR REPLACE FUNCTION is_super_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM store_members sm
    JOIN roles r ON r.id = sm.role_id
    WHERE sm.profile_id = auth.uid()
      AND r.code = 'super_admin'
      AND sm.status = 'active'
  )
$$;

CREATE OR REPLACE FUNCTION is_admin_or_above() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM store_members sm
    JOIN roles r ON r.id = sm.role_id
    WHERE sm.profile_id = auth.uid()
      AND r.code IN ('super_admin','admin')
      AND sm.status = 'active'
  )
$$;

CREATE OR REPLACE FUNCTION staff_has(perm text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM member_permissions mp
    JOIN permissions p ON p.id = mp.permission_id
    WHERE mp.member_id = auth.uid()
      AND p.code = perm
      AND (mp.expires_at IS NULL OR mp.expires_at > now())
  ) OR EXISTS (
    SELECT 1 FROM store_members sm
    JOIN role_permissions rp ON rp.role_id = sm.role_id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE sm.profile_id = auth.uid()
      AND p.code = perm
      AND sm.status = 'active'
  )
$$;

-- seller_profiles
CREATE TABLE seller_profiles (
  profile_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE RESTRICT,
  display_name text NOT NULL,
  bio text,
  avatar_url text,
  status seller_status_enum NOT NULL DEFAULT 'pending',
  agreement_accepted_at timestamptz,
  agreement_version text,
  approved_by uuid REFERENCES profiles(id),
  approved_at timestamptz,
  rejected_by uuid REFERENCES profiles(id),
  rejected_at timestamptz,
  rejection_reason text,
  suspended_by uuid REFERENCES profiles(id),
  suspended_at timestamptz,
  suspension_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_seller_profiles_status ON seller_profiles(status);
CREATE TRIGGER trg_seller_profiles_updated_at BEFORE UPDATE ON seller_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION is_approved_seller() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT status = 'approved' FROM seller_profiles WHERE profile_id = auth.uid()), false)
$$;