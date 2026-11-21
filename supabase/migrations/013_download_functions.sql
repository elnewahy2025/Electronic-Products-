-- ============================================================
-- 013_download_functions.sql
-- Correct attempt tracking: count on success only
-- ============================================================

-- Deprecate the old consuming-on-start function
DROP FUNCTION IF EXISTS consume_attempt(uuid, uuid, download_attempt_type_enum);

-- Count only successful attempts, idempotent per session
CREATE OR REPLACE FUNCTION record_successful_attempt(
  p_order_item_id uuid,
  p_session_id uuid,
  p_type download_attempt_type_enum
) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_max int;
  v_count int;
  v_existing int;
BEGIN
  -- Serialize on the order_item row
  PERFORM 1 FROM order_items WHERE id = p_order_item_id FOR UPDATE;

  -- Idempotency: if this session already recorded a successful attempt, return it
  SELECT attempt_number INTO v_existing
    FROM download_attempts
    WHERE session_id = p_session_id AND completed = true
    LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT max_attempts_per_product INTO v_max FROM download_settings WHERE id = 1;
  IF v_max IS NULL THEN v_max := 3; END IF;

  SELECT COUNT(*) INTO v_count
    FROM download_attempts
    WHERE order_item_id = p_order_item_id AND completed = true;

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'attempts_exhausted';
  END IF;

  INSERT INTO download_attempts(
    order_item_id, session_id, attempt_number, type, completed, consumed_at
  ) VALUES (
    p_order_item_id, p_session_id, v_count + 1, p_type, true, now()
  );

  PERFORM log_audit(
    'attempt.consumed', 'order_items', p_order_item_id,
    NULL,
    jsonb_build_object('attempt_number', v_count + 1, 'type', p_type::text, 'session_id', p_session_id),
    NULL
  );

  RETURN v_count + 1;
END;
$$;

-- Mark session as completed (sets ended_at, attempt_consumed=true)
CREATE OR REPLACE FUNCTION mark_session_completed(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE download_sessions
    SET status = 'completed',
        ended_at = now(),
        attempt_consumed = true
    WHERE id = p_session_id
      AND status IN ('active','compensation_active');

  PERFORM log_audit('session.completed', 'download_sessions', p_session_id, NULL, NULL, NULL);
END;
$$;

-- Check if all required files for this session's product_version have been delivered
CREATE OR REPLACE FUNCTION is_session_fully_delivered(p_session_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH session_info AS (
    SELECT product_version_id FROM download_sessions WHERE id = p_session_id
  ),
  required_files AS (
    SELECT COUNT(*) AS total
    FROM product_version_files
    WHERE product_version_id = (SELECT product_version_id FROM session_info)
  ),
  delivered_files AS (
    SELECT COUNT(DISTINCT file_version_id) AS done
    FROM download_deliveries
    WHERE session_id = p_session_id AND completed = true
  )
  SELECT (SELECT done FROM delivered_files) >= (SELECT total FROM required_files)
$$;

-- Mark session expired_partial if it has partial deliveries and is expired
CREATE OR REPLACE FUNCTION expire_partial_session(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_has_deliveries boolean;
  v_status download_session_status_enum;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM download_deliveries WHERE session_id = p_session_id AND completed = true
  ) INTO v_has_deliveries;

  SELECT status INTO v_status FROM download_sessions WHERE id = p_session_id;

  IF v_status IN ('active','compensation_active') THEN
    IF v_has_deliveries THEN
      UPDATE download_sessions
        SET status = 'expired_partial', ended_at = now()
        WHERE id = p_session_id;
      PERFORM log_audit('session.expired_partial', 'download_sessions', p_session_id, NULL, NULL, NULL);
    ELSE
      UPDATE download_sessions
        SET status = 'expired', ended_at = now()
        WHERE id = p_session_id;
      PERFORM log_audit('session.expired', 'download_sessions', p_session_id, NULL, NULL, NULL);
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION record_successful_attempt(uuid,uuid,download_attempt_type_enum) FROM PUBLIC;
REVOKE ALL ON FUNCTION mark_session_completed(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION expire_partial_session(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_successful_attempt(uuid,uuid,download_attempt_type_enum) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION mark_session_completed(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION expire_partial_session(uuid) TO authenticated, service_role;