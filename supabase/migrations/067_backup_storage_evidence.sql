-- ============================================================
-- 067_backup_storage_evidence.sql
-- Fix H-01: persist verifiable restore prerequisites and a
-- Storage blob manifest alongside each backup archive, so the
-- isolated restore drill can fail closed on real FK/trigger
-- enforcement and on archived object-byte integrity.
-- ============================================================

ALTER TABLE public.backup_archives
  ADD COLUMN IF NOT EXISTS storage_evidence jsonb,
  ADD COLUMN IF NOT EXISTS restore_prereqs jsonb;

CREATE OR REPLACE FUNCTION public.record_backup_restore_evidence(
  p_archive_id uuid,
  p_storage_evidence jsonb,
  p_restore_prereqs jsonb
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.backup_archives WHERE id = p_archive_id) THEN
    RAISE EXCEPTION 'archive_not_found';
  END IF;

  IF p_storage_evidence IS NULL
     OR p_storage_evidence->>'version' IS DISTINCT FROM '1'
     OR p_storage_evidence->>'manifest_path' IS NULL
     OR p_storage_evidence->>'manifest_checksum' !~ '^[0-9a-f]{64}$'
     OR p_storage_evidence->>'object_count' IS NULL
     OR p_restore_prereqs->>'extension_schemas' IS NULL
     OR p_restore_prereqs->>'integrity' IS NULL THEN
    RAISE EXCEPTION 'invalid_backup_evidence';
  END IF;

  UPDATE public.backup_archives
     SET storage_evidence = p_storage_evidence,
         restore_prereqs = p_restore_prereqs
   WHERE id = p_archive_id;

  PERFORM log_audit(
    'backup.storage_evidence_recorded',
    'backup_archives',
    p_archive_id,
    NULL,
    jsonb_build_object(
      'manifest_path', p_storage_evidence->>'manifest_path',
      'object_count', p_storage_evidence->>'object_count'
    ),
    NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_backup_restore_evidence(uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_backup_restore_evidence(uuid, jsonb, jsonb) TO service_role;
