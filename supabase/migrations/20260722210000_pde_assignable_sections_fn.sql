-- Migration: fn_pde_assignable_sections — scope the clinical-case assignment
-- section picker to only sections that have >=1 learner enrolled in the case's
-- course, and hand back a disambiguating "Programme · Semester · Section" label.
--
-- Why: the assign API GET previously loaded ALL active sections in the case's
-- institution (89 for the BDS pilot). Assigning to a section with zero enrolled
-- learners is meaningless, and a bare "Section A" collides across years/programmes
-- ("BDS · 4 Year · G" vs "BDS · CRRI · G" both render as "G"). This function
-- narrows the set to enrolled sections only and composes the readable label in
-- SQL so the picker is unambiguous.
--
-- Join path: pde_assessments.course_id → vac_enrollments.user_id
--   → profiles.id / profiles.learner_id → learners_profiles.section_id.
--   (auth.users.id == profiles.id 1:1; profiles.learner_id → learners_profiles.id.)
--   Label: sections.program_id → programs.program_name;
--          sections.semester_id → semesters.semester_name.
--
-- Caller: app/api/pde/cases/[id]/assign/route.ts GET, via the service-role client
-- (a non-creator Senior Learner may assign but does not hold pde_assess_write).
-- Locked to service_role only; anon/PUBLIC/authenticated explicitly revoked.
--
-- Date: 2026-07-22

CREATE OR REPLACE FUNCTION public.fn_pde_assignable_sections(p_assessment_id uuid)
RETURNS TABLE(id uuid, section_name text, label text)
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
    concat_ws(' · ', pr.program_name, sem.semester_name, s.section_name) AS label
  FROM enrolled e
  JOIN sections s ON s.id = e.section_id
  LEFT JOIN programs pr ON pr.id = s.program_id
  LEFT JOIN semesters sem ON sem.id = s.semester_id
  WHERE s.is_active
  ORDER BY label;
$$;

-- Lock: Supabase's default ALTER DEFAULT PRIVILEGES grants anon EXECUTE on every
-- new function. Revoke it (and PUBLIC/authenticated) — only the service-role route
-- caller may run this.
REVOKE ALL    ON FUNCTION public.fn_pde_assignable_sections(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_pde_assignable_sections(uuid) TO service_role;
