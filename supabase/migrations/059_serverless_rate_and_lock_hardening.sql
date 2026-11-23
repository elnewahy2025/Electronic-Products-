-- ============================================================
-- 059_serverless_rate_and_lock_hardening.sql
-- Distributed PostgreSQL concurrency locks + encrypted Drive access-token cache
-- ============================================================

-- ------------------------------------------------------------
-- 1. Distributed concurrency lock table & atomic RPCs (serverless-safe)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.api_concurrency_locks (
  lock_key text PRIMARY KEY,
  owner_token uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.api_concurrency_locks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.api_concurrency_locks FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.acquire_concurrency_lock(
  p_key text,
  p_ttl_seconds int DEFAULT 120
)
RETURNS TABLE(acquired boolean, owner_token uuid, retry_after_seconds int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_ttl int := GREATEST(5, LEAST(COALESCE(p_ttl_seconds, 120), 600));
  v_token uuid := gen_random_uuid();
  v_expires timestamptz := v_now + make_interval(secs => v_ttl);
  v_inserted uuid;
  v_existing_exp timestamptz;
BEGIN
  INSERT INTO public.api_concurrency_locks (lock_key, owner_token, expires_at, created_at)
  VALUES (p_key, v_token, v_expires, v_now)
  ON CONFLICT (lock_key) DO UPDATE
    SET owner_token = EXCLUDED.owner_token,
        expires_at = EXCLUDED.expires_at,
        created_at = EXCLUDED.created_at
    WHERE public.api_concurrency_locks.expires_at <= v_now
  RETURNING public.api_concurrency_locks.owner_token INTO v_inserted;

  IF v_inserted = v_token THEN
    RETURN QUERY SELECT true, v_token, 0;
    RETURN;
  END IF;

  SELECT expires_at INTO v_existing_exp
  FROM public.api_concurrency_locks
  WHERE lock_key = p_key;

  RETURN QUERY SELECT
    false,
    NULL::uuid,
    GREATEST(1, CEIL(EXTRACT(EPOCH FROM (COALESCE(v_existing_exp, v_now + interval '10 seconds') - v_now)))::int);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_concurrency_lock(
  p_key text,
  p_owner_token uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.api_concurrency_locks
  WHERE lock_key = p_key
    AND owner_token = p_owner_token;
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_concurrency_lock(text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_concurrency_lock(text, int) TO service_role;

REVOKE ALL ON FUNCTION public.release_concurrency_lock(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_concurrency_lock(text, uuid) TO service_role;

-- ------------------------------------------------------------
-- 2. Distributed encrypted Drive access-token cache on seller_drive_accounts
--    (service-role only; seller_drive_accounts already blocks client reads of tokens)
-- ------------------------------------------------------------
ALTER TABLE public.seller_drive_accounts
  ADD COLUMN IF NOT EXISTS encrypted_access_token text,
  ADD COLUMN IF NOT EXISTS access_token_expires_at timestamptz;
