-- ============================================================
-- 016_purchase_and_staff.sql
-- Purchase approval → Order → Codes; Staff management helpers
-- ============================================================

-- Approve a purchase request and issue one code per item atomically.
-- Returns an array of { code_id, plaintext } for one-time display.
CREATE OR REPLACE FUNCTION approve_purchase_request(
  p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_req purchase_requests%ROWTYPE;
  v_order_id uuid;
  v_item record;
  v_code_id uuid;
  v_code text;
  v_hash text;
  v_prefix char(4);
  v_chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_pepper text;
  v_attempt int;
  v_output jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_req FROM purchase_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'purchase_request_not_found'; END IF;
  IF v_req.status NOT IN ('created','pending') THEN
    RAISE EXCEPTION 'purchase_request_not_approvable';
  END IF;

  -- Create order
  INSERT INTO orders(
    purchase_request_id, buyer_id, status,
    total_amount, currency, amount_in_usd, exchange_rate_at_purchase
  ) VALUES (
    v_req.id, v_req.buyer_id, 'created',
    v_req.total_amount, v_req.currency, v_req.amount_in_usd, v_req.exchange_rate_at_purchase
  ) RETURNING id INTO v_order_id;

  SELECT COALESCE(NULLIF(current_setting('app.code_pepper', true), ''), 'default-pepper') INTO v_pepper;

  -- For each item: create order_item + one code
  FOR v_item IN
    SELECT id, product_id, product_version_id, unit_price, currency, quantity
    FROM purchase_request_items WHERE purchase_request_id = p_request_id
  LOOP
    IF v_item.product_version_id IS NULL THEN
      RAISE EXCEPTION 'product_version_required';
    END IF;

    -- Create order item
    DECLARE
      v_order_item_id uuid;
    BEGIN
      INSERT INTO order_items(order_id, product_id, product_version_id, price, currency)
      VALUES (v_order_id, v_item.product_id, v_item.product_version_id, v_item.unit_price, v_item.currency)
      RETURNING id INTO v_order_item_id;

      -- Generate the code
      v_attempt := 0;
      LOOP
        v_attempt := v_attempt + 1;
        IF v_attempt > 10 THEN RAISE EXCEPTION 'code_generation_failed'; END IF;

        v_code := '';
        FOR i IN 1..16 LOOP
          v_code := v_code || substr(v_chars, floor(random() * length(v_chars))::int + 1, 1);
          IF i IN (4,8,12) THEN v_code := v_code || '-'; END IF;
        END LOOP;

        v_hash := encode(hmac(v_code, v_pepper, 'sha256'), 'hex');
        v_prefix := substring(v_code from 1 for 4);

        BEGIN
          INSERT INTO purchase_codes(
            order_item_id, code_hash, code_prefix, status,
            issued_by, issued_at, expires_at
          ) VALUES (
            v_order_item_id, v_hash, v_prefix, 'issued',
            auth.uid(), now(), now() + interval '72 hours'
          ) RETURNING id INTO v_code_id;
          EXIT;
        EXCEPTION WHEN unique_violation THEN CONTINUE;
        END;
      END LOOP;

      -- Store plaintext for one-time display
      INSERT INTO code_plaintext_handoff(code_id, plaintext, expires_at)
        VALUES (v_code_id, v_code, now() + interval '10 minutes');

      v_output := v_output || jsonb_build_object(
        'code_id', v_code_id,
        'order_item_id', v_order_item_id,
        'code_prefix', v_prefix,
        'product_id', v_item.product_id
      );
    END;
  END LOOP;

  -- Update request status
  UPDATE purchase_requests SET status = 'approved' WHERE id = p_request_id;

  PERFORM log_audit('purchase_request.approved', 'purchase_requests', p_request_id,
    jsonb_build_object('status', v_req.status),
    jsonb_build_object('status', 'approved', 'order_id', v_order_id),
    NULL);

  RETURN v_output;
END;
$$;

-- Reject a purchase request
CREATE OR REPLACE FUNCTION reject_purchase_request(
  p_request_id uuid,
  p_reason text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  UPDATE purchase_requests
    SET status = 'rejected', cancel_reason = p_reason, cancelled_by = auth.uid(), cancelled_at = now()
    WHERE id = p_request_id AND status IN ('created','pending');

  IF NOT FOUND THEN RAISE EXCEPTION 'purchase_request_not_rejectable'; END IF;

  PERFORM log_audit('purchase_request.rejected', 'purchase_requests', p_request_id, NULL, NULL, p_reason);
END;
$$;

-- Assign a role to a profile by email (creates profile if missing, assigns role)
CREATE OR REPLACE FUNCTION invite_staff(
  p_email citext,
  p_role_code text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profile_id uuid;
  v_role_id uuid;
BEGIN
  IF NOT is_super_admin() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT id INTO v_role_id FROM roles WHERE code = p_role_code;
  IF v_role_id IS NULL THEN RAISE EXCEPTION 'role_not_found'; END IF;

  SELECT id INTO v_profile_id FROM profiles WHERE email = p_email;

  IF v_profile_id IS NULL THEN
    INSERT INTO profiles(email, account_type, status)
      VALUES (p_email, 'staff', 'active')
      RETURNING id INTO v_profile_id;
  ELSE
    UPDATE profiles SET account_type = 'staff' WHERE id = v_profile_id AND account_type <> 'staff';
  END IF;

  INSERT INTO store_members(profile_id, role_id, granted_by, status)
    VALUES (v_profile_id, v_role_id, auth.uid(), 'active')
    ON CONFLICT (profile_id) DO UPDATE
      SET role_id = EXCLUDED.role_id, status = 'active', granted_by = EXCLUDED.granted_by;

  PERFORM log_audit('auth.role_changed', 'store_members', v_profile_id, NULL,
    jsonb_build_object('role', p_role_code), NULL);

  RETURN v_profile_id;
END;
$$;

-- Revoke staff membership
CREATE OR REPLACE FUNCTION revoke_staff(p_profile_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_super_admin() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  UPDATE store_members SET status = 'revoked' WHERE profile_id = p_profile_id;
  UPDATE profiles SET account_type = 'buyer' WHERE id = p_profile_id;

  PERFORM log_audit('auth.permission_revoked', 'store_members', p_profile_id, NULL, NULL, 'staff_revoked');
END;
$$;

-- Grant an individual permission
CREATE OR REPLACE FUNCTION grant_member_permission(
  p_profile_id uuid,
  p_permission_code text,
  p_expires_at timestamptz DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_perm_id uuid;
BEGIN
  IF NOT is_super_admin() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT id INTO v_perm_id FROM permissions WHERE code = p_permission_code;
  IF v_perm_id IS NULL THEN RAISE EXCEPTION 'permission_not_found'; END IF;

  INSERT INTO member_permissions(member_id, permission_id, granted_by, expires_at)
    VALUES (p_profile_id, v_perm_id, auth.uid(), p_expires_at)
    ON CONFLICT (member_id, permission_id) DO UPDATE
      SET granted_by = EXCLUDED.granted_by, granted_at = now(), expires_at = EXCLUDED.expires_at;

  PERFORM log_audit('auth.permission_granted', 'member_permissions', p_profile_id, NULL,
    jsonb_build_object('permission', p_permission_code), NULL);
END;
$$;

-- Revoke individual permission
CREATE OR REPLACE FUNCTION revoke_member_permission(
  p_profile_id uuid,
  p_permission_code text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_super_admin() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  DELETE FROM member_permissions mp
    USING permissions p
    WHERE mp.member_id = p_profile_id AND mp.permission_id = p.id AND p.code = p_permission_code;

  PERFORM log_audit('auth.permission_revoked', 'member_permissions', p_profile_id, NULL,
    jsonb_build_object('permission', p_permission_code), NULL);
END;
$$;

-- Register a manual backup job
CREATE OR REPLACE FUNCTION trigger_manual_backup()
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_job_id uuid;
BEGIN
  IF NOT is_super_admin() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  INSERT INTO backup_jobs(type, status, triggered_by)
    VALUES ('manual', 'running', auth.uid())
    RETURNING id INTO v_job_id;

  PERFORM log_audit('backup.manual_triggered', 'backup_jobs', v_job_id, NULL, NULL, NULL);
  RETURN v_job_id;
END;
$$;

REVOKE ALL ON FUNCTION approve_purchase_request(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION reject_purchase_request(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION invite_staff(citext, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_staff(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION grant_member_permission(uuid, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_member_permission(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION trigger_manual_backup() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION approve_purchase_request(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION reject_purchase_request(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION invite_staff(citext, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION revoke_staff(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION grant_member_permission(uuid, text, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION revoke_member_permission(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION trigger_manual_backup() TO authenticated, service_role;