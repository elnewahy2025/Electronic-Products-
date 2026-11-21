-- ============================================================
-- 020_scan_and_previews.sql
-- ============================================================

-- Extend file_previews for storage path
ALTER TABLE file_previews
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS public_url text,
  ADD COLUMN IF NOT EXISTS error text,
  ADD COLUMN IF NOT EXISTS attempts int NOT NULL DEFAULT 0;

-- Extend scan_jobs for attempts + engine version
ALTER TABLE scan_jobs
  ADD COLUMN IF NOT EXISTS attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error text;

-- Helper: fetch next pending scan jobs (SECURITY DEFINER for service_role)
CREATE OR REPLACE FUNCTION claim_scan_jobs(p_limit int DEFAULT 3)
RETURNS TABLE (
  job_id uuid,
  file_version_id uuid,
  seller_id uuid,
  file_id uuid,
  extension text,
  mime text,
  storage_location_id uuid,
  drive_account_id uuid,
  provider_file_id text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    UPDATE scan_jobs sj
    SET status = 'running', started_at = now(), attempts = attempts + 1
    WHERE sj.id IN (
      SELECT id FROM scan_jobs
      WHERE status = 'queued'
      ORDER BY queued_at ASC
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED
    )
    RETURNING sj.id, sj.file_version_id
  )
  SELECT
    c.id,
    c.file_version_id,
    f.seller_id,
    fv.file_id,
    fv.extension,
    fv.mime,
    fsl.id,
    sda.id,
    fsl.provider_file_id
  FROM claimed c
  JOIN file_versions fv ON fv.id = c.file_version_id
  JOIN files f ON f.id = fv.file_id
  LEFT JOIN file_storage_locations fsl ON fsl.id = fv.storage_location_id
  LEFT JOIN seller_drive_accounts sda ON sda.id = fsl.seller_drive_account_id;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_scan_jobs(int) TO service_role;

