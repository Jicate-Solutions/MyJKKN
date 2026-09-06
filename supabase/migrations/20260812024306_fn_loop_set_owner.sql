-- Updated: 2026-08-12 — fn_loop_set_owner: the super-admin-only write path for
-- the Owners & verdicts panel on /admin/loops (Director decision 2026-08-12:
-- verdict-owner delegation was decided but the loop registry had no UI; the
-- first real owner assignment happens through this function).
--
-- SECURITY DEFINER with its OWN is_super_admin() check — the page gate is
-- UI-only; this is the enforcement. Blank inputs normalize to NULL via
-- NULLIF(btrim(...)), so clearing a field in the UI clears the column.
-- Returns FOUND: false = no registry row matched p_loop_key (surfaced as an
-- explicit error toast in the panel, never swallowed).
--
-- NOT applied by merging — applying this to production is a separate,
-- Director-gated step at deploy time.

CREATE OR REPLACE FUNCTION public.fn_loop_set_owner(p_loop_key text, p_verdict_owner text, p_owner_email text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_super_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  UPDATE loop_registry SET verdict_owner = NULLIF(btrim(p_verdict_owner),''), owner_email = NULLIF(btrim(p_owner_email),''), updated_at = now() WHERE loop_key = p_loop_key;
  RETURN FOUND;
END $$;

-- MANDATORY house policy (2026-06-06): Supabase's default privileges grant
-- anon EXECUTE on every new function — revoke it explicitly, separate from
-- PUBLIC. Reference: migration 20260605191101 + feedback_supabase_anon_execute_default_grant.
REVOKE EXECUTE ON FUNCTION public.fn_loop_set_owner(text,text,text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_loop_set_owner(text,text,text) TO authenticated;
