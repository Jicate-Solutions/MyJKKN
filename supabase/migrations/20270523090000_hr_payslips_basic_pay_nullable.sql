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
-- 4. hr_payslips gains pf_exempt and esi_exempt (boolean): HR's "not eligible
--    for PF / ESI" flags as they stood when the slip was made, so the period
--    table and its CSV can say "No PF (not eligible)" like the preview, instead
--    of a bare 0 that reads the same as "eligible, but no amount typed". NULL
--    on a slip made before this = not known; the screen then shows the amount.
--
-- 5. ONE CURRENT PAYSLIP PER PERSON PER PERIOD, enforced by the database
--    (W12 review round 2, 30 Sep). Two "Make payslips" presses at once both
--    passed the "no payslips yet" check in the app and both inserted, because
--    the old UNIQUE (period_id, staff_id, superseded_by) never binds when
--    superseded_by is NULL (NULLs are never equal). Now:
--      - uq_hr_payslips_one_current: UNIQUE (period_id, staff_id) WHERE
--        superseded_by IS NULL. The second run's batch insert fails as a whole
--        (23505), so nothing is made twice; the app answers 409 in plain words.
--      - The old constraint uq_hr_payslips_period_staff_supersede is DROPPED.
--        A manual override now CLAIMS the slip first (points it at itself), so
--        two overrides of one slip at once cannot both win, then inserts the
--        adjustment, then points the old slip at it. With a predecessor A -> B,
--        claiming B (B -> B) collides with A -> B under the old constraint, so
--        it cannot stay. What it protected — no slip replaced twice — is kept
--        by uq_hr_payslips_one_successor: UNIQUE (superseded_by) WHERE
--        superseded_by IS NOT NULL AND superseded_by <> id (the brief self
--        claim is left out).
--    Before either index is built, rows that already break it are COUNTED and
--    the migration stops with the count and the query that lists them, rather
--    than failing on an index error nobody can read. (Production's rows were
--    not read for this change.)
--
-- WHAT DOES NOT CHANGE. No RLS policy, grant, trigger or function. The new
-- columns are written by whoever may already write the row (payroll staff
-- under the existing rules); none of them decides who may do anything. Existing
-- rows are untouched: they keep their basic and get NULL in the seven new
-- columns (production's row count was not re-read for this change).
--
-- Idempotent: DROP NOT NULL on a nullable column is a no-op; ADD COLUMN IF NOT
-- EXISTS skips the column and its CHECK the second time; DROP CONSTRAINT IF
-- EXISTS and CREATE UNIQUE INDEX IF NOT EXISTS do nothing the second time.
--
-- Merge order: apply BEFORE the payslip generator that writes these columns
-- runs, or its insert fails loudly and nothing is written. The override's new
-- claim-first order also needs the old constraint gone (section 5).

ALTER TABLE public.hr_payslips
  ALTER COLUMN basic_pay DROP NOT NULL;

ALTER TABLE public.hr_payslips
  ADD COLUMN IF NOT EXISTS allowance_paid numeric CHECK (allowance_paid >= 0),
  ADD COLUMN IF NOT EXISTS pf_deduction   numeric CHECK (pf_deduction >= 0),
  ADD COLUMN IF NOT EXISTS esi_deduction  numeric CHECK (esi_deduction >= 0),
  ADD COLUMN IF NOT EXISTS tds_deduction  numeric CHECK (tds_deduction >= 0),
  ADD COLUMN IF NOT EXISTS pt_deduction   numeric CHECK (pt_deduction >= 0),
  ADD COLUMN IF NOT EXISTS pf_exempt      boolean,
  ADD COLUMN IF NOT EXISTS esi_exempt     boolean;

-- 5. One current payslip per person per period. Count first; stop in words.
DO $$
DECLARE
  v_two_current integer;
  v_two_predecessors integer;
BEGIN
  SELECT count(*) INTO v_two_current FROM (
    SELECT period_id, staff_id
    FROM public.hr_payslips
    WHERE superseded_by IS NULL
    GROUP BY period_id, staff_id
    HAVING count(*) > 1
  ) d;
  IF v_two_current > 0 THEN
    RAISE EXCEPTION
      '20270523090000: % person-period pair(s) already have more than one current payslip. Fix them before this migration: SELECT period_id, staff_id, count(*) FROM public.hr_payslips WHERE superseded_by IS NULL GROUP BY 1, 2 HAVING count(*) > 1',
      v_two_current;
  END IF;

  SELECT count(*) INTO v_two_predecessors FROM (
    SELECT superseded_by
    FROM public.hr_payslips
    WHERE superseded_by IS NOT NULL AND superseded_by <> id
    GROUP BY superseded_by
    HAVING count(*) > 1
  ) d;
  IF v_two_predecessors > 0 THEN
    RAISE EXCEPTION
      '20270523090000: % payslip(s) are named as the replacement of more than one payslip. Fix them before this migration: SELECT superseded_by, count(*) FROM public.hr_payslips WHERE superseded_by IS NOT NULL AND superseded_by <> id GROUP BY 1 HAVING count(*) > 1',
      v_two_predecessors;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_payslips_one_current
  ON public.hr_payslips (period_id, staff_id)
  WHERE superseded_by IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_payslips_one_successor
  ON public.hr_payslips (superseded_by)
  WHERE superseded_by IS NOT NULL AND superseded_by <> id;

ALTER TABLE public.hr_payslips
  DROP CONSTRAINT IF EXISTS uq_hr_payslips_period_staff_supersede;

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
COMMENT ON COLUMN public.hr_payslips.pf_exempt IS
  'HR marked this person not eligible for PF (hr_staff_salaries.eligible_for_pf off) when the slip was made. Shown as "No PF (not eligible)". NULL on slips made before 20270523090000.';
COMMENT ON COLUMN public.hr_payslips.esi_exempt IS
  'HR marked this person not eligible for ESI when the slip was made. Shown as "No ESI (not eligible)". NULL on slips made before 20270523090000.';
COMMENT ON INDEX public.uq_hr_payslips_one_current IS
  'One current (not superseded) payslip per person per period. Makes a second payslip run for the same period fail as a whole instead of paying twice. 20270523090000.';
COMMENT ON INDEX public.uq_hr_payslips_one_successor IS
  'A payslip replaces at most one other (was uq_hr_payslips_period_staff_supersede). The brief self-claim of a manual override (superseded_by = id) is left out. 20270523090000.';
COMMENT ON COLUMN public.hr_payroll_periods.generation_notes IS
  'The last payslip run''s notes: {generated_at, generated, skipped, warnings[], skipped_people[{staff_id,name,reason}]}. Shown on the period page. NULL = no run yet. 20270523090000.';
