-- `pick_drive_account` is an internal helper used only by the server.
-- Migration 027 intended to revoke it from client roles, but the function
-- still carried PUBLIC EXECUTE, so any authenticated buyer could call it.
REVOKE EXECUTE ON FUNCTION public.pick_drive_account(uuid, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pick_drive_account(uuid, bigint)
  TO service_role;
