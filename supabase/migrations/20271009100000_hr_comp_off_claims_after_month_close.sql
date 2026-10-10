-- Comp-off claims survive the month close.
--
-- A credit is valid for ONE CALENDAR MONTH from the day worked (20260911170000),
-- but HR can close that day's attendance month at any point inside the window.
-- 20260827200000 made trg_hcoc_block_locked_period refuse every write to a credit
-- whose worked_date sits in a locked month, so a day worked on 27 Sep could not
-- be claimed (or a filed claim decided) once September was closed, even though
-- the claim window ran to 27 Oct.
--
-- WHY LIFTING IT FOR COMP OFF IS SAFE. A credit is leave entitlement, spent on a
-- LATER date through hr_trig_comp_off_consume, which stamps the leave's own dates
-- and never the worked day. Nothing that is frozen at close reads
-- hr_comp_off_credits: fn_hr_attendance_period_projection and
-- fn_hr_compute_attendance_period_summary do not, and only the close gate and
-- console count pending claims. So a claim, its decision or its revocation cannot
-- change a frozen summary or the salary register.
--
-- WHAT STAYS LOCKED in a closed month: deleting a credit, editing worked_date or
-- credit_days, credits written by HR/the system (source <> 'claim'), a claim
-- inserted already decided (hcoc_insert_claim's approver branch does not pin
-- status, so this guard must), and every other status move.
--
-- Three functions change; no table, policy, grant or trigger definition does.

-- ---------------------------------------------------------------------------
-- 1. The guard.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_trig_block_comp_off_claim_in_locked_period()
RETURNS trigger
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

  -- worked_date and credit_days must be untouched for any exemption below, so
  -- none of them can be used to smuggle an edit of the closed month through.
  IF TG_OP = 'UPDATE'
     AND NEW.worked_date = OLD.worked_date
     AND NEW.credit_days = OLD.credit_days
  THEN
    -- Spending a credit is not a change to the closed month. Both directions of
    -- hr_trig_comp_off_consume's toggle (any source).
    IF (NEW.status = 'consumed' AND OLD.status = 'approved')
       OR (NEW.status = 'approved' AND OLD.status = 'consumed')
    THEN
      RETURN NEW;
    END IF;

    -- The life of a CLAIM: decided, withdrawn by the claimant, or an approved
    -- one taken back. A 'consumed' credit is not here; revoking it is refused by
    -- fn_hr_comp_off_revoke_block_reason until its leave is revoked.
    IF OLD.source = 'claim' AND NEW.source = 'claim'
       AND (
         (OLD.status = 'pending'  AND NEW.status IN ('approved', 'rejected', 'withdrawn'))
         OR (OLD.status = 'approved' AND NEW.status = 'rejected')
       )
    THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Raising a claim. Only the claimant's shape: source 'claim', still pending.
  IF TG_OP = 'INSERT' AND NEW.source = 'claim' AND NEW.status = 'pending' THEN
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
      'Attendance for %-% is closed (locked %). This change to a compensatory off credit is not allowed for a day in that month.',
      v_locked.period_year, lpad(v_locked.period_month::text, 2, '0'),
      to_char(v_locked.locked_at, 'DD Mon YYYY')
      USING ERRCODE = 'P0001';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$fn$;

COMMENT ON FUNCTION public.hr_trig_block_comp_off_claim_in_locked_period() IS
  'In a locked attendance month a comp-off credit may still be claimed (pending), decided, withdrawn or revoked, and consumed/un-consumed. Delete, worked_date/credit_days edits, non-claim credits and any other status move are refused.';

-- ---------------------------------------------------------------------------
-- 2. Revoking an unspent approved claim no longer needs the month open.
--
-- The "Reopen the month before revoking this claim" branch is gone; everything
-- else is the live body: the consumed-credit rule, the self-revoke refusal and
-- the hr.leave.revoke / hr.leave.approve + organisation check. trg_hcoc_revoke_gate
-- re-runs this function, so the dialog and the trigger stay in agreement.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_comp_off_revoke_block_reason(p_credit_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $fn$
DECLARE
  v_uid    uuid := (SELECT auth.uid());
  v_credit record;
  v_leave  record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 'You must be signed in to revoke a claim.';
  END IF;

  SELECT c.id, c.status, c.employee_id, c.hr_organization_id,
         c.worked_date, c.consumed_by_application_id
    INTO v_credit
  FROM public.hr_comp_off_credits c
  WHERE c.id = p_credit_id;

  IF NOT FOUND THEN
    RETURN 'That claim no longer exists.';
  END IF;

  IF v_credit.status = 'consumed' THEN
    SELECT a.start_date, a.end_date INTO v_leave
      FROM public.hr_leave_applications a
     WHERE a.id = v_credit.consumed_by_application_id;

    IF FOUND THEN
      RETURN format(
        'This credit was already used by the compensatory off booked for %s to %s. Revoke that leave first — doing so returns the credit — then revoke this claim.',
        to_char(v_leave.start_date, 'DD/MM/YYYY'), to_char(v_leave.end_date, 'DD/MM/YYYY'));
    END IF;
    RETURN 'This credit was already used by a booked compensatory off. Revoke that leave first, which returns the credit.';
  END IF;

  IF v_credit.status <> 'approved' THEN
    RETURN 'Only an approved claim can be revoked — this one is ' || v_credit.status || '.';
  END IF;

  IF NOT public.is_super_admin()
     AND v_credit.employee_id = ANY (COALESCE(public.fn_my_staff_ids(), ARRAY[]::uuid[])) THEN
    RETURN 'You cannot revoke your own claim.';
  END IF;

  IF public.is_super_admin() THEN
    RETURN NULL;
  END IF;

  IF (public.user_has_permission('hr.leave.revoke')
      OR public.user_has_permission('hr.leave.approve'))
     AND v_credit.hr_organization_id = ANY (COALESCE(public.fn_my_hr_organization_ids(), ARRAY[]::uuid[])) THEN
    RETURN NULL;
  END IF;

  RETURN 'You do not have permission to revoke compensatory off claims in this organisation.';
END
$fn$;

-- ---------------------------------------------------------------------------
-- 3. The nightly auto-reject no longer steps around closed months.
--
-- 20260911180000 skipped claims whose worked day sat in a locked month because
-- the guard refused any update there and one such row aborted the whole batch.
-- The guard now allows a pending claim to be rejected, so the skip would only
-- leave an expired claim pending forever.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_comp_off_reject_expired_claims()
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_count integer;
BEGIN
  UPDATE public.hr_comp_off_credits c
     SET status = 'rejected',
         approved_at = now(),
         rejection_reason = format(
           'Automatically rejected: not approved before the credit''s one-month expiry on %s.',
           to_char(c.expires_on, 'DD/MM/YYYY'))
   WHERE c.status = 'pending'
     AND c.expires_on < v_today;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count > 0 THEN
    RAISE NOTICE 'fn_hr_comp_off_reject_expired_claims: rejected %', v_count;
  END IF;

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_hr_comp_off_reject_expired_claims() FROM PUBLIC, anon, authenticated;
