-- ============================================================================
-- Salary register: scope the roster by PAYROLL institution again (2026-09-23)
-- Reverses the grouping of 20260830160000_hr_salary_register_work_institution_scope.sql
--
-- WHY. HR pays salaries per paying institution (hr_staff_payroll), and the
-- Pharmacy August reconciliation showed the cost of grouping by work location:
-- Pharmacy pays 73 people (58 working there, 10 at Main Office, 5 at Jicate)
-- while its work-scoped register listed 59, and the hand-kept register could
-- not be matched against it.
--
-- The two reasons payer scoping was dropped on 2026-08-30 no longer hold:
--   - "105 active staff have no payer" is now 1.
--   - Main Office pays nobody, so it simply gets no register; the generate
--     screen only offers payroll institutions.
-- A register now waits on the month close of EVERY work location its staff
-- come from — the preflight names each one.
--
-- WHERE SOMEONE WORKS moves from being the grouping key to being an attribute
-- of the line, snapshotted like every other identity field so a transfer after
-- payday cannot rewrite an issued register. Lines written before this migration
-- keep it NULL (shown as "—").
--
-- The live-run unique index stays on (institution_id, year, month): the run's
-- institution is the PAYING organisation's institution, 1:1 with it.
-- ============================================================================

ALTER TABLE public.hr_salary_register_lines
  ADD COLUMN IF NOT EXISTS work_institution_id uuid REFERENCES public.institutions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS work_institution_name text;

CREATE INDEX IF NOT EXISTS idx_hr_salary_register_lines_work_institution
  ON public.hr_salary_register_lines (work_institution_id);

COMMENT ON COLUMN public.hr_salary_register_lines.work_institution_id IS
  'Where this person WORKS (staff.institution_id), snapshotted at generation. The register itself is grouped by who pays (hr_staff_payroll). NULL on lines generated before 2026-09-23.';
COMMENT ON COLUMN public.hr_salary_register_lines.work_institution_name IS
  'Work institution name at generation time, frozen so a rename or transfer cannot rewrite an issued register.';

COMMENT ON TABLE public.hr_salary_register_runs IS
  'Frozen monthly salary register for one PAYING institution (hr_staff_payroll), computed from the closed attendance months of every work location its staff come from + hr_staff_salaries. Where each person works is recorded per line. Not hr_payroll_periods.';
COMMENT ON COLUMN public.hr_salary_register_runs.source_attendance_period_ids IS
  'The closed attendance months feeding this run — one per work location among the staff this institution pays.';
