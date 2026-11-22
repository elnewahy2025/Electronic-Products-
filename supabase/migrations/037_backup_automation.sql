-- ============================================================
-- 037_backup_automation.sql
-- Automated backup scheduling, archive tracking, and restore verification
-- ============================================================

-- 1. Private Supabase Storage bucket for database backup archives (service_role only)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'database-backups',
  'database-backups',
  false,
  524288000, -- 500 MB
  ARRAY['application/gzip', 'application/x-gzip', 'application/octet-stream', 'application/sql']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Check if a scheduled backup is due according to backup_settings.schedule
CREATE OR REPLACE FUNCTION is_backup_due()
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_schedule backup_schedule_enum;
  v_last_completed timestamptz;
BEGIN
  SELECT schedule INTO v_schedule FROM backup_settings WHERE id = 1;
  IF v_schedule IS NULL OR v_schedule = 'manual_only' THEN
    RETURN false;
  END IF;

  SELECT MAX(finished_at) INTO v_last_completed
  FROM backup_jobs
  WHERE status = 'completed';

  IF v_last_completed IS NULL THEN
    RETURN true;
  END IF;

  IF v_schedule = 'daily' THEN
    RETURN v_last_completed < now() - interval '23 hours';
  ELSIF v_schedule = 'weekly' THEN
    RETURN v_last_completed < now() - interval '6 days 23 hours';
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION is_backup_due() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_backup_due() TO service_role;

-- 3. Check if an automated restore verification test is due
CREATE OR REPLACE FUNCTION is_restore_test_due()
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_freq_days int;
  v_has_archive boolean;
  v_last_verified timestamptz;
BEGIN
  SELECT COALESCE(restore_test_frequency_days, 30) INTO v_freq_days
  FROM backup_settings WHERE id = 1;

  SELECT EXISTS (SELECT 1 FROM backup_archives) INTO v_has_archive;
  IF NOT v_has_archive THEN
    RETURN false;
  END IF;

  SELECT MAX(finished_at) INTO v_last_verified
  FROM restore_jobs
  WHERE status = 'completed';

  IF v_last_verified IS NULL THEN
    RETURN true;
  END IF;

  RETURN v_last_verified < now() - make_interval(days => v_freq_days);
END;
$$;

REVOKE ALL ON FUNCTION is_restore_test_due() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_restore_test_due() TO service_role;

