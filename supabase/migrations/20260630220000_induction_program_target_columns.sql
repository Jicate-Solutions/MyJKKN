-- 20260630220000_induction_program_target_columns.sql
-- Multi-target induction: enrolling institutions + optional degrees/departments.
-- Arrays are filter sets consumed by the enrollment RPCs (= ANY()). institution_id
-- stays as the owning/primary institution (= target_institution_ids[1]).
ALTER TABLE public.induction_programs
  ADD COLUMN IF NOT EXISTS target_institution_ids uuid[],
  ADD COLUMN IF NOT EXISTS target_degree_ids      uuid[],
  ADD COLUMN IF NOT EXISTS target_department_ids  uuid[];

COMMENT ON COLUMN public.induction_programs.target_institution_ids IS
  'Institutions whose freshers auto-enroll (>=1 for new rows). NULL = legacy induction (use institution_id + enroll_scope).';
COMMENT ON COLUMN public.induction_programs.target_degree_ids IS
  'Optional degree filter; NULL/empty = all degrees.';
COMMENT ON COLUMN public.induction_programs.target_department_ids IS
  'Optional department filter; NULL/empty = all departments.';

NOTIFY pgrst, 'reload schema';
