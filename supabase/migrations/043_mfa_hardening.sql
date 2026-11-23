-- ============================================================
-- 043_mfa_hardening.sql
-- Fix #3: real TOTP enrollment + post-login challenge.
--
-- The app now stores the TOTP secret encrypted in
-- profiles.mfa_secret_encrypted (written only via the service-role
-- client). These tables hold the short-lived enrollment secret and
-- failed-attempt counters. Both are service-role only: no anon or
-- authenticated role can read or write them through PostgREST.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.mfa_enrollments (
  profile_id      uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  secret_encrypted text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL
);

ALTER TABLE public.mfa_enrollments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mfa_enrollments FROM anon, authenticated;
GRANT ALL ON public.mfa_enrollments TO service_role;

CREATE TABLE IF NOT EXISTS public.mfa_attempts (
  profile_id      uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  failed_count    integer NOT NULL DEFAULT 0,
  first_failed_at timestamptz NOT NULL DEFAULT now(),
  locked_until    timestamptz
);

ALTER TABLE public.mfa_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mfa_attempts FROM anon, authenticated;
GRANT ALL ON public.mfa_attempts TO service_role;
