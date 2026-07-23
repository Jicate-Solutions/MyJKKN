-- Migration: fn_pde_assignable_sections v2 — include archived sections, flagged.
--
-- Follow-up to 20260722210000 (user-interview decision, 2026-07-22): some sections
-- are archived (is_active=false) but STILL have learners enrolled in the course
-- (2 such in the BDS pilot). v1 hid them, so a Senior Learner could not assign a locked
-- case to those enrolled learners even deliberately. v2 returns them too, plus an
-- `is_active` flag so the picker can tag them "(archived)" and sort them BELOW the
-- active sections (they should not clutter the top of the list).
--
-- Adding the `is_active` column to RETURNS TABLE is a return-type change, which
-- Postgres forbids for CREATE OR REPLACE — hence DROP + CREATE.
--
-- Still service_role-locked (anon/authenticated EXECUTE revoked). Because this
-- re-declares a SECURITY DEFINER function, the anon-lock CI gate treats it as new,
-- so the REVOKE is re-asserted below.
--
-- Date: 2026-07-22

DROP FUNCTION IF EXISTS public.fn_pde_assignable_sections(uuid);

CREATE FUNCTION public.fn_pde_assignable_sections(p_assessment_id uuid)
RETURNS TABLE(id uuid, section_name text, label text, is_active boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH course AS (
    SELECT a.course_id
    FROM pde_assessments a
    WHERE a.id = p_assessment_id
      AND a.assessment_type = 'clinical_case'
  ),
  enrolled AS (
    SELECT DISTINCT lp.section_id
    FROM vac_enrollments ve
    JOIN course c ON ve.course_id = c.course_id
    JOIN profiles p ON p.id = ve.user_id
    JOIN learners_profiles lp ON lp.id = p.learner_id
    WHERE lp.section_id IS NOT NULL
  )
  SELECT
    s.id,
    s.section_name,
    concat_ws(' · ', pr.program_name, sem.semester_name, s.section_name) AS label,
    COALESCE(s.is_active, true) AS is_active
  FROM enrolled e
  JOIN sections s ON s.id = e.section_id
  LEFT JOIN programs pr ON pr.id = s.program_id
  LEFT JOIN semesters sem ON sem.id = s.semester_id
  -- No is_active filter: an archived section that still has enrolled learners is
  -- shown (flagged + sorted last) so a Senior Learner can deliberately assign to it.
  ORDER BY (COALESCE(s.is_active, true) IS NOT TRUE), label;
$$;

REVOKE ALL    ON FUNCTION public.fn_pde_assignable_sections(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_pde_assignable_sections(uuid) TO service_role;
