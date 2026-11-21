-- ============================================================
-- 008_reviews_and_ops.sql
-- ============================================================

CREATE TYPE review_status_enum AS ENUM ('published','deleted');
CREATE TYPE report_status_enum AS ENUM ('open','resolved','dismissed');
CREATE TYPE ticket_status_enum AS ENUM ('open','pending','closed');
CREATE TYPE security_severity_enum AS ENUM ('low','medium','high','critical');

CREATE TABLE reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  buyer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  order_item_id uuid NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
  rating smallint NOT NULL,
  body text,
  status review_status_enum NOT NULL DEFAULT 'published',
  deleted_by uuid REFERENCES profiles(id),
  delete_reason text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, buyer_id),
  CONSTRAINT chk_review_rating CHECK (rating BETWEEN 1 AND 5)
);
CREATE INDEX idx_reviews_product ON reviews(product_id, status);

CREATE TABLE favorites (
  buyer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (buyer_id, product_id)
);

CREATE TABLE content_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  reason text NOT NULL,
  status report_status_enum NOT NULL DEFAULT 'open',
  resolved_by uuid REFERENCES profiles(id),
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_content_reports_status ON content_reports(status);

CREATE TABLE support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject text NOT NULL,
  status ticket_status_enum NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_support_tickets_updated_at BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  body text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_support_messages_ticket ON support_messages(ticket_id, created_at);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);

CREATE TABLE security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  actor_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ip inet,
  user_agent text,
  severity security_severity_enum NOT NULL DEFAULT 'medium',
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_security_events_created ON security_events(created_at DESC);

CREATE TYPE backup_job_type_enum AS ENUM ('auto','manual');
CREATE TYPE backup_job_status_enum AS ENUM ('running','completed','failed');

CREATE TABLE backup_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type backup_job_type_enum NOT NULL,
  status backup_job_status_enum NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  size_bytes bigint,
  storage_location text,
  error text,
  triggered_by uuid REFERENCES profiles(id)
);

CREATE TABLE backup_archives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_job_id uuid NOT NULL REFERENCES backup_jobs(id) ON DELETE CASCADE,
  period_start timestamptz,
  period_end timestamptz,
  storage_location text NOT NULL,
  checksum text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE restore_status_enum AS ENUM ('running','completed','failed');

CREATE TABLE restore_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_archive_id uuid NOT NULL REFERENCES backup_archives(id) ON DELETE RESTRICT,
  status restore_status_enum NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  error text,
  performed_by uuid REFERENCES profiles(id)
);

CREATE TABLE retention_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity text UNIQUE NOT NULL,
  retention_days int NOT NULL,
  action text NOT NULL DEFAULT 'archive',
  updated_by uuid REFERENCES profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_retention_action CHECK (action IN ('archive','delete'))
);