-- =============================================================================
-- 20260612084500_vac_universal_picker_and_code_unique.sql
-- VAC content migration follow-ups (Director interview decisions, 2026-06-12).
-- Decisions + evidence: specs/vac-staging-fk-mapping-audit-2026-06-11.md §8.
-- Both changes were APPLIED LIVE 2026-06-12 via Management API / psql — this
-- file is the repo record (re-running is a no-op).
-- =============================================================================

-- Decision: "Universal" VAC courses (institution_id IS NULL — the network-wide
-- AI Fluency / Capstone / Human Presence / Principal Leadership tracks) appear
-- in EVERY college's PDE curriculum picker, not just the caller's own college.
-- Dark-import discipline still applies: is_active gates visibility, so nothing
-- shows until a course is flipped live.
CREATE OR REPLACE FUNCTION public.fn_pde_list_vac_courses()
RETURNS TABLE (
  id uuid,
  code varchar,
  name varchar,
  track varchar
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.id, v.code, v.name, v.track
  FROM vac_courses v
  WHERE (
      v.institution_id = (SELECT p.institution_id FROM profiles p WHERE p.id = auth.uid())
      OR v.institution_id IS NULL
    )
    AND v.is_active
  ORDER BY v.name;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_pde_list_vac_courses() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_pde_list_vac_courses() TO authenticated;

-- Decision: code-uniqueness parity with staging (prevents duplicate course
-- codes; makes an accidental re-run of the content import fail loudly).
CREATE UNIQUE INDEX IF NOT EXISTS vac_courses_code_key ON vac_courses (code);

NOTIFY pgrst, 'reload schema';