-- Complete scan: pass → move to processing, queue preview
CREATE OR REPLACE FUNCTION complete_scan_pass(p_file_version_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_seller uuid;
  v_file_name text;
BEGIN
  UPDATE scan_jobs
    SET status = 'passed', finished_at = now()
    WHERE file_version_id = p_file_version_id AND status = 'running';

  UPDATE file_versions
    SET scan_status = 'processing'
    WHERE id = p_file_version_id;

  -- Create a preview job row (we use file_previews as the job table)
  INSERT INTO file_previews(file_version_id, preview_type, status)
  SELECT p_file_version_id, 'image', 'pending'
  WHERE NOT EXISTS (
    SELECT 1 FROM file_previews WHERE file_version_id = p_file_version_id
  );

  -- Notify seller
  SELECT f.seller_id, f.original_name INTO v_seller, v_file_name
  FROM file_versions fv
  JOIN files f ON f.id = fv.file_id
  WHERE fv.id = p_file_version_id;

  IF v_seller IS NOT NULL THEN
    INSERT INTO notifications(user_id, type, title, body)
    VALUES (
      v_seller,
      'file_scan_passed',
      'تم قبول ملفك',
      coalesce(v_file_name, 'ملف') || ' اجتاز الفحص وسيتم إنشاء المعاينة قريبًا.'
    );
  END IF;

  PERFORM log_audit('file.scan_passed', 'file_versions', p_file_version_id, NULL, NULL, NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION complete_scan_pass(uuid) TO service_role;

-- Fail scan: quarantine
CREATE OR REPLACE FUNCTION quarantine_file(
  p_file_version_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_seller uuid;
  v_file_name text;
  v_existing uuid;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  UPDATE scan_jobs
    SET status = 'failed', finished_at = now(), error = p_reason
    WHERE file_version_id = p_file_version_id AND status IN ('queued','running');

  UPDATE file_versions
    SET scan_status = 'quarantined'
    WHERE id = p_file_version_id;

  SELECT id INTO v_existing FROM quarantine_records
    WHERE file_version_id = p_file_version_id AND released_at IS NULL;

  IF v_existing IS NULL THEN
    INSERT INTO quarantine_records(file_version_id, reason, quarantined_at)
    VALUES (p_file_version_id, p_reason, now());
  END IF;

  SELECT f.seller_id, f.original_name INTO v_seller, v_file_name
  FROM file_versions fv
  JOIN files f ON f.id = fv.file_id
  WHERE fv.id = p_file_version_id;

  IF v_seller IS NOT NULL THEN
    INSERT INTO notifications(user_id, type, title, body)
    VALUES (
      v_seller,
      'file_quarantined',
      'تم عزل ملف',
      coalesce(v_file_name, 'ملف') || ' لم يجتز الفحص التقني. تواصل مع الإدارة.'
    );
  END IF;

  PERFORM log_audit('file.quarantined', 'file_versions', p_file_version_id, NULL,
    jsonb_build_object('reason', p_reason), p_reason);
END;
$$;

GRANT EXECUTE ON FUNCTION quarantine_file(uuid, text) TO service_role;

-- Release from quarantine
CREATE OR REPLACE FUNCTION release_from_quarantine(
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

  -- Ensure a preview job exists
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

GRANT EXECUTE ON FUNCTION release_from_quarantine(uuid, text) TO authenticated, service_role;

-- Finalize preview: mark file_version ready, mark product publishable
CREATE OR REPLACE FUNCTION finalize_preview(
  p_preview_id uuid,
  p_storage_path text,
  p_public_url text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_fv uuid;
  v_type preview_type_enum;
BEGIN
  UPDATE file_previews
    SET status = 'ready',
        storage_path = p_storage_path,
        public_url = p_public_url,
        watermark_applied = true
    WHERE id = p_preview_id
    RETURNING file_version_id, preview_type INTO v_fv, v_type;

  IF v_fv IS NULL THEN
    RAISE EXCEPTION 'preview_not_found';
  END IF;

  UPDATE file_versions SET scan_status = 'ready' WHERE id = v_fv;

  PERFORM log_audit('preview.generated', 'file_previews', p_preview_id, NULL,
    jsonb_build_object('type', v_type::text), NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION finalize_preview(uuid, text, text) TO service_role;

-- Fail preview
CREATE OR REPLACE FUNCTION fail_preview(
  p_preview_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE file_previews
    SET status = 'failed', error = p_reason
    WHERE id = p_preview_id;

  PERFORM log_audit('preview.failed', 'file_previews', p_preview_id, NULL,
    jsonb_build_object('reason', p_reason), p_reason);
END;
$$;

GRANT EXECUTE ON FUNCTION fail_preview(uuid, text) TO service_role;

-- Claim next pending preview jobs
CREATE OR REPLACE FUNCTION claim_preview_jobs(p_limit int DEFAULT 2)
RETURNS TABLE (
  preview_id uuid,
  file_version_id uuid,
  seller_id uuid,
  file_id uuid,
  extension text,
  mime text,
  drive_account_id uuid,
  provider_file_id text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    UPDATE file_previews fp
    SET status = 'generating', attempts = attempts + 1
    WHERE fp.id IN (
      SELECT id FROM file_previews
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED
    )
    RETURNING fp.id, fp.file_version_id
  )
  SELECT
    c.id,
    c.file_version_id,
    f.seller_id,
    fv.file_id,
    fv.extension,
    fv.mime,
    sda.id,
    fsl.provider_file_id
  FROM claimed c
  JOIN file_versions fv ON fv.id = c.file_version_id
  JOIN files f ON f.id = fv.file_id
  LEFT JOIN file_storage_locations fsl ON fsl.id = fv.storage_location_id
  LEFT JOIN seller_drive_accounts sda ON sda.id = fsl.seller_drive_account_id;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_preview_jobs(int) TO service_role;
