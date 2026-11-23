-- 049_compensation_four_eyes.sql
-- M3/M4/M8: compensation approval must act on the pending request row,
-- require approve-only permission, lock the row, and respect the cap.
-- Rejecting a purchase request must not be possible with read-only access.

-- ------------------------------------------------------------
-- 1. A dedicated reject permission for purchase requests.
-- ------------------------------------------------------------
INSERT INTO permissions (code, description)
VALUES ('request.reject', 'Reject purchase requests')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.code IN ('super_admin', 'admin') AND p.code = 'request.reject'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.code = 'staff' AND p.code = 'request.reject'
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 2. Request path: create_compensation_session
--    - Admin / super admin may still create a ready session (they also hold
--      approve authority). This preserves the existing admin UI flow.
--    - Other staff with download.compensation.request create a PENDING
--      request only; approval is a separate action (four-eyes).
--    - A code with an outstanding pending request cannot get another one.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_compensation_session(
  p_code_id uuid, p_reason text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin boolean;
  v_max int; v_seq int; v_req_id uuid; v_session_id uuid; v_dur int;
  v_order_item uuid; v_pv uuid;
BEGIN
  v_admin := is_admin_or_above();

  IF NOT (v_admin OR staff_has('download.compensation.request')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.download_sessions
    WHERE code_id = p_code_id AND status = 'completed'
  ) THEN
    RAISE EXCEPTION 'compensation_not_allowed';
  END IF;

  -- M8: no duplicate outstanding request for the same code.
  IF EXISTS (
    SELECT 1 FROM public.compensation_requests
    WHERE code_id = p_code_id AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'compensation_pending_exists';
  END IF;

  SELECT max_sessions_per_product INTO v_max FROM public.compensation_settings WHERE id = 1;
  IF v_max IS NULL THEN v_max := 3; END IF;

  SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO v_seq
    FROM public.compensation_requests WHERE code_id = p_code_id;
  IF v_seq > v_max THEN RAISE EXCEPTION 'compensation_limit_reached'; END IF;

  SELECT order_item_id INTO v_order_item FROM public.purchase_codes WHERE id = p_code_id;
  SELECT product_version_id INTO v_pv FROM public.order_items WHERE id = v_order_item;

  INSERT INTO public.compensation_requests(code_id, status, reason, requested_by, sequence_number)
    VALUES (p_code_id, 'pending', p_reason, auth.uid(), v_seq)
    RETURNING id INTO v_req_id;

  PERFORM log_audit('compensation.requested', 'compensation_requests', v_req_id, NULL,
    jsonb_build_object('sequence_number', v_seq), p_reason);

  IF NOT v_admin THEN
    -- Non-admin requesters must wait for an approver.
    RETURN v_req_id;
  END IF;

  -- Admin path: fulfill immediately.
  SELECT session_duration_hours INTO v_dur FROM public.compensation_settings WHERE id = 1;
  IF v_dur IS NULL THEN v_dur := 4; END IF;

  INSERT INTO public.download_sessions(
    code_id, order_item_id, product_version_id, status, started_at, expires_at,
    is_compensation, compensation_request_id
  ) VALUES (
    p_code_id, v_order_item, v_pv, 'compensation_active',
    now(), now() + (v_dur || ' hours')::interval, true, v_req_id
  ) RETURNING id INTO v_session_id;

  UPDATE public.compensation_requests
    SET status = 'fulfilled', decided_by = auth.uid(), decided_at = now(),
        approved_session_id = v_session_id
    WHERE id = v_req_id;

  PERFORM log_audit('compensation_session.created', 'download_sessions', v_session_id, NULL, NULL, NULL);

  RETURN v_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_compensation_session(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_compensation_session(uuid, text) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 3. Approval path: act on an existing pending request.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_compensation(
  p_request_id uuid, p_reason text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_req public.compensation_requests%ROWTYPE;
  v_max int; v_dur int; v_order_item uuid; v_pv uuid; v_session_id uuid;
BEGIN
  IF NOT (is_admin_or_above() OR staff_has('download.compensation.approve')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  -- Lock the decision row so two approvers cannot both open a session.
  SELECT * INTO v_req
    FROM public.compensation_requests
    WHERE id = p_request_id
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'compensation_not_found'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'compensation_not_pending'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.download_sessions
    WHERE code_id = v_req.code_id AND status = 'completed'
  ) THEN
    RAISE EXCEPTION 'compensation_not_allowed';
  END IF;

  SELECT max_sessions_per_product INTO v_max FROM public.compensation_settings WHERE id = 1;
  IF v_max IS NULL THEN v_max := 3; END IF;
  IF v_req.sequence_number > v_max THEN RAISE EXCEPTION 'compensation_limit_reached'; END IF;

  SELECT order_item_id INTO v_order_item FROM public.purchase_codes WHERE id = v_req.code_id;
  SELECT product_version_id INTO v_pv FROM public.order_items WHERE id = v_order_item;
  SELECT session_duration_hours INTO v_dur FROM public.compensation_settings WHERE id = 1;
  IF v_dur IS NULL THEN v_dur := 4; END IF;

  INSERT INTO public.download_sessions(
    code_id, order_item_id, product_version_id, status, started_at, expires_at,
    is_compensation, compensation_request_id
  ) VALUES (
    v_req.code_id, v_order_item, v_pv, 'compensation_active',
    now(), now() + (v_dur || ' hours')::interval, true, v_req.id
  ) RETURNING id INTO v_session_id;

  UPDATE public.compensation_requests
    SET status = 'fulfilled', decided_by = auth.uid(), decided_at = now(),
        approved_session_id = v_session_id
    WHERE id = v_req.id;

  PERFORM log_audit('compensation.approved', 'compensation_requests', v_req.id, NULL,
    jsonb_build_object('session_id', v_session_id), p_reason);
  PERFORM log_audit('compensation_session.created', 'download_sessions', v_session_id, NULL, NULL, NULL);

  RETURN v_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_compensation(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_compensation(uuid, text) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 4. Harden reject: allow only the reject permission (the UPDATE row-locks).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_compensation(
  p_request_id uuid, p_admin_reason text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (is_admin_or_above() OR staff_has('download.compensation.reject')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_admin_reason IS NULL OR length(trim(p_admin_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  UPDATE public.compensation_requests
    SET status = 'rejected', admin_reason = p_admin_reason,
        decided_by = auth.uid(), decided_at = now()
    WHERE id = p_request_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'compensation_not_pending'; END IF;

  PERFORM log_audit('compensation.rejected', 'compensation_requests', p_request_id, NULL, NULL, p_admin_reason);
END;
$$;

-- M4: read-only request access must not grant rejection.
CREATE OR REPLACE FUNCTION public.reject_purchase_request(p_request_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (is_admin_or_above() OR staff_has('request.reject')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN RAISE EXCEPTION 'reason_required'; END IF;

  UPDATE public.purchase_requests
    SET status = 'rejected', cancel_reason = p_reason,
        cancelled_by = auth.uid(), cancelled_at = now()
    WHERE id = p_request_id AND status IN ('created','pending');
  IF NOT FOUND THEN RAISE EXCEPTION 'purchase_request_not_rejectable'; END IF;

  PERFORM log_audit('purchase_request.rejected', 'purchase_requests', p_request_id, NULL, NULL, p_reason);
END;
$$;
