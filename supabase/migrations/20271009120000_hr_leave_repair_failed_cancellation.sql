-- Repair ONE leave whose cancellation silently failed.
--
-- LeaveService.cancelApplication used to INSERT a copy already marked 'cancelled'
-- and then try to link the original to it. The balance trigger
-- (hr_trig_update_leave_balance) fires on UPDATE of status only, and the link
-- UPDATE was refused by hla_update's WITH CHECK, so the original stayed
-- 'approved' with its day still deducted, and every retry left another copy.
-- The service is fixed in the same change; this repairs the one leave in an open
-- month that the bug left behind:
--
--   SIVASHANKAR M, JKKN College of Engineering and Technology, Casual Leave,
--   5 Sep 2026, 1 day: six cancel attempts on 28 Sep 2026, original still approved.
--
-- Flipping the ORIGINAL to 'cancelled' makes the trigger give the day back. The six
-- copies never moved a balance and are removed.
--
-- NOT touched: nine short-time-off permissions in the same state (four in open
-- months, five in closed months). A closed month refuses the write, and the open
-- ones only concern past, already-spent minute budgets. HR decides on those.
--
-- The attendance day (5 Sep) still reads LEAVE after this: no trigger reverses the
-- approval stamp, so it has to be re-judged by the day evaluator (TypeScript).
--
-- Every precondition is asserted; any surprise raises and rolls the whole file back.

DO $$
DECLARE
  c_app   CONSTANT uuid := '90498407-4cef-4d4b-a6fe-9d51c753b2f3';
  c_emp   CONSTANT uuid := '527d598d-cd5d-4f69-9316-c5fca9380836';
  v_status      text;
  v_type        uuid;
  v_ay          uuid;
  v_days        numeric;
  v_clones      integer;
  v_deleted     integer;
  v_used_before numeric;
  v_used_after  numeric;
BEGIN
  SELECT a.status, a.leave_type_id, a.hr_academic_year_id, a.total_days
    INTO v_status, v_type, v_ay, v_days
    FROM public.hr_leave_applications a
   WHERE a.id = c_app
     AND a.employee_id = c_emp
     AND a.start_date = DATE '2026-09-05'
     AND a.end_date   = DATE '2026-09-05';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Repair target % not found for the expected employee and date', c_app;
  END IF;
  IF v_status <> 'approved' THEN
    RAISE EXCEPTION 'Repair target is % , expected approved; nothing to repair', v_status;
  END IF;

  SELECT count(*) INTO v_clones
    FROM public.hr_leave_applications c
   WHERE c.employee_id = c_emp
     AND c.leave_type_id = v_type
     AND c.start_date = DATE '2026-09-05'
     AND c.end_date   = DATE '2026-09-05'
     AND c.id <> c_app
     AND c.status = 'cancelled'
     AND c.reason LIKE '[CANCELLED]%'
     AND c.superseded_by IS NULL;
  IF v_clones <> 6 THEN
    RAISE EXCEPTION 'Expected exactly 6 stray cancelled copies, found %', v_clones;
  END IF;

  SELECT used INTO v_used_before
    FROM public.hr_leave_balances
   WHERE employee_id = c_emp AND leave_type_id = v_type AND hr_academic_year_id = v_ay;
  IF v_used_before IS NULL OR v_used_before < v_days THEN
    RAISE EXCEPTION 'Balance used (%) is below the leave''s % day(s); the arithmetic would not be exact',
      v_used_before, v_days;
  END IF;

  UPDATE public.hr_leave_applications
     SET status = 'cancelled'
   WHERE id = c_app AND status = 'approved';

  SELECT used INTO v_used_after
    FROM public.hr_leave_balances
   WHERE employee_id = c_emp AND leave_type_id = v_type AND hr_academic_year_id = v_ay;
  IF v_used_before - v_used_after <> v_days THEN
    RAISE EXCEPTION 'Balance moved by % but the leave was % day(s)', v_used_before - v_used_after, v_days;
  END IF;

  DELETE FROM public.hr_leave_applications c
   WHERE c.employee_id = c_emp
     AND c.leave_type_id = v_type
     AND c.start_date = DATE '2026-09-05'
     AND c.end_date   = DATE '2026-09-05'
     AND c.id <> c_app
     AND c.status = 'cancelled'
     AND c.reason LIKE '[CANCELLED]%'
     AND c.superseded_by IS NULL;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> 6 THEN
    RAISE EXCEPTION 'Deleted % stray copies, expected 6', v_deleted;
  END IF;

  RAISE NOTICE 'hr_leave_repair_failed_cancellation: used % -> %, % stray copies removed',
    v_used_before, v_used_after, v_deleted;
END
$$;
