-- ============================================================
-- 006_downloads_and_compensation.sql
-- ============================================================

CREATE TYPE download_session_status_enum AS ENUM (
  'active','completed','expired','expired_partial','exhausted',
  'compensation_pending','compensation_active','revoked'
);
CREATE TYPE download_token_scope_enum AS ENUM ('single','zip');
CREATE TYPE download_attempt_type_enum AS ENUM ('zip','single_files');
CREATE TYPE download_delivery_type_enum AS ENUM ('single','zip');
CREATE TYPE compensation_status_enum AS ENUM ('pending','approved','rejected','fulfilled','cancelled');
CREATE TYPE exception_status_enum AS ENUM ('pending','approved','rejected','fulfilled');

CREATE TABLE download_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id uuid NOT NULL REFERENCES purchase_codes(id) ON DELETE RESTRICT,
  order_item_id uuid NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
  product_version_id uuid NOT NULL REFERENCES product_versions(id) ON DELETE RESTRICT,
  buyer_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  status download_session_status_enum NOT NULL DEFAULT 'active',
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  ended_at timestamptz,
  is_compensation boolean NOT NULL DEFAULT false,
  parent_session_id uuid REFERENCES download_sessions(id) ON DELETE SET NULL,
  compensation_request_id uuid,
  attempt_consumed boolean NOT NULL DEFAULT false,
  revocation_suggested_by_system boolean NOT NULL DEFAULT false,
  revocation_confirmed_by uuid REFERENCES profiles(id),
  revocation_reason text,
  revoked_at timestamptz,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_download_session_revoke_no_delivery CHECK (
    (status <> 'revoked') OR (revoked_at IS NOT NULL)
  )
);
CREATE INDEX idx_download_sessions_code ON download_sessions(code_id);
CREATE INDEX idx_download_sessions_status ON download_sessions(status);
CREATE INDEX idx_download_sessions_buyer ON download_sessions(buyer_id);

-- Trigger: default expiry = started_at + config duration (fallback 4h)
CREATE OR REPLACE FUNCTION set_download_session_expiry() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_duration int;
BEGIN
  IF NEW.expires_at IS NULL THEN
    -- duration read from settings table if exists, else 4
    BEGIN
      SELECT session_duration_hours INTO v_duration FROM download_settings WHERE id = 1;
    EXCEPTION WHEN undefined_table THEN
      v_duration := 4;
    END;
    IF v_duration IS NULL THEN v_duration := 4; END IF;
    NEW.expires_at := NEW.started_at + (v_duration || ' hours')::interval;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_download_sessions_expiry BEFORE INSERT ON download_sessions
  FOR EACH ROW EXECUTE FUNCTION set_download_session_expiry();

-- Helper: has any delivery been started?
CREATE OR REPLACE FUNCTION session_has_started_delivery(p_session_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM download_deliveries WHERE session_id = p_session_id)
$$;

-- Trigger: block revoke after delivery started
CREATE OR REPLACE FUNCTION block_session_revoke_after_delivery() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'revoked' AND OLD.status <> 'revoked' THEN
    IF session_has_started_delivery(OLD.id) THEN
      RAISE EXCEPTION 'session_revocation_blocked_after_delivery';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_download_sessions_block_revoke
  BEFORE UPDATE ON download_sessions
  FOR EACH ROW EXECUTE FUNCTION block_session_revoke_after_delivery();

CREATE TABLE download_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES download_sessions(id) ON DELETE CASCADE,
  token_hash text UNIQUE NOT NULL,
  scope download_token_scope_enum NOT NULL,
  file_version_id uuid REFERENCES file_versions(id) ON DELETE RESTRICT,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_download_tokens_session ON download_tokens(session_id);

CREATE TABLE download_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
  session_id uuid REFERENCES download_sessions(id) ON DELETE SET NULL,
  attempt_number int NOT NULL,
  type download_attempt_type_enum NOT NULL,
  consumed_at timestamptz NOT NULL DEFAULT now(),
  completed boolean NOT NULL DEFAULT false,
  UNIQUE (order_item_id, attempt_number),
  CONSTRAINT chk_attempt_number_positive CHECK (attempt_number >= 1)
);
CREATE INDEX idx_download_attempts_order_item ON download_attempts(order_item_id);

CREATE TABLE download_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES download_sessions(id) ON DELETE CASCADE,
  file_version_id uuid NOT NULL REFERENCES file_versions(id) ON DELETE RESTRICT,
  delivery_type download_delivery_type_enum NOT NULL,
  delivered_at timestamptz NOT NULL DEFAULT now(),
  bytes_sent bigint,
  checksum text,
  completed boolean NOT NULL DEFAULT false,
  failure_reason text
);
-- Partial unique: only completed deliveries are unique per (session, file)
CREATE UNIQUE INDEX uq_download_deliveries_completed
  ON download_deliveries(session_id, file_version_id)
  WHERE completed = true;
CREATE INDEX idx_download_deliveries_session ON download_deliveries(session_id);

CREATE TABLE compensation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id uuid NOT NULL REFERENCES purchase_codes(id) ON DELETE RESTRICT,
  original_session_id uuid REFERENCES download_sessions(id) ON DELETE SET NULL,
  status compensation_status_enum NOT NULL DEFAULT 'pending',
  reason text NOT NULL,
  admin_reason text,
  requested_by uuid NOT NULL REFERENCES profiles(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid REFERENCES profiles(id),
  decided_at timestamptz,
  approved_session_id uuid REFERENCES download_sessions(id) ON DELETE SET NULL,
  sequence_number int NOT NULL,
  UNIQUE (code_id, sequence_number),
  CONSTRAINT chk_compensation_sequence CHECK (sequence_number BETWEEN 1 AND 3)
);
CREATE INDEX idx_compensation_code ON compensation_requests(code_id);

-- Attach FK from download_sessions.compensation_request_id
ALTER TABLE download_sessions
  ADD CONSTRAINT fk_download_sessions_compensation
  FOREIGN KEY (compensation_request_id) REFERENCES compensation_requests(id) ON DELETE SET NULL;

CREATE TABLE attempt_exception_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id uuid NOT NULL REFERENCES purchase_codes(id) ON DELETE RESTRICT,
  session_id uuid REFERENCES download_sessions(id) ON DELETE SET NULL,
  status exception_status_enum NOT NULL DEFAULT 'pending',
  reason text NOT NULL,
  decision_reason text,
  granted_attempts int,
  requested_by uuid REFERENCES profiles(id),
  decided_by uuid REFERENCES profiles(id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_granted_attempts_positive CHECK (granted_attempts IS NULL OR granted_attempts > 0)
);
CREATE INDEX idx_attempt_exceptions_code ON attempt_exception_requests(code_id);

-- Helper: buyer owns session
CREATE OR REPLACE FUNCTION buyer_owns_session(p_session_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM download_sessions ds
    WHERE ds.id = p_session_id
      AND (
        ds.buyer_id = auth.uid()
        OR buyer_owns_code(ds.code_id)
      )
  )
$$;

-- View: hide admin_reason unless rejected
CREATE VIEW buyer_compensation_view AS
SELECT
  id, code_id, original_session_id, status,
  reason,
  CASE WHEN status = 'rejected' THEN admin_reason ELSE NULL END AS admin_reason,
  requested_at, decided_at, approved_session_id, sequence_number
FROM compensation_requests;