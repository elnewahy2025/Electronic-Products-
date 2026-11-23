-- ============================================================
-- 060_token_cache_column_protection.sql
-- Prevent authenticated/anon clients from reading or corrupting
-- encrypted Google Drive OAuth tokens on seller_drive_accounts.
-- Server-side helpers use service_role (which bypasses table grants).
-- ============================================================

REVOKE SELECT, UPDATE ON public.seller_drive_accounts FROM authenticated, anon;

GRANT SELECT (
  id,
  seller_id,
  google_account_email,
  scopes,
  status,
  quota_total,
  quota_used,
  last_checked_at,
  is_default,
  priority,
  store_folder_id,
  created_at,
  updated_at
) ON public.seller_drive_accounts TO authenticated;

GRANT UPDATE (
  is_default,
  priority,
  store_folder_id
) ON public.seller_drive_accounts TO authenticated;
