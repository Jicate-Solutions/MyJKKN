-- Comp-off CLAIMS obey the month-close lock, like every other request.
--
-- 20260822040000 blocked leave and short time off once their month is closed,
-- but it only covered hr_leave_applications. Comp off spans TWO tables and only
-- one was protected:
--
--   * BOOKING comp off is an hr_leave_applications row
--     (request_category='compensatory_off') — already blocked;
--   * CLAIMING a worked day is an hr_comp_off_credits row keyed on worked_date
--     — completely unguarded. Verified 2026-08-27: a claim for 19 Jul 2026
--     inserted cleanly while July was locked.
--
-- So a closed month could still grow new credits, and an approver could still
-- approve them — creating entitlement against days whose attendance is final.
--
-- THE CONSUME PATH IS DELIBERATELY EXEMPT. hr_trig_comp_off_consume marks a
-- credit 'consumed' (and reverses it on cancel) when a booking is approved. A
-- credit EARNED in a closed month is legitimately spendable later — freezing
-- the day it was earned must not freeze the credit itself — so an update that
-- only toggles the consumption fields is allowed through. Everything else on a
-- locked month is refused: raising a claim, deciding one, withdrawing one,
-- deleting one, or moving a worked_date into the month.
--
-- Also closes the hole this would otherwise open in the close flow itself.
-- fn_hr_lock_attendance_period counted only leave applications as "outstanding
-- requests", so a month could be closed with comp-off claims still pending
-- inside it — and once the trigger below exists those rows could never be
-- decided at all. Claims now count toward that check and are rejected by the
-- same super-admin force path. The rejection runs BEFORE the period flips to
-- 'locked', so it passes the new trigger.

CREATE OR REPLACE FUNCTION public.hr_trig_block_comp_off_claim_in_locked_period()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_row    record;
  v_inst   uuid;
  v_locked record;
BEGIN
  v_row := COALESCE(NEW, OLD);

  -- Spending a credit is not a change to the closed month. Both directions of
  -- hr_trig_comp_off_consume's toggle are allowed; worked_date and credit_days
  -- must be untouched, so this cannot be used to smuggle an edit through.
  IF TG_OP = 'UPDATE'
     AND NEW.worked_date = OLD.worked_date
     AND NEW.credit_days = OLD.credit_days
     AND (
       (NEW.status = 'consumed' AND OLD.status = 'approved')
       OR (NEW.status = 'approved' AND OLD.status = 'consumed')
     )
  THEN
    RETURN NEW;
  END IF;

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
     AND make_date(ap.period_year, ap.period_month, 1) <= v_row.worked_date
     AND (make_date(ap.period_year, ap.period_month, 1) + interval '1 month')::date > v_row.worked_date
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'Attendance for %-% is closed (locked %). Compensatory off cannot be claimed or decided for a day in that month.',
      v_locked.period_year, lpad(v_locked.period_month::text, 2, '0'),
      to_char(v_locked.locked_at, 'DD Mon YYYY')
      USING ERRCODE = 'P0001';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$fn$;

DROP TRIGGER IF EXISTS trg_hcoc_block_locked_period ON public.hr_comp_off_credits;
CREATE TRIGGER trg_hcoc_block_locked_period
  BEFORE INSERT OR UPDATE OR DELETE ON public.hr_comp_off_credits
  FOR EACH ROW EXECUTE FUNCTION public.hr_trig_block_comp_off_claim_in_locked_period();

COMMENT ON FUNCTION public.hr_trig_block_comp_off_claim_in_locked_period() IS
  'Refuses comp-off claim writes whose worked_date falls in a locked attendance month. Consuming/un-consuming an already-earned credit is exempt.';


-- ---------------------------------------------------------------------------
-- Pending comp-off claims now count as outstanding requests at close time.
--
-- Body identical to 20260822030000 apart from v_pending gaining the claims
-- count and the force path gaining the matching rejection. See that migration
-- for the permission gate and the empty-month refusal.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_hr_lock_attendance_period(
  p_institution_id uuid,
  p_year           integer,
  p_month          integer,
  p_force          boolean DEFAULT false,
  p_force_reason   text    DEFAULT NULL
)
RETURNS public.hr_attendance_periods
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_period   public.hr_attendance_periods;
  v_start    date;
  v_end      date;
  v_pending  integer;
  v_records  integer;
  v_is_sa    boolean := public.is_super_admin();
