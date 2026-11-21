-- ============================================================
-- 007_finance.sql
-- ============================================================

CREATE TYPE commission_scope_enum AS ENUM ('global','product_type','category');
CREATE TYPE wallet_tx_type_enum AS ENUM ('earning','commission','payout','adjustment');
CREATE TYPE payout_status_enum AS ENUM ('requested','approved','rejected','paid');
CREATE TYPE payment_status_enum AS ENUM ('pending','succeeded','failed','refunded');

CREATE TABLE exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency char(3) NOT NULL,
  quote_currency char(3) NOT NULL,
  rate numeric(18,8) NOT NULL,
  set_by uuid REFERENCES profiles(id),
  set_at timestamptz NOT NULL DEFAULT now(),
  effective_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_rate_positive CHECK (rate > 0),
  UNIQUE (base_currency, quote_currency, effective_at)
);
CREATE INDEX idx_exchange_rates_pair ON exchange_rates(base_currency, quote_currency, effective_at DESC);

CREATE TABLE seller_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES seller_profiles(profile_id) ON DELETE CASCADE,
  scope commission_scope_enum NOT NULL DEFAULT 'global',
  reference_id uuid,
  rate numeric(5,4) NOT NULL,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  CONSTRAINT chk_commission_rate CHECK (rate >= 0 AND rate <= 1)
);
CREATE INDEX idx_seller_commissions_seller ON seller_commissions(seller_id);

CREATE TABLE seller_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES seller_profiles(profile_id) ON DELETE CASCADE,
  currency char(3) NOT NULL DEFAULT 'USD',
  balance numeric(18,4) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (seller_id, currency)
);
CREATE TRIGGER trg_seller_wallets_updated_at BEFORE UPDATE ON seller_wallets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE financial_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES seller_wallets(id) ON DELETE RESTRICT,
  type wallet_tx_type_enum NOT NULL,
  amount numeric(18,4) NOT NULL,
  currency char(3) NOT NULL,
  reference_type text,
  reference_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fin_tx_wallet ON financial_transactions(wallet_id, created_at DESC);

CREATE TABLE seller_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES seller_profiles(profile_id) ON DELETE RESTRICT,
  amount numeric(18,4) NOT NULL,
  currency char(3) NOT NULL DEFAULT 'USD',
  amount_in_usd numeric(18,4) NOT NULL,
  status payout_status_enum NOT NULL DEFAULT 'requested',
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid REFERENCES profiles(id),
  decided_at timestamptz,
  paid_at timestamptz,
  method text,
  reference text,
  CONSTRAINT chk_payout_amount_positive CHECK (amount > 0)
);
CREATE INDEX idx_seller_payouts_seller ON seller_payouts(seller_id, status);

-- Payments: disabled in phase 1 (empty table, structure only)
CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE RESTRICT,
  amount numeric(18,4) NOT NULL,
  currency char(3) NOT NULL,
  provider text,
  provider_reference text,
  status payment_status_enum NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);