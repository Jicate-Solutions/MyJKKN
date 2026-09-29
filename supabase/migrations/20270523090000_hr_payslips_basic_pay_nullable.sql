-- 20270523090000 — hr_payslips.basic_pay may be NULL: "basic not recorded".
--
-- FILE ONLY. Not applied to any database by the PR that adds it.
--
-- WHY. Director ruling, 2026-09-30: payslips take pay from each person's
-- current monthly gross (hr_staff_salaries), and "Basic comes from the basic HR
-- already records, and where none is recorded the payslip shows 'basic not
-- recorded' rather than guessing."
--
-- No per-person basic is recorded anywhere today: hr_staff_salaries has no
-- basic column, and its import sheet's Basic_Salary is stored as monthly_gross
-- because it is the WHOLE monthly pay (20260821191000). So a payslip must be
-- able to say "no basic" without writing a number. basic_pay NOT NULL forced a
-- number, and 0 would read as "basic is zero" to every screen and export that
-- reads the column. NULL is the honest value.
--
-- WHAT CHANGES. Only the NOT NULL. CHECK (basic_pay >= 0) stays and passes for
-- NULL. No RLS policy, grant, trigger or function changes. Existing rows are
-- untouched (production has no hr_payslips rows as of 2026-09-30).
--
-- Idempotent: DROP NOT NULL on a column that already allows NULL is a no-op.
-- Merge order: this must be applied BEFORE the payslip generator that writes
-- NULL runs, or a payslip insert fails loudly (nothing is written).

ALTER TABLE public.hr_payslips
  ALTER COLUMN basic_pay DROP NOT NULL;

COMMENT ON COLUMN public.hr_payslips.basic_pay IS
  'The basic HR recorded for this person, not cut for loss of pay. NULL = no basic recorded; the payslip shows "basic not recorded" and the provident fund (worked out from basic) was not worked out. Never computed from the gross. Ruling 2026-09-30.';
