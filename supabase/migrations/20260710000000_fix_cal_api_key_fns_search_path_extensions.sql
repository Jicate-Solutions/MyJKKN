-- 20260710000000_fix_cal_api_key_fns_search_path_extensions.sql
-- Reason: pgcrypto lives in the `extensions` schema on Supabase, but the 3 cal-api-key
-- vault fns were authored (20260503000003) with bare `SET search_path = public`, so
-- pgp_sym_encrypt/decrypt fail with 42883 at runtime → Path W vault was silently dead
-- (0/5875 users provisionable). Live prod was hot-patched via exec_sql 2026-06-11;
-- this forward migration makes the repo / fresh-rebuild substrate match prod.
-- Bodies copied VERBATIM from 20260503000003 — ONLY the search_path line changed.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.fn_set_cal_api_key(
  p_user_id      uuid,
  p_cal_user_id  integer,
  p_api_key      text,
  p_master_secret text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
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

CREATE OR REPLACE FUNCTION public.fn_get_cal_api_key(
  p_user_id       uuid,
  p_master_secret text
)
RETURNS TABLE(cal_user_id integer, cal_api_key text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_clear_cal_api_key(
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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
END;
$$;

REVOKE ALL ON FUNCTION public.fn_set_cal_api_key(uuid, integer, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_get_cal_api_key(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_clear_cal_api_key(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_set_cal_api_key(uuid, integer, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_get_cal_api_key(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_clear_cal_api_key(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
