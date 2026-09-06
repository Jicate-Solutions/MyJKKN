-- 2026-08-08 PHASE 0 — snapshot every learners_profiles row that currently holds
-- an out-of-scope academic FK, BEFORE the 2026-08-08 repair wave touches anything.
--
-- CONTEXT: residue of the 2026-07-30 bulk-write incident. Waves one/two/three
-- (20260730100923, 20260730113325, 20260731100130) repaired academic_year_id,
-- degree_id, department_id and part of section_id. The fourth migration —
-- 20260731170000_repair_learner_semester_cross_institution_via_section.sql —
-- was WRITTEN but never applied: it is absent from supabase_migrations and its
-- snapshot table _bak_learner_semester_repair_20260731 does not exist. That is
-- why 260 rows still carry another institution's semester_id today.
--
-- This snapshot is deliberately WIDER than any single repair: it captures the
-- union of all six violation classes so that every phase of the 2026-08-08 wave
-- can be reverted from one table.

DROP TABLE IF EXISTS public._bak_learner_scope_repair_20260808;

CREATE TABLE public._bak_learner_scope_repair_20260808 AS
SELECT lp.id                AS learner_id,
       lp.roll_number,
       lp.first_name,
       lp.last_name,
       lp.lifecycle_status,
       lp.institution_id,
       lp.degree_id,
       lp.department_id,
       lp.program_id,
       lp.semester_id,
       lp.section_id,
       lp.academic_year_id,
       lp.updated_at        AS snapshot_updated_at,
       -- Violation classes, so a revert can target exactly one phase.
       (sem.id IS NOT NULL AND sem.institution_id IS DISTINCT FROM lp.institution_id)
         AS semester_cross_institution,
       (sem.id IS NOT NULL AND sem.institution_id = lp.institution_id
        AND sem.program_id IS DISTINCT FROM lp.program_id)
         AS semester_wrong_program,
       (sec.id IS NOT NULL AND sec.institution_id IS DISTINCT FROM lp.institution_id)
         AS section_cross_institution,
       (sec.id IS NOT NULL AND sec.institution_id = lp.institution_id
        AND sec.program_id IS DISTINCT FROM lp.program_id)
         AS section_wrong_program,
       (p.id IS NOT NULL AND p.institution_id IS DISTINCT FROM lp.institution_id)
         AS program_cross_institution,
       (p.id IS NOT NULL AND lp.department_id IS NOT NULL
        AND p.department_id IS DISTINCT FROM lp.department_id)
         AS program_wrong_department,
       now()                AS snapshot_at
FROM public.learners_profiles lp
LEFT JOIN public.semesters sem ON sem.id = lp.semester_id
LEFT JOIN public.sections  sec ON sec.id = lp.section_id
LEFT JOIN public.programs  p   ON p.id   = lp.program_id
WHERE (sem.id IS NOT NULL AND sem.institution_id IS DISTINCT FROM lp.institution_id)
   OR (sem.id IS NOT NULL AND sem.institution_id = lp.institution_id
       AND sem.program_id IS DISTINCT FROM lp.program_id)
   OR (sec.id IS NOT NULL AND sec.institution_id IS DISTINCT FROM lp.institution_id)
   OR (sec.id IS NOT NULL AND sec.institution_id = lp.institution_id
       AND sec.program_id IS DISTINCT FROM lp.program_id)
   OR (p.id IS NOT NULL AND p.institution_id IS DISTINCT FROM lp.institution_id)
   OR (p.id IS NOT NULL AND lp.department_id IS NOT NULL
       AND p.department_id IS DISTINCT FROM lp.department_id);

ALTER TABLE public._bak_learner_scope_repair_20260808
  ADD PRIMARY KEY (learner_id);

COMMENT ON TABLE public._bak_learner_scope_repair_20260808 IS
  'Pre-repair snapshot, 2026-08-08 wave. Old scope FKs for every learner holding an out-of-scope academic FK. Revert source for phases 1-4.';
