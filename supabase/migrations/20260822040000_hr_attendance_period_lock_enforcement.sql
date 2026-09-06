-- MAKE THE LOCK REAL.
--
-- hr_payroll_periods has had a `locked` status since 2026-06-28 and it stops
-- nothing: exactly five functions in this database mention that table and all
-- five are its own state machine. A lock that no other code reads is a label,
-- not a control. These two triggers are what make this one different.
--
-- NO SUPER-ADMIN BYPASS, deliberately. A super admin can REOPEN the month --
-- which is recorded, reasoned, and throws the stale summaries away. Letting the
-- same person also write straight through a closed month would give them a
-- silent path that leaves the frozen counts disagreeing with the records they
-- were computed from.

CREATE OR REPLACE FUNCTION public.hr_trig_block_writes_in_locked_period()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row    record;
  v_locked record;
BEGIN
  v_row := COALESCE(NEW, OLD);

  SELECT ap.period_year, ap.period_month, ap.locked_at
    INTO v_locked
    FROM public.hr_attendance_periods ap
   WHERE ap.institution_id = v_row.institution_id
     AND ap.status = 'locked'
     AND make_date(ap.period_year, ap.period_month, 1) <= v_row.work_date
     AND (make_date(ap.period_year, ap.period_month, 1) + interval '1 month')::date > v_row.work_date
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'Attendance for %-% is closed (locked %). Reopen the month before changing attendance for %.',
      v_locked.period_year, lpad(v_locked.period_month::text, 2, '0'),
      to_char(v_locked.locked_at, 'DD Mon YYYY'), v_row.work_date
      USING ERRCODE = 'P0001';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_har_block_locked_period ON public.hr_attendance_records;
CREATE TRIGGER trg_har_block_locked_period
  BEFORE INSERT OR UPDATE OR DELETE ON public.hr_attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.hr_trig_block_writes_in_locked_period();


-- Leave / short time off / compensatory off cannot be raised, decided or
-- withdrawn once the month they fall in is closed.
--
-- ANY OVERLAP BLOCKS, not just the start date: an application spanning a closed
-- month and an open one would otherwise change day counts inside the closed
-- half.
--
-- The force-close path rejects outstanding requests BEFORE it sets the status
-- to locked, so those rejections happen while the month is still open and do
-- not trip this.
CREATE OR REPLACE FUNCTION public.hr_trig_block_leave_in_locked_period()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row      record;
  v_inst     uuid;
  v_locked   record;
BEGIN
  v_row := COALESCE(NEW, OLD);

  SELECT s.institution_id INTO v_inst
    FROM public.staff s WHERE s.id = v_row.employee_id;

  IF v_inst IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT ap.period_year, ap.period_month, ap.locked_at
    INTO v_locked
    FROM public.hr_attendance_periods ap
   WHERE ap.institution_id = v_inst
     AND ap.status = 'locked'
     AND make_date(ap.period_year, ap.period_month, 1) <= v_row.end_date
     AND (make_date(ap.period_year, ap.period_month, 1) + interval '1 month')::date > v_row.start_date
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'Attendance for %-% is closed (locked %). Requests covering that month can no longer be raised or decided.',
      v_locked.period_year, lpad(v_locked.period_month::text, 2, '0'),
      to_char(v_locked.locked_at, 'DD Mon YYYY')
      USING ERRCODE = 'P0001';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_hla_block_locked_period ON public.hr_leave_applications;
-- Named with a leading 'a' relative to the other guards is NOT required here --
-- this one RAISES rather than mutating NEW, so alphabetical firing order among
-- the ten triggers on this table does not change the outcome.
CREATE TRIGGER trg_hla_block_locked_period
  BEFORE INSERT OR UPDATE OR DELETE ON public.hr_leave_applications
  FOR EACH ROW EXECUTE FUNCTION public.hr_trig_block_leave_in_locked_period();

COMMENT ON FUNCTION public.hr_trig_block_writes_in_locked_period() IS
  'Refuses any write to hr_attendance_records inside a locked attendance month. This is what makes the lock a control rather than a label.';
COMMENT ON FUNCTION public.hr_trig_block_leave_in_locked_period() IS
  'Refuses leave / STO / comp-off writes overlapping a locked attendance month. Any overlap blocks, so a cross-month application cannot alter the closed half.';
