-- =============================================================================
-- 20260611233000_pde_curriculum_read_rpcs.sql
-- PDE <-> BoS Outcome Connector — scoped curriculum read RPCs.
-- Spec: specs/pde-bos-outcome-connector-2026-06-11.md
-- =============================================================================
-- WHY (live-discovered access gap, 2026-06-11 discovery test):
--   * bos_course_syllabi SELECT policy requires academic.bos-syllabus.view +
--     BoS board membership — learners can NEVER read syllabi, and non-BoS
--     faculty validators can't either. The dual-lane picker + validator CLO
--     confirmation are impossible through plain RLS reads.
--   * vac_courses SELECT policy requires a user_institution_access row —
--     staff cross-institution grants; ordinary learners don't have one.
--
-- FIX: SECURITY DEFINER read RPCs that expose ONLY picker-minimal columns and
-- enforce the Director-locked "own institution only" scope (spec §4.9) inside
-- the function — deliberately NOT a widening of the BoS/VAC tables' own RLS,
-- so those modules' threat models are untouched. BoS/VAC stay strictly
-- read-only to PDE (T4.3 discipline).
-- =============================================================================

-- Approved syllabi for the caller's own institution (picker feed).
-- "Approved" := is_latest AND NOT is_archived (no approval-status column).
CREATE OR REPLACE FUNCTION public.fn_pde_list_approved_syllabi()
RETURNS TABLE (
  id uuid,
  course_code varchar,
  course_name varchar,
  version_number integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.course_code, s.course_name, s.version_number
  FROM bos_course_syllabi s
  WHERE s.institutions_id = (SELECT p.institution_id FROM profiles p WHERE p.id = auth.uid())
    AND s.is_latest
    AND NOT s.is_archived
  ORDER BY s.course_code;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_pde_list_approved_syllabi() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_pde_list_approved_syllabi() TO authenticated;

-- Outcome JSONB for specific syllabus versions (CLO checklist, validator
-- confirmation panel, attainment math). Caller sees a syllabus when it belongs
-- to their institution, or when they are admin/super_admin (evidence pages).
CREATE OR REPLACE FUNCTION public.fn_pde_get_syllabus_outcomes(p_syllabus_ids uuid[])
RETURNS TABLE (
  id uuid,
  course_code varchar,
  course_name varchar,
  version_number integer,
  course_learning_outcomes jsonb,
  po_mappings jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.course_code, s.course_name, s.version_number,
         s.course_learning_outcomes, s.po_mappings
  FROM bos_course_syllabi s
  WHERE s.id = ANY(p_syllabus_ids)
    AND (
      s.institutions_id = (SELECT p.institution_id FROM profiles p WHERE p.id = auth.uid())
      OR is_super_admin()
      OR is_admin()
    );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_pde_get_syllabus_outcomes(uuid[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_pde_get_syllabus_outcomes(uuid[]) TO authenticated;

-- Active VAC courses for the caller's own institution (VAC lane picker).
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
  WHERE v.institution_id = (SELECT p.institution_id FROM profiles p WHERE p.id = auth.uid())
    AND v.is_active
  ORDER BY v.name;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_pde_list_vac_courses() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_pde_list_vac_courses() TO authenticated;

NOTIFY pgrst, 'reload schema';
