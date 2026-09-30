-- FIXTURE for __tests__/ci/check-institution-param-guard.test.ts — NOT a migration.
-- Unguarded body, but the author says why on the line above CREATE FUNCTION.
-- The gate MUST pass it.
-- institution-param-guard: allow super-admin only: the first statement raises for every other caller
CREATE OR REPLACE FUNCTION public.fn_probe_admin_institution_rename(p_institution_id uuid, p_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'super admin only'; END IF;
  UPDATE institutions SET name = p_name WHERE id = p_institution_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_probe_admin_institution_rename(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_probe_admin_institution_rename(uuid, text) TO authenticated;
