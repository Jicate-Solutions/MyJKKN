-- ============================================================================
-- Salary register: scope the roster by WORK LOCATION, not by payer
-- 2026-08-30 — revises 20260830150000_hr_salary_register.sql
--
-- WHY THE ORIGINAL SCOPING DID NOT SURVIVE CONTACT
--   The register was built payer-first: roster = hr_staff_payroll, one register
--   per paying organisation. That is defensible for a payment document, and it
--   failed immediately in practice for two reasons the data made obvious:
--
--   1. JKKN Main Office is a real workplace with 121 active staff, and it pays
--      NOBODY (is_payroll_entity = false, zero rows in hr_staff_payroll). Under
--      payer scoping it could never have a register at all, while its 121 people
--      were scattered across five other institutions' registers. HR runs Main
--      Office as one place and needs one register for it.
--   2. 105 active staff have NO payer recorded anywhere. Payer scoping put them
--      on no register at all — invisible rather than flagged, which is the exact
--      silent-omission failure this module was written to avoid.
--
--   Payer scoping also made a register wait on OTHER institutions' month closes:
--   Pharmacy's register needed Pharmacy, Main Office AND Jicate closed. One
--   register now waits on exactly one month — its own.
--
-- WHAT REPLACES IT
--   Roster = staff.institution_id (WHERE SOMEONE WORKS), which is also what the
--   attendance month close is keyed on, so a register maps 1:1 onto the month
--   that feeds it. Every active staff member appears on exactly one register.
--
--   WHO PAYS is not discarded — it moves from being the grouping key to being
--   an attribute of each row, plus a per-payer subtotal in the export. Main
--   Office's single register then answers "what does each institution owe for
--   the people working here", which is the question that could not be asked
--   when the roster itself was split five ways.
-- ============================================================================

-- Snapshotted like every other identity field on this table: a payer
-- reassignment after payday must not rewrite an issued register.
ALTER TABLE public.hr_salary_register_lines
  ADD COLUMN IF NOT EXISTS paid_by_organization_id uuid REFERENCES public.hr_organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paid_by_name text;

CREATE INDEX IF NOT EXISTS idx_hr_salary_register_lines_paid_by
  ON public.hr_salary_register_lines (paid_by_organization_id);

COMMENT ON COLUMN public.hr_salary_register_lines.paid_by_organization_id IS
  'Who bears this salary (hr_staff_payroll), snapshotted. NULL means no payer is recorded — the person still appears and is still paid; the register reports the gap rather than hiding them.';
COMMENT ON COLUMN public.hr_salary_register_lines.paid_by_name IS
  'Payer name at generation time, frozen so a rename cannot rewrite an issued register.';

-- The run's identity is now the WORK institution. hr_organization_id is kept
-- (it is NOT NULL and 1:1 with institution) but is no longer what makes a run
-- unique — institution_id is. Both resolve to the same row today; naming the
-- real key stops a future divergence from silently allowing two live runs.
DROP INDEX IF EXISTS public.uq_hr_salary_register_runs_live;
CREATE UNIQUE INDEX uq_hr_salary_register_runs_live
  ON public.hr_salary_register_runs (institution_id, period_year, period_month)
  WHERE superseded_at IS NULL;

COMMENT ON TABLE public.hr_salary_register_runs IS
  'Frozen monthly salary register for one WORK institution (staff.institution_id), computed from that institution''s closed attendance month + hr_staff_salaries. Who pays each person is recorded per line, not per run. Not hr_payroll_periods.';
COMMENT ON COLUMN public.hr_salary_register_runs.source_attendance_period_ids IS
  'The closed attendance month feeding this run. Still an array for the frozen history written under payer scoping, when a run could depend on several; work-scoped runs carry exactly one.';
