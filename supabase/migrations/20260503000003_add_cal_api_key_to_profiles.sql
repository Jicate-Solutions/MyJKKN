-- Migration: 20260503000003_add_cal_api_key_to_profiles.sql
--
-- Adds PgCrypto-encrypted column for per-user Cal.com API keys (Path W)
-- Spec: specs/cal-com-rest-api-for-path-w.md §Auth Model
--
-- Master key env var: CAL_API_KEY_MASTER_SECRET (32+ byte hex recommended)
-- Encryption: pgp_sym_encrypt / pgp_sym_decrypt (PgCrypto symmetric)
-- Access: ONLY via fn_get_cal_api_key / fn_set_cal_api_key (SECURITY DEFINER)
--         which are REVOKE'd from anon + authenticated, GRANT to service_role only.
-- NEVER SELECT cal_api_key_encrypted directly from application code.

-- ────────────────────────────────────────────────────────────
-- 0. Extension
-- ────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ────────────────────────────────────────────────────────────
-- 1. New columns on profiles
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cal_api_key_encrypted bytea,
  ADD COLUMN IF NOT EXISTS cal_user_id           integer;

COMMENT ON COLUMN public.profiles.cal_api_key_encrypted IS
  'PgCrypto-encrypted Cal.com v2 API key (pgp_sym_encrypt). '
  'Master key from env var CAL_API_KEY_MASTER_SECRET. '
  'Decrypt ONLY via fn_get_cal_api_key(). NEVER SELECT directly from app code.';

COMMENT ON COLUMN public.profiles.cal_user_id IS
  'Cal.com User.id on jicate-booking-prod (project_ref fkihmsuwruohdgsqvnxg). '
  'Populated by jicate-booking-provision-service on first MyJKKN login. '
  'NULL means user has no Cal.com identity yet.';

-- ────────────────────────────────────────────────────────────
-- 2. Index: fast look-up by Cal.com user id (e.g. webhook match)
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_profiles_cal_user_id
  ON public.profiles(cal_user_id)
  WHERE cal_user_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 3. SECURITY DEFINER helpers
--    Both functions are:
--    • SECURITY DEFINER (run as owner, not caller)
--    • REVOKE'd from anon + authenticated
--    • GRANT'd to service_role only
--    Master secret is passed by the caller (server-side only).
--    NOTE: the secret travels over the Postgres wire from the
--    Next.js server → Supabase TLS connection; acceptable for
--    self-hosted Supabase. Future upgrade path: use Vault
--    (supabase_vault.secrets) to keep the secret DB-side only.
-- ────────────────────────────────────────────────────────────

-- ── 3a. SET ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_set_cal_api_key(
  p_user_id      uuid,
  p_cal_user_id  integer,
  p_api_key      text,
  p_master_secret text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate inputs explicitly (no silent swallow per feedback_silent_exception_swallow_pattern)
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'fn_set_cal_api_key: p_user_id must not be NULL';
  END IF;
  IF p_cal_user_id IS NULL THEN
    RAISE EXCEPTION 'fn_set_cal_api_key: p_cal_user_id must not be NULL';
  END IF;
  IF p_api_key IS NULL OR length(trim(p_api_key)) = 0 THEN
    RAISE EXCEPTION 'fn_set_cal_api_key: p_api_key must not be NULL or empty';
  END IF;
  IF p_master_secret IS NULL OR length(trim(p_master_secret)) = 0 THEN
    RAISE EXCEPTION 'fn_set_cal_api_key: p_master_secret must not be NULL or empty';
  END IF;

  UPDATE public.profiles
  SET
    cal_api_key_encrypted = pgp_sym_encrypt(p_api_key, p_master_secret),
    cal_user_id           = p_cal_user_id,
    updated_at            = now()
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_set_cal_api_key: no profile found for user_id %', p_user_id;
  END IF;
END;
$$;

-- ── 3b. GET ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_get_cal_api_key(
  p_user_id       uuid,
  p_master_secret text
)
RETURNS TABLE(cal_user_id integer, cal_api_key text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'fn_get_cal_api_key: p_user_id must not be NULL';
  END IF;
  IF p_master_secret IS NULL OR length(trim(p_master_secret)) = 0 THEN
    RAISE EXCEPTION 'fn_get_cal_api_key: p_master_secret must not be NULL or empty';
  END IF;

  RETURN QUERY
  SELECT
    p.cal_user_id,
    CASE
      WHEN p.cal_api_key_encrypted IS NULL THEN NULL
      ELSE pgp_sym_decrypt(p.cal_api_key_encrypted, p_master_secret)
    END AS cal_api_key
  FROM public.profiles p
  WHERE p.id = p_user_id
    AND p.cal_user_id IS NOT NULL;
  -- Returns 0 rows if user not provisioned (caller treats as null)
END;
$$;

-- ── 3c. CLEAR ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_clear_cal_api_key(
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'fn_clear_cal_api_key: p_user_id must not be NULL';
  END IF;

  UPDATE public.profiles
  SET
    cal_api_key_encrypted = NULL,
    cal_user_id           = NULL,
    updated_at            = now()
  WHERE id = p_user_id;
  -- Intentionally silent if user not found (idempotent clear)
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 4. Permission grants / revokes
--    Pattern: REVOKE ALL from everyone, then GRANT to service_role.
--    Follows /deploy-myjkkn Lesson 6 + feedback_silent_exception_swallow_pattern.
-- ────────────────────────────────────────────────────────────

-- fn_set_cal_api_key
REVOKE ALL ON FUNCTION public.fn_set_cal_api_key(uuid, integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_set_cal_api_key(uuid, integer, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.fn_set_cal_api_key(uuid, integer, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_set_cal_api_key(uuid, integer, text, text) TO service_role;

-- fn_get_cal_api_key
REVOKE ALL ON FUNCTION public.fn_get_cal_api_key(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_get_cal_api_key(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.fn_get_cal_api_key(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_cal_api_key(uuid, text) TO service_role;

-- fn_clear_cal_api_key
REVOKE ALL ON FUNCTION public.fn_clear_cal_api_key(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_clear_cal_api_key(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.fn_clear_cal_api_key(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_clear_cal_api_key(uuid) TO service_role;
