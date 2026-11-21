-- ============================================================
-- 021_seller_operations.sql
-- Atomic seller-side operations
-- ============================================================

-- At most one 'published' version per product
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_version_single_published
  ON product_versions(product_id)
  WHERE status = 'published';

-- Validate that a version can be published
CREATE OR REPLACE FUNCTION validate_version_publishable(p_version_id uuid)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_version product_versions%ROWTYPE;
  v_unready int;
  v_total int;
BEGIN
  SELECT * INTO v_version FROM product_versions WHERE id = p_version_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'version_not_found'; END IF;

  SELECT COUNT(*) INTO v_total
    FROM product_version_files WHERE product_version_id = p_version_id;

  IF v_total = 0 THEN
    RAISE EXCEPTION 'version_has_no_files';
  END IF;

  SELECT COUNT(*) INTO v_unready
    FROM product_version_files pvf
    JOIN file_versions fv ON fv.id = pvf.file_version_id
    WHERE pvf.product_version_id = p_version_id
      AND fv.scan_status <> 'ready';

  IF v_unready > 0 THEN
    RAISE EXCEPTION 'version_has_unready_files: %', v_unready;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION validate_version_publishable(uuid) TO authenticated, service_role;

-- Publish a version (archives the currently published one, if any)
CREATE OR REPLACE FUNCTION publish_product_version(p_version_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_version product_versions%ROWTYPE;
  v_product products%ROWTYPE;
BEGIN
  SELECT * INTO v_version FROM product_versions WHERE id = p_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'version_not_found'; END IF;

  SELECT * INTO v_product FROM products WHERE id = v_version.product_id FOR UPDATE;
  IF v_product.seller_id <> auth.uid() THEN RAISE EXCEPTION 'forbidden'; END IF;

  PERFORM validate_version_publishable(p_version_id);

  -- Archive the previous published version (if any)
  UPDATE product_versions
    SET status = 'archived'
    WHERE product_id = v_product.id
      AND status = 'published'
      AND id <> p_version_id;

  UPDATE product_versions
    SET status = 'published', published_at = coalesce(published_at, now())
    WHERE id = p_version_id;

  -- Also ensure the product is published
  UPDATE products
    SET status = 'published',
        published_at = coalesce(published_at, now())
    WHERE id = v_product.id AND status <> 'published';

  PERFORM log_audit('product.published', 'products', v_product.id,
    jsonb_build_object('previous_version', (SELECT id FROM product_versions WHERE product_id = v_product.id AND status = 'published' LIMIT 1)),
    jsonb_build_object('published_version', p_version_id),
    NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION publish_product_version(uuid) TO authenticated, service_role;

-- Unpublish the product (pauses it, keeps versions as-is)
CREATE OR REPLACE FUNCTION unpublish_product(p_product_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_product products%ROWTYPE;
BEGIN
  SELECT * INTO v_product FROM products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'product_not_found'; END IF;
  IF v_product.seller_id <> auth.uid() THEN RAISE EXCEPTION 'forbidden'; END IF;

  UPDATE products SET status = 'paused' WHERE id = p_product_id;

  PERFORM log_audit('product.paused', 'products', p_product_id,
    jsonb_build_object('status', v_product.status),
    jsonb_build_object('status', 'paused'),
    NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION unpublish_product(uuid) TO authenticated, service_role;

-- Add a file to a version (validates ownership + readiness)
CREATE OR REPLACE FUNCTION add_file_to_version(
  p_version_id uuid,
  p_file_version_id uuid
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_version product_versions%ROWTYPE;
  v_product products%ROWTYPE;
  v_fv file_versions%ROWTYPE;
  v_file files%ROWTYPE;
  v_id uuid;
BEGIN
  SELECT * INTO v_version FROM product_versions WHERE id = p_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'version_not_found'; END IF;

  SELECT * INTO v_product FROM products WHERE id = v_version.product_id;
  IF v_product.seller_id <> auth.uid() THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT * INTO v_fv FROM file_versions WHERE id = p_file_version_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'file_version_not_found'; END IF;
  IF v_fv.scan_status <> 'ready' THEN RAISE EXCEPTION 'file_not_ready'; END IF;

  SELECT * INTO v_file FROM files WHERE id = v_fv.file_id;
  IF v_file.seller_id <> auth.uid() THEN RAISE EXCEPTION 'file_not_owned'; END IF;

  INSERT INTO product_version_files(product_version_id, file_version_id)
    VALUES (p_version_id, p_file_version_id)
    ON CONFLICT (product_version_id, file_version_id) DO NOTHING
    RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM product_version_files
      WHERE product_version_id = p_version_id AND file_version_id = p_file_version_id;
  END IF;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION add_file_to_version(uuid, uuid) TO authenticated, service_role;

-- Request payout (validates min + deducts balance atomically)
CREATE OR REPLACE FUNCTION request_payout(
  p_amount numeric,
  p_currency char(3),
  p_method text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_seller uuid := auth.uid();
  v_wallet seller_wallets%ROWTYPE;
  v_min numeric;
  v_min_cur char(3);
  v_payout_id uuid;
BEGIN
  -- Verify seller is approved
  IF NOT is_approved_seller() THEN RAISE EXCEPTION 'seller_not_approved'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;

  SELECT * INTO v_wallet FROM seller_wallets
    WHERE seller_id = v_seller AND currency = p_currency FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found'; END IF;

  SELECT minimum_amount, minimum_currency INTO v_min, v_min_cur
    FROM payout_settings WHERE id = 1;

  IF v_min IS NOT NULL AND p_currency = v_min_cur AND p_amount < v_min THEN
    RAISE EXCEPTION 'below_minimum_payout: % %', v_min, v_min_cur;
  END IF;

  IF v_wallet.balance < p_amount THEN
    RAISE EXCEPTION 'insufficient_balance';
  END IF;

  INSERT INTO seller_payouts(
    seller_id, amount, currency, amount_in_usd, status, method
  ) VALUES (
    v_seller, p_amount, p_currency, p_amount, 'requested', p_method
  ) RETURNING id INTO v_payout_id;

  -- Deduct balance immediately (will be restored on rejection)
  UPDATE seller_wallets
    SET balance = balance - p_amount
    WHERE id = v_wallet.id;

  INSERT INTO financial_transactions(wallet_id, type, amount, currency, reference_type, reference_id)
    VALUES (v_wallet.id, 'payout', -p_amount, p_currency, 'payout_request', v_payout_id);

  PERFORM log_audit('payout.requested', 'seller_payouts', v_payout_id, NULL,
    jsonb_build_object('amount', p_amount, 'currency', p_currency::text), NULL);

  RETURN v_payout_id;
END;
$$;

GRANT EXECUTE ON FUNCTION request_payout(numeric, char, text) TO authenticated;

-- Approve payout
CREATE OR REPLACE FUNCTION approve_payout(p_payout_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE seller_payouts
    SET status = 'approved',
        decided_by = auth.uid(),
        decided_at = now()
    WHERE id = p_payout_id AND status = 'requested';

  IF NOT FOUND THEN RAISE EXCEPTION 'payout_not_pending'; END IF;

  PERFORM log_audit('payout.approved', 'seller_payouts', p_payout_id, NULL, NULL, NULL);
END;
$$;

-- Mark as paid
CREATE OR REPLACE FUNCTION mark_payout_paid(p_payout_id uuid, p_reference text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE seller_payouts
    SET status = 'paid', paid_at = now(), reference = p_reference
    WHERE id = p_payout_id AND status = 'approved';

  IF NOT FOUND THEN RAISE EXCEPTION 'payout_not_approved'; END IF;

  PERFORM log_audit('payout.paid', 'seller_payouts', p_payout_id, NULL,
    jsonb_build_object('reference', p_reference), NULL);
END;
$$;

-- Reject payout (restores balance)
CREATE OR REPLACE FUNCTION reject_payout(p_payout_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_payout seller_payouts%ROWTYPE;
  v_wallet_id uuid;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  SELECT * INTO v_payout FROM seller_payouts WHERE id = p_payout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payout_not_found'; END IF;
  IF v_payout.status <> 'requested' THEN RAISE EXCEPTION 'payout_not_pending'; END IF;

  UPDATE seller_payouts
    SET status = 'rejected',
        decided_by = auth.uid(),
        decided_at = now(),
        reference = p_reason
    WHERE id = p_payout_id;

  -- Restore balance
  SELECT id INTO v_wallet_id FROM seller_wallets
    WHERE seller_id = v_payout.seller_id AND currency = v_payout.currency;

  IF v_wallet_id IS NOT NULL THEN
    UPDATE seller_wallets SET balance = balance + v_payout.amount WHERE id = v_wallet_id;

    INSERT INTO financial_transactions(wallet_id, type, amount, currency, reference_type, reference_id)
      VALUES (v_wallet_id, 'adjustment', v_payout.amount, v_payout.currency, 'payout_rejected', p_payout_id);
  END IF;

  PERFORM log_audit('payout.rejected', 'seller_payouts', p_payout_id, NULL, NULL, p_reason);
END;
$$;

REVOKE ALL ON FUNCTION request_payout(numeric, char, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION approve_payout(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION mark_payout_paid(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION reject_payout(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION request_payout(numeric, char, text) TO authenticated;
GRANT EXECUTE ON FUNCTION approve_payout(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION mark_payout_paid(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION reject_payout(uuid, text) TO authenticated, service_role;