BEGIN
  IF NOT (v_is_sa OR public.user_has_permission('hr.attendance.period.manage')) THEN
    RAISE EXCEPTION 'hr.attendance.period.manage is required to close an attendance month.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'Month must be 1-12, got %', p_month USING ERRCODE = '22023';
  END IF;

  v_start := make_date(p_year, p_month, 1);
  v_end   := (v_start + interval '1 month - 1 day')::date;

  SELECT count(*) INTO v_records
    FROM public.hr_attendance_records
   WHERE institution_id = p_institution_id
     AND work_date BETWEEN v_start AND v_end;

  IF v_records = 0 THEN
    RAISE EXCEPTION 'No attendance records for that institution in %-%. Import the biometric data first.',
      p_year, lpad(p_month::text, 2, '0')
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.hr_attendance_periods (
    institution_id, period_year, period_month, status, created_by, updated_by
  ) VALUES (p_institution_id, p_year, p_month, 'open', auth.uid(), auth.uid())
  ON CONFLICT (institution_id, period_year, period_month) DO NOTHING;

  SELECT * INTO v_period
    FROM public.hr_attendance_periods
   WHERE institution_id = p_institution_id
     AND period_year = p_year AND period_month = p_month
   FOR UPDATE;

  IF v_period.status = 'locked' THEN
    RAISE EXCEPTION 'That month is already closed (locked %).',
      to_char(v_period.locked_at, 'DD Mon YYYY') USING ERRCODE = 'P0001';
  END IF;

  -- Undecided requests overlapping the month, for staff of this institution:
  -- leave / short time off, PLUS comp-off claims for a day inside it. Claims
  -- were missing, so a month could close over them and the lock trigger would
  -- then make them permanently undecidable.
  SELECT (
    (SELECT count(*)
       FROM public.hr_leave_applications la
       JOIN public.staff s ON s.id = la.employee_id
      WHERE s.institution_id = p_institution_id
        AND la.status = 'pending'
        AND la.start_date <= v_end AND la.end_date >= v_start)
    +
    (SELECT count(*)
       FROM public.hr_comp_off_credits cc
       JOIN public.staff s2 ON s2.id = cc.employee_id
      WHERE s2.institution_id = p_institution_id
        AND cc.status = 'pending'
        AND cc.worked_date BETWEEN v_start AND v_end)
  ) INTO v_pending;

  IF v_pending > 0 AND NOT p_force THEN
    RAISE EXCEPTION
      '% request(s) for this month are still awaiting a decision. Clear them in Leave Approvals, or close with an override.',
      v_pending
      USING ERRCODE = 'P0001';
  END IF;

  IF v_pending > 0 AND p_force THEN
    IF NOT v_is_sa THEN
      RAISE EXCEPTION 'Only a Super Administrator may close a month over % outstanding request(s).', v_pending
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_force_reason IS NULL OR length(trim(p_force_reason)) = 0 THEN
      RAISE EXCEPTION 'A reason is required to close a month over outstanding requests.'
        USING ERRCODE = '22023';
    END IF;

    UPDATE public.hr_leave_applications la
       SET status = 'rejected',
           final_approver_id = auth.uid(),
           final_decided_at = now(),
           updated_at = now()
      FROM public.staff s
     WHERE s.id = la.employee_id
       AND s.institution_id = p_institution_id
       AND la.status = 'pending'
       AND la.start_date <= v_end AND la.end_date >= v_start;

    -- Runs while the period is still 'open', so trg_hcoc_block_locked_period
    -- lets it through. No credit is created for a rejected claim.
    UPDATE public.hr_comp_off_credits cc
       SET status = 'rejected',
           rejection_reason = left('Month closed over outstanding claims: ' || trim(p_force_reason), 500),
           updated_at = now()
      FROM public.staff s2
     WHERE s2.id = cc.employee_id
       AND s2.institution_id = p_institution_id
       AND cc.status = 'pending'
       AND cc.worked_date BETWEEN v_start AND v_end;
  END IF;

  PERFORM public.fn_hr_compute_attendance_period_summary(v_period.id);

  UPDATE public.hr_attendance_periods
     SET status = 'locked',
         locked_at = now(),
         locked_by = auth.uid(),
         forced = (v_pending > 0 AND p_force),
         force_reason = CASE WHEN v_pending > 0 AND p_force THEN trim(p_force_reason) END,
         updated_by = auth.uid()
   WHERE id = v_period.id
  RETURNING * INTO v_period;

  RETURN v_period;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_hr_lock_attendance_period(uuid, integer, integer, boolean, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_hr_lock_attendance_period(uuid, integer, integer, boolean, text) TO authenticated, service_role;
