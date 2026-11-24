-- ============================================================
-- Rollback for 065_harden_scan_quarantine_rpcs.sql
-- Restores the pre-065 function body and grants. Running this
-- reintroduces the C-01 exposure; only use it to revert the
-- migration in a controlled environment.
-- ============================================================

CREATE OR REPLACE FUNCTION public.release_from_quarantine(
  p_file_version_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_seller uuid;
  v_file_name text;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  UPDATE quarantine_records
    SET released_at = now(), released_by = auth.uid()
    WHERE file_version_id = p_file_version_id AND released_at IS NULL;

  UPDATE file_versions
    SET scan_status = 'processing'
    WHERE id = p_file_version_id;

  INSERT INTO file_previews(file_version_id, preview_type, status)
  SELECT p_file_version_id, 'image', 'pending'
  WHERE NOT EXISTS (
    SELECT 1 FROM file_previews WHERE file_version_id = p_file_version_id
  );

  SELECT f.seller_id, f.original_name INTO v_seller, v_file_name
  FROM file_versions fv
  JOIN files f ON f.id = fv.file_id
  WHERE fv.id = p_file_version_id;

  IF v_seller IS NOT NULL THEN
    INSERT INTO notifications(user_id, type, title, body)
    VALUES (
      v_seller,
      'file_released',
      'تم الإفراج عن ملفك',
      coalesce(v_file_name, 'ملف') || ' تجاوز المراجعة اليدوية.'
    );
  END IF;

  PERFORM log_audit('file.released_from_quarantine', 'file_versions', p_file_version_id,
    NULL, NULL, p_reason);
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_from_quarantine(uuid, text) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.claim_scan_jobs(int) TO PUBLIC, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_scan_pass(uuid) TO PUBLIC, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.quarantine_file(uuid, text) TO PUBLIC, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_preview(uuid, text, text) TO PUBLIC, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fail_preview(uuid, text) TO PUBLIC, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_preview_jobs(int) TO PUBLIC, authenticated, service_role;
