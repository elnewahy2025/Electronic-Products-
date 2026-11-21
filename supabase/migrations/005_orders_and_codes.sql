-- ============================================================
-- 005_orders_and_codes.sql
-- ============================================================

CREATE TYPE purchase_request_status_enum AS ENUM ('created','pending','approved','rejected','cancelled','completed');
CREATE TYPE order_status_enum AS ENUM ('created','paid','fulfilled','cancelled');
CREATE TYPE code_status_enum AS ENUM ('issued','delivered','redeemed','expired','revoked');
CREATE TYPE delivery_channel_enum AS ENUM ('email','sms','manual');
CREATE TYPE delivery_result_enum AS ENUM ('sent','failed');
CREATE TYPE delivery_confirmation_method_enum AS ENUM ('auto','manual');

CREATE TABLE purchase_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  customer_email citext,
  customer_phone text,
  status purchase_request_status_enum NOT NULL DEFAULT 'created',
  total_amount numeric(18,4) NOT NULL DEFAULT 0,
  currency char(3) NOT NULL DEFAULT 'USD',
  exchange_rate_at_purchase numeric(18,8) NOT NULL DEFAULT 1,
  amount_in_usd numeric(18,4) NOT NULL DEFAULT 0,
  cancelled_by uuid REFERENCES profiles(id),
  cancel_reason text,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_purchase_requests_contact CHECK (
    buyer_id IS NOT NULL OR customer_email IS NOT NULL OR customer_phone IS NOT NULL
  )
);
CREATE INDEX idx_purchase_requests_buyer ON purchase_requests(buyer_id);
CREATE INDEX idx_purchase_requests_email ON purchase_requests(customer_email);
CREATE INDEX idx_purchase_requests_status ON purchase_requests(status);
CREATE TRIGGER trg_purchase_requests_updated_at BEFORE UPDATE ON purchase_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE purchase_request_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_request_id uuid NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_version_id uuid REFERENCES product_versions(id) ON DELETE RESTRICT,
  unit_price numeric(18,4) NOT NULL,
  currency char(3) NOT NULL DEFAULT 'USD',
  quantity int NOT NULL DEFAULT 1,
  CONSTRAINT chk_pri_quantity CHECK (quantity > 0)
);

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_request_id uuid NOT NULL REFERENCES purchase_requests(id) ON DELETE RESTRICT,
  buyer_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  status order_status_enum NOT NULL DEFAULT 'created',
  total_amount numeric(18,4) NOT NULL DEFAULT 0,
  currency char(3) NOT NULL DEFAULT 'USD',
  amount_in_usd numeric(18,4) NOT NULL DEFAULT 0,
  exchange_rate_at_purchase numeric(18,8) NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_version_id uuid NOT NULL REFERENCES product_versions(id) ON DELETE RESTRICT,
  price numeric(18,4) NOT NULL,
  currency char(3) NOT NULL DEFAULT 'USD',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_items_order ON order_items(order_id);

CREATE TABLE purchase_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
  code_hash text UNIQUE NOT NULL,
  code_prefix char(4) NOT NULL,
  status code_status_enum NOT NULL DEFAULT 'issued',
  issued_by uuid REFERENCES profiles(id),
  issued_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  delivered_by uuid REFERENCES profiles(id),
  delivery_confirmation_method delivery_confirmation_method_enum,
  redeemed_at timestamptz,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES profiles(id),
  revoke_reason text,
  replacement_for_code_id uuid REFERENCES purchase_codes(id) ON DELETE SET NULL,
  replacement_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_code_revoke_requires_no_delivery CHECK (
    (status <> 'revoked') OR (delivered_at IS NULL)
  )
);
CREATE INDEX idx_purchase_codes_order_item ON purchase_codes(order_item_id);
CREATE INDEX idx_purchase_codes_status ON purchase_codes(status);

-- Trigger: expires_at = issued_at + 72h (unless manually provided)
CREATE OR REPLACE FUNCTION set_purchase_code_expiry() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := NEW.issued_at + interval '72 hours';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_purchase_codes_expiry BEFORE INSERT ON purchase_codes
  FOR EACH ROW EXECUTE FUNCTION set_purchase_code_expiry();

-- Trigger: block revoke after delivery (hard fail)
CREATE OR REPLACE FUNCTION block_code_revoke_after_delivery() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'revoked' AND OLD.delivered_at IS NOT NULL THEN
    RAISE EXCEPTION 'code_revocation_blocked_after_delivery';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_purchase_codes_block_revoke
  BEFORE UPDATE ON purchase_codes
  FOR EACH ROW EXECUTE FUNCTION block_code_revoke_after_delivery();

CREATE TABLE code_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id uuid UNIQUE NOT NULL REFERENCES purchase_codes(id) ON DELETE RESTRICT,
  redeemed_by uuid REFERENCES profiles(id),
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  ip inet,
  user_agent text,
  session_id uuid
);

CREATE TABLE code_delivery_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id uuid NOT NULL REFERENCES purchase_codes(id) ON DELETE CASCADE,
  channel delivery_channel_enum NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  sent_by uuid REFERENCES profiles(id),
  result delivery_result_enum NOT NULL DEFAULT 'sent',
  error text
);
CREATE INDEX idx_code_delivery_attempts_code ON code_delivery_attempts(code_id);

-- ---------- Helpers ----------
CREATE OR REPLACE FUNCTION buyer_owns_purchase(p_purchase_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM purchase_requests
    WHERE id = p_purchase_id
      AND (buyer_id = auth.uid() OR customer_email = auth.email())
  )
$$;

CREATE OR REPLACE FUNCTION buyer_owns_code(p_code_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM purchase_codes pc
    JOIN order_items oi ON oi.id = pc.order_item_id
    JOIN orders o ON o.id = oi.order_id
    JOIN purchase_requests pr ON pr.id = o.purchase_request_id
    WHERE pc.id = p_code_id
      AND (pr.buyer_id = auth.uid() OR pr.customer_email = auth.email())
  )
$$;

CREATE OR REPLACE FUNCTION code_is_delivered(p_code_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT delivered_at IS NOT NULL FROM purchase_codes WHERE id = p_code_id), false)
$$;

CREATE OR REPLACE FUNCTION buyer_owns_order_item(p_order_item_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    JOIN purchase_requests pr ON pr.id = o.purchase_request_id
    WHERE oi.id = p_order_item_id
      AND (pr.buyer_id = auth.uid() OR pr.customer_email = auth.email())
  )
$$;

-- Trigger: block cancel after any code delivered
CREATE OR REPLACE FUNCTION block_cancel_after_delivery() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
    IF EXISTS (
      SELECT 1
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN purchase_codes pc ON pc.order_item_id = oi.id
      WHERE o.purchase_request_id = NEW.id
        AND pc.delivered_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'purchase_request_cancel_blocked_after_delivery';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_purchase_requests_block_cancel
  BEFORE UPDATE ON purchase_requests
  FOR EACH ROW EXECUTE FUNCTION block_cancel_after_delivery();

-- Safe view for buyers: no code_hash
CREATE VIEW buyer_codes_view AS
SELECT pc.id, pc.order_item_id, pc.code_prefix, pc.status,
       pc.issued_at, pc.delivered_at, pc.expires_at, pc.redeemed_at,
       pc.replacement_for_code_id
FROM purchase_codes pc;