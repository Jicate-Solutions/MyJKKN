-- ============================================================================
-- Coordinators panel: list ONLY induction-running colleges (not every institution)
-- Date: 2026-06-30
--
-- The Coordinators panel on /events/induction used to read the institutions table
-- directly (supabase.from('institutions')). Because the only viewers are super-admin
-- or the induction_lead role — both scope='all' — RLS returned EVERY institution,
-- including non-colleges like "JKKN Main Office", "Testing", "Jicate Solutions".
-- A coordinator is only meaningful for a college that is actually running an
-- induction, i.e. one that has a (non-blueprint) induction_programs row.
--
-- This RPC returns exactly that set, gated to the same manage-coordinators authority
-- as the other panel RPCs (20260630010000_induction_coordinators_management.sql) so
-- the institution list no longer bypasses that gate.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_induction_running_colleges()
 RETURNS TABLE (id uuid, name text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.fn_induction_can_manage_coordinators() THEN
    RAISE EXCEPTION 'fn_induction_running_colleges: not authorized';
  END IF;
  RETURN QUERY
    -- ::text cast: institutions.name is varchar but RETURNS TABLE declares text,
    -- and SECURITY DEFINER RETURN QUERY is strict (42804). Matches the sibling RPCs.
    SELECT i.id, i.name::text
    FROM public.institutions i
    WHERE EXISTS (
      SELECT 1 FROM public.induction_programs ip
      WHERE ip.institution_id = i.id          -- excludes the central blueprint (institution_id NULL)
        AND ip.is_blueprint = false           -- and any institution-scoped blueprint
    )
    ORDER BY i.name;
END $$;

-- Anon-lock (SECURITY DEFINER — Supabase grants anon EXECUTE by default).
REVOKE EXECUTE ON FUNCTION public.fn_induction_running_colleges() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_running_colleges() TO authenticated;
