-- ============================================================================
-- Salary register lines: break paid leave into CL / comp-off / other (2026-09-22)
-- ============================================================================
--
-- The register detail table shows the day columns HR reads — Business working
-- days, Casual leave, OD, Comp off, LOP, Worked, Paid days. Five of those were
-- already columns (merely hidden on first load), but CASUAL LEAVE AND COMP-OFF
-- WERE NOT DATA: computeRegisterLine folds them into one paid_leave_days
--   (leave_days − OD/CD-typed leave) + comp_off_days
-- so the screen could not take them apart.
--
-- Three columns, and the third is the point. CL and comp-off alone would be a
-- breakdown that silently fails to add up the first time a Clinical, PH.D or
-- WFH leave reaches a register: 30 paid day-leave types exist, and Clinical
-- already appears on 11 summaries. other_paid_leave_days catches everything
-- that is neither, so
--   casual_leave_days + comp_off_days + other_paid_leave_days = paid_leave_days
-- holds by construction and the row on screen always closes.
--
-- paid_leave_days KEEPS ITS MEANING (the total) and no money moves: this is a
-- breakdown of a figure the register already had, so net pay, paid_days and
-- every identity in computeRegisterLine are untouched.
--
-- BACKFILLED, not left at zero. Every one of the 136 included lines still has
-- its source summary (attendance_period_id + staff_id), and across all of them
-- paid_leave_days already equals CL + comp-off exactly — measured before this
-- migration was written. So the split is recovered, not invented, and an old
-- register reads the same as one generated tomorrow.
-- ============================================================================

ALTER TABLE public.hr_salary_register_lines
  ADD COLUMN IF NOT EXISTS casual_leave_days     numeric(5,1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comp_off_days         numeric(5,1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_paid_leave_days numeric(5,1) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.hr_salary_register_lines.casual_leave_days IS
  'Paid leave taken under a Casual Leave type (hr_leave_types.leave_type_code = ''CL'', the same code at all 14 institutions). Part of paid_leave_days, not additional to it.';
COMMENT ON COLUMN public.hr_salary_register_lines.comp_off_days IS
  'Compensatory off days (request_category = ''compensatory_off''). Part of paid_leave_days, not additional to it.';
COMMENT ON COLUMN public.hr_salary_register_lines.other_paid_leave_days IS
  'Paid leave that is neither casual nor comp-off — Clinical, PH.D, WFH and any other institution-specific paid type. casual + comp_off + other = paid_leave_days, so the register row always adds up.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill from the frozen summary each line was computed from
-- ─────────────────────────────────────────────────────────────────────────────
-- OD/CD-typed leave is deliberately NOT part of this split: computeRegisterLine
-- already moves it into on_duty_days, so it is outside paid_leave_days and must
-- stay outside the breakdown of it.
UPDATE public.hr_salary_register_lines l
   SET casual_leave_days     = x.casual,
       comp_off_days         = x.comp_off,
       other_paid_leave_days = GREATEST(0, l.paid_leave_days - x.casual - x.comp_off)
  FROM (
    SELECT s.staff_id,
           s.period_id,
           COALESCE((s.leave_by_type->>'CL')::numeric, 0)::numeric(5,1) AS casual,
           COALESCE(s.comp_off_days, 0)::numeric(5,1)                   AS comp_off
      FROM public.hr_attendance_period_summaries s
  ) x
 WHERE x.staff_id = l.staff_id
   AND x.period_id = l.attendance_period_id;

-- ─────────────────────────────────────────────────────────────────────────────
-- Prove the invariant the whole column set exists for
-- ─────────────────────────────────────────────────────────────────────────────
DO $chk$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n
    FROM public.hr_salary_register_lines
   WHERE abs((casual_leave_days + comp_off_days + other_paid_leave_days) - paid_leave_days) > 0.001;
  IF n <> 0 THEN
    RAISE EXCEPTION
      '% register lines do not satisfy casual + comp_off + other = paid_leave_days.', n;
  END IF;

  -- The backfill reached every line that has a summary to read. A line without
  -- one is an excluded row (no attendance), and its figures are all zero.
  SELECT count(*) INTO n
    FROM public.hr_salary_register_lines l
    JOIN public.hr_attendance_period_summaries s
      ON s.staff_id = l.staff_id AND s.period_id = l.attendance_period_id
   WHERE l.paid_leave_days > 0
     AND l.casual_leave_days = 0
     AND l.comp_off_days = 0
     AND l.other_paid_leave_days = 0;
  IF n <> 0 THEN
    RAISE EXCEPTION '% lines carry paid leave that the backfill did not split.', n;
  END IF;
END
$chk$;
