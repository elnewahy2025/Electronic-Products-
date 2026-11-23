-- ============================================================
-- 055_download_token_ledger.sql
-- ============================================================
-- Download tokens used to be signed but never persisted, so the same token
-- could be replayed to mint fresh Drive URLs. This migration turns the
-- existing download_tokens table into an enforced, single-use ledger:
--   1. /download/[id]/init registers the token hash.
--   2. /internal/resolve-token atomically claims it before resolving Drive.
--   3. /download/[id]/complete atomically marks the token completed and
--      requires the internal secret before recording anything.
-- The worker measures real bytes and checksums; the app verifies them against
-- file_versions before recording a delivery.

CREATE OR REPLACE FUNCTION public.register_download_token(
  p_session_id uuid,
  p_token_hash text,
  p_scope public.download_token_scope_enum,
  p_file_version_id uuid,
  p_expires_at timestamptz
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_token_hash IS NULL OR length(p_token_hash) <> 64 THEN
    RAISE EXCEPTION 'invalid_token_hash';
  END IF;

  INSERT INTO public.download_tokens (
    session_id, token_hash, scope, file_version_id, expires_at
  )
  VALUES (
    p_session_id, p_token_hash, p_scope, p_file_version_id, p_expires_at
  )
  ON CONFLICT (token_hash) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.register_download_token(uuid, text, public.download_token_scope_enum, uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_download_token(uuid, text, public.download_token_scope_enum, uuid, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.register_download_token(uuid, text, public.download_token_scope_enum, uuid, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_download_token(p_token_hash text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_updated integer;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE public.download_tokens
     SET used_at = now()
   WHERE token_hash = p_token_hash
     AND used_at IS NULL
     AND expires_at > now();
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    IF EXISTS (SELECT 1 FROM public.download_tokens WHERE token_hash = p_token_hash) THEN
      RAISE EXCEPTION 'download_token_already_used';
    END IF;
    RAISE EXCEPTION 'download_token_not_found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_download_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_download_token(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_download_token(text) TO service_role;

-- A claimed token may still fail verification. Marking completion is a second
-- atomic step so a replayed callback cannot record another delivery even when
-- the download session itself is still active (e.g. single-file deliveries).
ALTER TABLE public.download_tokens
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

CREATE OR REPLACE FUNCTION public.mark_download_token_completed(p_token_hash text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_updated integer;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE public.download_tokens
     SET completed_at = now()
   WHERE token_hash = p_token_hash
     AND used_at IS NOT NULL
     AND completed_at IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    IF EXISTS (
      SELECT 1 FROM public.download_tokens
       WHERE token_hash = p_token_hash AND completed_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'download_token_already_completed';
    END IF;
    RAISE EXCEPTION 'download_token_not_claimed';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_download_token_completed(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_download_token_completed(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mark_download_token_completed(text) TO service_role;
