-- Migration: 20260621T0011Z_cdc_training_cohort_binding
-- Date: 2026-06-21
-- Reason: BUG-004073 — Training Programme form (/cdc/training/new) had no way to
--         record which cohort a programme targets. Add cohort-binding columns to
--         cdc_training_programmes:
--           • target_department_id — the department the training is aimed at
--           • academic_year_label  — the batch / academic year (free-text label,
--                                     matching the existing cdc_idp convention)
--         Both nullable: programmes may be cross-department / cohort-agnostic.
--         Section is finer-grained and intentionally deferred (follow-up).
-- Additive only · idempotent · snake_case.

ALTER TABLE public.cdc_training_programmes
  ADD COLUMN IF NOT EXISTS target_department_id uuid,
  ADD COLUMN IF NOT EXISTS academic_year_label  text;

-- FK to departments(id): table + referenced column confirmed via existing
-- *_department_id_fkey constraints (e.g. bug_reports_department_id_fkey).
-- ON DELETE SET NULL so deleting a department leaves the programme intact,
-- merely un-bound from the (now absent) cohort department.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cdc_training_programmes_target_department_id_fkey'
  ) THEN
    ALTER TABLE public.cdc_training_programmes
      ADD CONSTRAINT cdc_training_programmes_target_department_id_fkey
      FOREIGN KEY (target_department_id)
      REFERENCES public.departments(id)
      ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.cdc_training_programmes.target_department_id
  IS 'Department this training programme targets (cohort binding). NULL = cross-department (BUG-004073).';

COMMENT ON COLUMN public.cdc_training_programmes.academic_year_label
  IS 'Batch / academic year this programme targets, stored as the academic_years.academic_year_name label (cohort binding). NULL = year-agnostic (BUG-004073).';
