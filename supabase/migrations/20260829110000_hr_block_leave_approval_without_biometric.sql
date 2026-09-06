-- Refuse to approve leave / comp-off for a day whose biometric is not uploaded.
--
-- WHY A GATE AS WELL AS THE RE-STAMP
--
-- 20260829100000 makes the import re-apply approved leave stamps, so the data
-- is now correct in either order. This trigger is the PROCESS half: it stops an
-- approver marking August leave approved while the report for those days does
-- not exist yet, and tells them what to do instead. Without it the approval
-- looks complete on screen and the attendance report simply has no row --
-- indistinguishable, to the approver, from working correctly.
--
-- Sits beside trg_hla_block_locked_period and deliberately mirrors it: same
-- BEFORE UPDATE placement, same RAISE ... USING ERRCODE = 'P0001', same habit of
-- resolving the institution from staff rather than trusting an embed.
--
-- A TRIGGER, NOT A SERVICE CHECK. The approve route is not the only writer, and
-- a browser running a stale bundle silently skipping a client-side guard is
-- exactly how the regularization stamp stayed broken for weeks.
--
-- FOUR CONDITIONS, ALL REQUIRED. Each one exists to stop the gate blocking
-- somebody it should not:
--
--   1. request_category IN ('leave','compensatory_off')
--      Short Time Off is EXCLUDED. It is already correct in both orders:
--      fetch-permissions.ts feeds approved permissions into evaluateDay during
--      the import, and recomputeForShortTimeOff runs on approve/reject/
--      withdraw/cancel. Gating it would hold 385 of 536 pending requests to fix
--      a problem it does not have.
--
--   2. start_date <= CURRENT_DATE
--      A future-dated request cannot have biometric yet and never will until its
--      month arrives. Blocking those would make advance leave approval
--      impossible. They are safe because the import re-stamps them on upload.
--
--   3. The institution actually RUNS biometric (has any source='biometric' row).
--      Five institutions have none and never will on current arrangements --
--      Arts & Science (Aided), Matric, Nattraja Vidhyalya CBSE, Testing,
--      Jicate. Without this clause their leave could never be approved again.
--
--   4. Coverage is tested per (INSTITUTION, DATE), never per employee.
--      199 of 592 HR-managed staff have no biometric mapping at all, so a
--      per-employee test would block them permanently. Once the institution's
--      file is in for a date, everyone at that institution is unblocked.

CREATE OR REPLACE FUNCTION public.hr_trig_block_leave_approval_without_biometric()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_category   text;
  v_inst       uuid;
  v_last       date;
  v_missing    date;
BEGIN
  -- Only the transition INTO approved. An edit to an already-approved row, or
  -- any other status change, is none of this trigger's business.
  IF NOT (NEW.status = 'approved' AND COALESCE(OLD.status, '') <> 'approved') THEN
    RETURN NEW;
  END IF;

  SELECT request_category INTO v_category
  FROM public.hr_leave_types WHERE id = NEW.leave_type_id;

  -- (1) Short Time Off is exempt.
  IF v_category IS DISTINCT FROM 'leave'
     AND v_category IS DISTINCT FROM 'compensatory_off' THEN
    RETURN NEW;
  END IF;

  -- (2) Nothing to check if the whole request is in the future.
  IF NEW.start_date > CURRENT_DATE THEN
    RETURN NEW;
  END IF;
  v_last := LEAST(NEW.end_date, CURRENT_DATE);

  SELECT s.institution_id INTO v_inst
  FROM public.staff s WHERE s.id = NEW.employee_id;

  IF v_inst IS NULL THEN
    RETURN NEW;
  END IF;

  -- (3) Institutions that do not run biometric are exempt, or they would wait
  -- forever for a file nobody is going to upload.
  IF NOT EXISTS (
    SELECT 1 FROM public.hr_attendance_records r
    WHERE r.institution_id = v_inst AND r.source = 'biometric'
  ) THEN
    RETURN NEW;
  END IF;

  -- (4) The first covered day with no biometric row for this INSTITUTION.
  -- Weekly offs and holidays are imported as rows too (the machine reports
  -- every calendar day), so a gap here means the file is genuinely absent
  -- rather than the day simply being a non-working one.
  SELECT d::date INTO v_missing
  FROM generate_series(NEW.start_date, v_last, interval '1 day') AS d
  WHERE NOT EXISTS (
    SELECT 1 FROM public.hr_attendance_records r
    WHERE r.institution_id = v_inst
      AND r.work_date = d::date
      AND r.source = 'biometric'
  )
  ORDER BY d
  LIMIT 1;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      'Biometric attendance for % has not been uploaded yet, so approving this would not reach the attendance report. Import it from HR > Attendance > Import, then approve. First missing day: %.',
      to_char(v_missing, 'Mon YYYY'),
      to_char(v_missing, 'DD Mon YYYY')
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_hla_block_approval_without_biometric
  ON public.hr_leave_applications;

CREATE TRIGGER trg_hla_block_approval_without_biometric
  BEFORE UPDATE ON public.hr_leave_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.hr_trig_block_leave_approval_without_biometric();

COMMENT ON FUNCTION public.hr_trig_block_leave_approval_without_biometric() IS
  'Refuses leave/comp-off approval for past-dated days whose institution runs biometric but has not uploaded that date. Short Time Off and non-biometric institutions are exempt.';
