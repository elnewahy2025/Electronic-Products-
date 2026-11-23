-- Compensation is meant for a failed/expired download, not a purchase whose
-- files were fully delivered. Previously any admin could open a fresh 4-hour
-- download window for an already-completed order.
CREATE OR REPLACE FUNCTION public.create_compensation_session(
  p_code_id uuid, p_reason text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_max int; v_seq int; v_req_id uuid; v_session_id uuid; v_dur int;
  v_order_item uuid; v_pv uuid;
BEGIN
  IF NOT (is_admin_or_above()
          OR staff_has('download.compensation.request')
          OR staff_has('download.compensation.approve')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  IF EXISTS (
    SELECT 1 FROM download_sessions
    WHERE code_id = p_code_id AND status = 'completed'
  ) THEN
    RAISE EXCEPTION 'compensation_not_allowed';
  END IF;

  SELECT max_sessions_per_product INTO v_max FROM compensation_settings WHERE id = 1;
  IF v_max IS NULL THEN v_max := 3; END IF;

  SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO v_seq
    FROM compensation_requests WHERE code_id = p_code_id;
  IF v_seq > v_max THEN RAISE EXCEPTION 'compensation_limit_reached'; END IF;

  SELECT order_item_id INTO v_order_item FROM purchase_codes WHERE id = p_code_id;
  SELECT product_version_id INTO v_pv FROM order_items WHERE id = v_order_item;

  INSERT INTO compensation_requests(code_id, status, reason, requested_by, sequence_number)
    VALUES (p_code_id, 'approved', p_reason, auth.uid(), v_seq)
    RETURNING id INTO v_req_id;

  SELECT session_duration_hours INTO v_dur FROM compensation_settings WHERE id = 1;
  IF v_dur IS NULL THEN v_dur := 4; END IF;

  INSERT INTO download_sessions(
    code_id, order_item_id, product_version_id, status, started_at, expires_at,
    is_compensation, compensation_request_id
  ) VALUES (
    p_code_id, v_order_item, v_pv, 'compensation_active',
    now(), now() + (v_dur || ' hours')::interval, true, v_req_id
  ) RETURNING id INTO v_session_id;

  UPDATE compensation_requests
    SET decided_by = auth.uid(), decided_at = now(),
        approved_session_id = v_session_id, status = 'fulfilled'
    WHERE id = v_req_id;

  PERFORM log_audit('compensation.requested', 'compensation_requests', v_req_id, NULL,
    jsonb_build_object('sequence_number', v_seq), p_reason);
  PERFORM log_audit('compensation_session.created', 'download_sessions', v_session_id, NULL, NULL, NULL);

  RETURN v_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_compensation_session(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_compensation_session(uuid, text) TO authenticated, service_role;
