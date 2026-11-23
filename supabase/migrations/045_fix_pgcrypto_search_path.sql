-- pgcrypto's hmac() lives in the `extensions` schema on Supabase. These two
-- SECURITY DEFINER functions generate code hashes but pin search_path to
-- `public`, so the call fails at runtime with
-- "function hmac(text, text, unknown) does not exist".
ALTER FUNCTION public.approve_purchase_request(uuid)
  SET search_path TO public, extensions;

ALTER FUNCTION public.issue_replacement_code(uuid, text)
  SET search_path TO public, extensions;
