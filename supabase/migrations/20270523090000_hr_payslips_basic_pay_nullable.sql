-- 20270523090000 — payslips from the monthly gross: basic may be "not
-- recorded", deductions are saved one by one, and a run keeps its notes.
--
-- FILE ONLY. Not applied to any database by the PR that adds it.
--
-- WHY. Director rulings, 30 Sep 2026: payslips take pay from each person's
-- monthly gross (hr_staff_salaries) IN FORCE FOR THE MONTH; PF is the flat PF
-- amount HR typed on the salary (epf_amount); the allowance is paid; no Basic
-- is recorded anywhere and none is ever guessed.
--
-- 1. hr_payslips.basic_pay may be NULL. No per-person basic is recorded
--    anywhere (hr_staff_salaries has no basic column; its import sheet's
--    Basic_Salary is stored as monthly_gross because it is the WHOLE monthly
--    pay, 20260821191000). basic_pay NOT NULL forced a number, and 0 would read
--    as "basic is zero". NULL is the honest value, printed "basic not recorded".
--
-- 2. hr_payslips gains allowance_paid and the four deductions one by one
--    (pf_deduction, esi_deduction, tds_deduction, pt_deduction). Until now a
--    slip kept only total_deductions, so a manual override that changed only PF
--    had no way to keep ESI and the taxes as they were, and set them to 0 (W12
--    review). All five are NULL on a slip made before this, which the override
--    refuses to guess about. CHECK (>= 0) like every other amount on the row.
--
-- 3. hr_payroll_periods gains generation_notes (jsonb): the last payslip run's
--    warnings and the people it left off, with the reason for each. They were
--    only in the HTTP response, which nobody kept (W12 review).
--
-- WHAT DOES NOT CHANGE. No RLS policy, grant, trigger or function. The new
-- columns are written by whoever may already write the row (payroll staff
-- under the existing rules); none of them decides who may do anything. Existing
-- rows are untouched (production has no hr_payslips rows as of 2026-09-30).
--
-- Idempotent: DROP NOT NULL on a nullable column is a no-op; ADD COLUMN IF NOT
-- EXISTS skips the column and its CHECK the second time.
--
-- Merge order: apply BEFORE the payslip generator that writes these columns
-- runs, or its insert fails loudly and nothing is written.

ALTER TABLE public.hr_payslips
  ALTER COLUMN basic_pay DROP NOT NULL;

ALTER TABLE public.hr_payslips
  ADD COLUMN IF NOT EXISTS allowance_paid numeric CHECK (allowance_paid >= 0),
  ADD COLUMN IF NOT EXISTS pf_deduction   numeric CHECK (pf_deduction >= 0),
  ADD COLUMN IF NOT EXISTS esi_deduction  numeric CHECK (esi_deduction >= 0),
  ADD COLUMN IF NOT EXISTS tds_deduction  numeric CHECK (tds_deduction >= 0),
  ADD COLUMN IF NOT EXISTS pt_deduction   numeric CHECK (pt_deduction >= 0);

ALTER TABLE public.hr_payroll_periods
  ADD COLUMN IF NOT EXISTS generation_notes jsonb;

COMMENT ON COLUMN public.hr_payslips.basic_pay IS
  'The basic HR recorded for this person, not cut for loss of pay. NULL = no basic recorded; the payslip shows "basic not recorded". Never computed from the gross. PF does not depend on it: PF is the flat amount HR typed on the salary. Ruling 2026-09-30.';
COMMENT ON COLUMN public.hr_payslips.allowance_paid IS
  'The allowance (hr_staff_salaries.allowance_amount) paid this month, after loss of pay. Already inside gross_amount. NULL on slips made before 20270523090000.';
COMMENT ON COLUMN public.hr_payslips.pf_deduction IS
  'PF taken off: the flat amount HR typed on the salary (epf_amount), 0 when HR marked the person not eligible. NULL on slips made before 20270523090000.';
COMMENT ON COLUMN public.hr_payslips.esi_deduction IS
  'ESI taken off, 0 when HR marked the person not eligible. NULL on slips made before 20270523090000.';
COMMENT ON COLUMN public.hr_payslips.tds_deduction IS
  'Income tax (TDS) taken off. NULL on slips made before 20270523090000.';
COMMENT ON COLUMN public.hr_payslips.pt_deduction IS
  'Professional tax taken off. NULL on slips made before 20270523090000.';
COMMENT ON COLUMN public.hr_payroll_periods.generation_notes IS
  'The last payslip run''s notes: {generated_at, generated, skipped, warnings[], skipped_people[{staff_id,name,reason}]}. Shown on the period page. NULL = no run yet. 20270523090000.';
