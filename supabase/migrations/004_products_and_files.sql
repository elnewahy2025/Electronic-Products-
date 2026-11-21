-- ============================================================
-- 004_products_and_files.sql
-- ============================================================

-- Enums
CREATE TYPE product_status_enum AS ENUM ('draft','published','paused','suspended','rejected','deleted','archived');
CREATE TYPE version_status_enum AS ENUM ('draft','published','archived');
CREATE TYPE file_scan_status_enum AS ENUM ('uploading','uploaded','scanning','quarantined','processing','ready','failed','deleted','backup_only');
CREATE TYPE storage_provider_enum AS ENUM ('google_drive','r2','s3');
CREATE TYPE preview_type_enum AS ENUM ('image','video','document');
CREATE TYPE preview_quality_enum AS ENUM ('low','medium','high');
CREATE TYPE scan_job_status_enum AS ENUM ('queued','running','passed','failed','quarantined');
CREATE TYPE upload_session_status_enum AS ENUM ('initiated','uploading','completed','aborted','expired');

CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES seller_profiles(profile_id) ON DELETE RESTRICT,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  short_description text,
  description text,
  price_amount numeric(18,4) NOT NULL,
  price_currency char(3) NOT NULL DEFAULT 'USD',
  status product_status_enum NOT NULL DEFAULT 'draft',
  rejection_reason text,
  suspension_reason text,
  min_price_checked_at timestamptz,
  published_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_product_price_positive CHECK (price_amount > 0)
);
CREATE INDEX idx_products_status ON products(status, published_at DESC);
CREATE INDEX idx_products_seller ON products(seller_id, status);
CREATE INDEX idx_products_search ON products USING gin(to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(description,'')));
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE product_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  version_number int NOT NULL,
  status version_status_enum NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, version_number)
);

CREATE TABLE files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES seller_profiles(profile_id) ON DELETE RESTRICT,
  original_name text NOT NULL,
  display_name text,
  mime text,
  extension text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE file_storage_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider storage_provider_enum NOT NULL,
  seller_drive_account_id uuid REFERENCES seller_drive_accounts(id) ON DELETE SET NULL,
  provider_file_id text,
  provider_folder_id text,
  internal_path text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE file_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id uuid NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
  version_number int NOT NULL,
  storage_location_id uuid REFERENCES file_storage_locations(id) ON DELETE SET NULL,
  size_bytes bigint NOT NULL DEFAULT 0,
  checksum_sha256 text,
  mime text,
  extension text,
  scan_status file_scan_status_enum NOT NULL DEFAULT 'uploading',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (file_id, version_number)
);

CREATE TABLE product_version_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_version_id uuid NOT NULL REFERENCES product_versions(id) ON DELETE CASCADE,
  file_version_id uuid NOT NULL REFERENCES file_versions(id) ON DELETE RESTRICT,
  display_name text,
  sort_order int NOT NULL DEFAULT 0,
  included_in_zip boolean NOT NULL DEFAULT true,
  UNIQUE (product_version_id, file_version_id)
);

CREATE TABLE file_previews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_version_id uuid NOT NULL REFERENCES file_versions(id) ON DELETE CASCADE,
  preview_type preview_type_enum NOT NULL,
  storage_location_id uuid REFERENCES file_storage_locations(id) ON DELETE SET NULL,
  quality preview_quality_enum NOT NULL DEFAULT 'medium',
  watermark_text text,
  watermark_applied boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'pending',
  generated_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE upload_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES seller_profiles(profile_id) ON DELETE CASCADE,
  file_id uuid REFERENCES files(id) ON DELETE CASCADE,
  provider storage_provider_enum NOT NULL,
  provider_upload_url text,
  status upload_session_status_enum NOT NULL DEFAULT 'initiated',
  bytes_uploaded bigint NOT NULL DEFAULT 0,
  total_bytes bigint,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_upload_sessions_seller ON upload_sessions(seller_id);

CREATE TABLE scan_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_version_id uuid NOT NULL REFERENCES file_versions(id) ON DELETE CASCADE,
  status scan_job_status_enum NOT NULL DEFAULT 'queued',
  engine text,
  result jsonb,
  queued_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);

CREATE TABLE quarantine_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_version_id uuid NOT NULL REFERENCES file_versions(id) ON DELETE CASCADE,
  reason text NOT NULL,
  quarantined_by uuid REFERENCES profiles(id),
  quarantined_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  released_by uuid REFERENCES profiles(id),
  notes text
);

CREATE TABLE allowed_file_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  extension text UNIQUE NOT NULL,
  mime text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  max_size_bytes bigint,
  updated_by uuid REFERENCES profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL
);

CREATE TABLE product_tags (
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, tag_id)
);

-- Helper functions (products exist now)
CREATE OR REPLACE FUNCTION seller_owns_product(p_product_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM products WHERE id = p_product_id AND seller_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION seller_owns_file(p_file_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM files WHERE id = p_file_id AND seller_id = auth.uid()
  )
$$;

-- Safe views
CREATE VIEW files_safe AS
  SELECT id, seller_id, original_name, display_name, mime, extension, created_at
  FROM files;

CREATE VIEW file_versions_safe AS
  SELECT id, file_id, version_number, size_bytes, checksum_sha256, mime, extension, scan_status, created_at
  FROM file_versions;