-- 4. Start a scheduled or runner-executed backup job (service_role)
CREATE OR REPLACE FUNCTION start_backup_job(
  p_type backup_job_type_enum DEFAULT 'auto',
  p_triggered_by uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_job_id uuid;
BEGIN
  INSERT INTO backup_jobs(type, status, triggered_by)
  VALUES (p_type, 'running', p_triggered_by)
  RETURNING id INTO v_job_id;

  PERFORM log_audit('backup.started', 'backup_jobs', v_job_id, NULL,
    jsonb_build_object('type', p_type), NULL);

  RETURN v_job_id;
END;
$$;

REVOKE ALL ON FUNCTION start_backup_job(backup_job_type_enum, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION start_backup_job(backup_job_type_enum, uuid) TO service_role;

-- 5. Complete a backup job and record its immutable archive + SHA-256 checksum
CREATE OR REPLACE FUNCTION complete_backup_job(
  p_job_id uuid,
  p_size_bytes bigint,
  p_storage_location text,
  p_checksum text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_archive_id uuid;
  v_started_at timestamptz;
BEGIN
  UPDATE backup_jobs
  SET status = 'completed',
      finished_at = now(),
      size_bytes = p_size_bytes,
      storage_location = p_storage_location,
      error = NULL
  WHERE id = p_job_id
  RETURNING started_at INTO v_started_at;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'backup_job_not_found';
  END IF;

  INSERT INTO backup_archives(
    backup_job_id, period_start, period_end, storage_location, checksum
  )
  VALUES (
    p_job_id, v_started_at, now(), p_storage_location, p_checksum
  )
  RETURNING id INTO v_archive_id;

  PERFORM log_audit('backup.completed', 'backup_jobs', p_job_id, NULL,
    jsonb_build_object(
      'archive_id', v_archive_id,
      'size_bytes', p_size_bytes,
      'checksum', p_checksum,
      'storage_location', p_storage_location
    ), NULL);

  RETURN v_archive_id;
END;
$$;

REVOKE ALL ON FUNCTION complete_backup_job(uuid, bigint, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION complete_backup_job(uuid, bigint, text, text) TO service_role;

-- 6. Mark a backup job as failed and notify staff
CREATE OR REPLACE FUNCTION fail_backup_job(
  p_job_id uuid,
  p_error text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE backup_jobs
  SET status = 'failed',
      finished_at = now(),
      error = left(COALESCE(p_error, 'unknown_error'), 2000)
  WHERE id = p_job_id;

  PERFORM log_audit('backup.failed', 'backup_jobs', p_job_id, NULL,
    jsonb_build_object('error', left(COALESCE(p_error, 'unknown_error'), 500)), NULL);

  PERFORM notify_staff_with_permission(
    'backup.read',
    'backup_failed',
    'فشل تنفيذ النسخة الاحتياطية',
    'تعذّر إكمال عملية النسخ الاحتياطي. يرجى مراجعة سجل النسخ الاحتياطي فوراً.',
    jsonb_build_object('job_id', p_job_id, 'error', left(COALESCE(p_error, ''), 300))
  );
END;
$$;

REVOKE ALL ON FUNCTION fail_backup_job(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fail_backup_job(uuid, text) TO service_role;

-- 7. Record an automated or manual restore verification test result
CREATE OR REPLACE FUNCTION record_restore_verification(
  p_archive_id uuid,
  p_status restore_status_enum,
  p_error text DEFAULT NULL,
  p_performed_by uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_restore_id uuid;
BEGIN
  INSERT INTO restore_jobs(
    backup_archive_id, status, started_at, finished_at, error, performed_by
  )
  VALUES (
    p_archive_id, p_status, now(), now(),
    CASE WHEN p_error IS NOT NULL THEN left(p_error, 2000) ELSE NULL END,
    p_performed_by
  )
  RETURNING id INTO v_restore_id;

  PERFORM log_audit(
    CASE WHEN p_status = 'completed' THEN 'backup.restore_verified' ELSE 'backup.restore_failed' END,
    'restore_jobs',
    v_restore_id,
    NULL,
    jsonb_build_object('archive_id', p_archive_id, 'status', p_status, 'error', p_error),
    NULL
  );

  IF p_status = 'failed' THEN
    PERFORM notify_staff_with_permission(
      'backup.read',
      'restore_test_failed',
      'فشل اختبار استعادة النسخة الاحتياطية',
      'فشل التحقق التلقائي من استعادة أحدث نسخة احتياطية. يرجى التدخل فوراً.',
      jsonb_build_object('restore_job_id', v_restore_id, 'archive_id', p_archive_id)
    );
  END IF;

  RETURN v_restore_id;
END;
$$;

REVOKE ALL ON FUNCTION record_restore_verification(uuid, restore_status_enum, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_restore_verification(uuid, restore_status_enum, text, uuid) TO service_role;

-- 8. Super-admin RPC to update backup_settings safely
CREATE OR REPLACE FUNCTION update_backup_settings(
  p_schedule backup_schedule_enum,
  p_retention_days smallint,
  p_restore_test_frequency_days smallint,
  p_include_files boolean,
  p_manual_enabled boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old jsonb;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_retention_days < 7 OR p_retention_days > 3650 THEN
    RAISE EXCEPTION 'invalid_retention_days';
  END IF;

  IF p_restore_test_frequency_days < 1 OR p_restore_test_frequency_days > 365 THEN
    RAISE EXCEPTION 'invalid_restore_test_frequency_days';
  END IF;

  SELECT to_jsonb(bs) INTO v_old FROM backup_settings bs WHERE id = 1;

  UPDATE backup_settings
  SET schedule = p_schedule,
      retention_days = p_retention_days,
      restore_test_frequency_days = p_restore_test_frequency_days,
      include_files = p_include_files,
      manual_enabled = p_manual_enabled,
      updated_by = auth.uid()
  WHERE id = 1;

  PERFORM log_audit(
    'backup.settings_updated',
    'backup_settings',
    NULL,
    v_old,
    jsonb_build_object(
      'schedule', p_schedule,
      'retention_days', p_retention_days,
      'restore_test_frequency_days', p_restore_test_frequency_days,
      'include_files', p_include_files,
      'manual_enabled', p_manual_enabled
    ),
    NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION update_backup_settings(backup_schedule_enum, smallint, smallint, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_backup_settings(backup_schedule_enum, smallint, smallint, boolean, boolean) TO authenticated;
