-- 040_drive_store_folder.sql
-- Store the dedicated Google Drive "Store" folder ID per linked seller Drive account
-- so all platform uploads and Drive Picker imports stay scoped to the seller's Store folder.

ALTER TABLE public.seller_drive_accounts
  ADD COLUMN IF NOT EXISTS store_folder_id TEXT;

COMMENT ON COLUMN public.seller_drive_accounts.store_folder_id IS
  'Google Drive folder ID of the dedicated Store root folder for this seller account.';
