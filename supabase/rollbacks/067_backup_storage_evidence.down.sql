-- Rollback for 067_backup_storage_evidence.sql
REVOKE ALL ON FUNCTION public.record_backup_restore_evidence(uuid, jsonb, jsonb) FROM service_role;
DROP FUNCTION IF EXISTS public.record_backup_restore_evidence(uuid, jsonb, jsonb);

ALTER TABLE public.backup_archives
  DROP COLUMN IF EXISTS restore_prereqs,
  DROP COLUMN IF EXISTS storage_evidence;
