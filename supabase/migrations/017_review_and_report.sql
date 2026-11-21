-- ============================================================
-- 017_review_and_report.sql
-- Enforce review eligibility + report resolution helpers
-- ============================================================

-- Ensure a review can only be created for a real, approved order.
-- Blocks: no order, order not approved, wrong product, wrong buyer.
CREATE OR REPLACE FUNCTION validate_review_eligibility() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_pr_status purchase_request_status_enum;
  v_oi_product uuid;
BEGIN
  SELECT pr.status, oi.product_id
    INTO v_pr_status, v_oi_product
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  JOIN purchase_requests pr ON pr.id = o.purchase_request_id
  WHERE oi.id = NEW.order_item_id;

  IF v_pr_status IS NULL THEN
    RAISE EXCEPTION 'review_order_item_not_found';
  END IF;
  IF v_pr_status NOT IN ('approved', 'completed') THEN
    RAISE EXCEPTION 'review_requires_approved_order';
  END IF;
  IF v_oi_product <> NEW.product_id THEN
    RAISE EXCEPTION 'review_product_mismatch';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reviews_validate ON reviews;
CREATE TRIGGER trg_reviews_validate
  BEFORE INSERT ON reviews
  FOR EACH ROW EXECUTE FUNCTION validate_review_eligibility();

-- Soft-delete a review with mandatory reason
CREATE OR REPLACE FUNCTION delete_review(
  p_review_id uuid,
  p_reason text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_review reviews%ROWTYPE;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  SELECT * INTO v_review FROM reviews WHERE id = p_review_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'review_not_found'; END IF;
  IF v_review.status = 'deleted' THEN RAISE EXCEPTION 'already_deleted'; END IF;

  UPDATE reviews
    SET status = 'deleted',
        deleted_by = auth.uid(),
        delete_reason = p_reason,
        deleted_at = now()
    WHERE id = p_review_id;

  PERFORM log_audit('review.deleted', 'reviews', p_review_id,
    jsonb_build_object('status', v_review.status),
    jsonb_build_object('status', 'deleted'), p_reason);
END;
$$;

-- Resolve / dismiss a report
CREATE OR REPLACE FUNCTION resolve_report(
  p_report_id uuid,
  p_resolution report_status_enum,
  p_note text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_resolution NOT IN ('resolved', 'dismissed') THEN
    RAISE EXCEPTION 'invalid_resolution';
  END IF;
  IF p_note IS NULL OR length(trim(p_note)) < 3 THEN
    RAISE EXCEPTION 'note_required';
  END IF;

  UPDATE content_reports
    SET status = p_resolution,
        resolved_by = auth.uid(),
        resolved_at = now(),
        resolution_note = p_note
    WHERE id = p_report_id AND status = 'open';

  IF NOT FOUND THEN RAISE EXCEPTION 'report_not_open'; END IF;

  PERFORM log_audit('report.resolved', 'content_reports', p_report_id,
    NULL, jsonb_build_object('resolution', p_resolution), p_note);
END;
$$;

REVOKE ALL ON FUNCTION delete_review(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION resolve_report(uuid, report_status_enum, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_review(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION resolve_report(uuid, report_status_enum, text) TO authenticated, service_role;