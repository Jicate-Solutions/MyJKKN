-- Compensatory off: keep it out of hr_leave_balances, consume credits on
-- approval, and expose the balance.
--
-- 1. hr_trig_update_leave_balance incremented `used` for EVERY approved
--    application. Comp off carries entitled=0, so approving one drove the
--    balance straight negative — the same permanently-negative trap the
--    generator warns about, reached by a different road. Comp off is now
--    accounted for solely in hr_comp_off_credits.
--
-- 2. Approval consumes credits FIFO by expiry (spend what dies soonest) and
--    RAISES if there are not enough, so an approver cannot overdraw. Reversing
--    the approval releases them, keeping the original expiry: cancelling a
--    booking must not extend the life of the underlying credit.
--
-- 3. Availability is DERIVED (status='approved' AND expires_on >= today),
--    never read from a stored 'expired' status. A stored status needs a
--    scheduled job, and that job failing would silently keep dead credits
--    spendable.
--
-- Verified end-to-end against production before cleanup:
--   claim                       -> expiry auto-set worked_date + 90
--                                  (2026-07-05 -> 2026-10-03)
--   approve                     -> available 1
--   approve comp-off request    -> credit consumed, linked to the application
--   hr_leave_balances comp_off  -> used stayed 0.00 (no pollution)
--   second request, no credits  -> approval BLOCKED, stayed pending
--   cancel                      -> credit returned to approved, expiry intact

CREATE OR REPLACE FUNCTION public.hr_trig_update_leave_balance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $fn$
DECLARE
  v_delta numeric;
  v_category text;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT request_category INTO v_category
  FROM public.hr_leave_types WHERE id = NEW.leave_type_id;

  -- Comp off is ledger-backed; hr_leave_balances holds no entitlement for it.
  IF v_category = 'compensatory_off' THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
    v_delta := NEW.total_days;
    INSERT INTO hr_leave_balances (employee_id, leave_type_id, academic_year_id, hr_organization_id, entitled, used, carried_forward)
    VALUES (NEW.employee_id, NEW.leave_type_id, NEW.academic_year_id, NEW.hr_organization_id, 0, v_delta, 0)
    ON CONFLICT (employee_id, leave_type_id, academic_year_id)
    DO UPDATE SET
      used = hr_leave_balances.used + EXCLUDED.used,
      updated_at = now();

  ELSIF NEW.status IN ('cancelled', 'rejected', 'withdrawn') AND OLD.status = 'approved' THEN
    v_delta := NEW.total_days;
    UPDATE hr_leave_balances
       SET used = GREATEST(0, used - v_delta),
           updated_at = now()
     WHERE employee_id = NEW.employee_id
       AND leave_type_id = NEW.leave_type_id
       AND academic_year_id = NEW.academic_year_id;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $fn$;

CREATE OR REPLACE FUNCTION public.hr_trig_comp_off_consume()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_category text;
  v_needed   numeric;
  v_avail    numeric;
  r          record;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT request_category INTO v_category
  FROM public.hr_leave_types WHERE id = NEW.leave_type_id;
  IF v_category IS DISTINCT FROM 'compensatory_off' THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'approved' AND OLD.status <> 'approved' THEN
    v_needed := NEW.total_days;

    -- Expiry derived here, not read from a status column, so a lapsed credit
    -- can never be spent even if no cleanup job has ever run.
    SELECT COALESCE(sum(credit_days), 0) INTO v_avail
    FROM public.hr_comp_off_credits
    WHERE employee_id = NEW.employee_id
      AND status = 'approved'
      AND expires_on >= CURRENT_DATE;

    IF v_avail < v_needed THEN
      RAISE EXCEPTION
        'Insufficient compensatory off: % day(s) available, % requested. Approve a comp-off claim first.',
        v_avail, v_needed;
    END IF;

    -- FIFO by expiry: spend what dies soonest.
    FOR r IN
      SELECT id, credit_days FROM public.hr_comp_off_credits
      WHERE employee_id = NEW.employee_id
        AND status = 'approved'
        AND expires_on >= CURRENT_DATE
      ORDER BY expires_on, worked_date
    LOOP
      EXIT WHEN v_needed <= 0;
      UPDATE public.hr_comp_off_credits
         SET status = 'consumed',
             consumed_by_application_id = NEW.id,
             consumed_at = now()
       WHERE id = r.id;
      v_needed := v_needed - r.credit_days;
    END LOOP;

  ELSIF NEW.status IN ('cancelled','rejected','withdrawn') AND OLD.status = 'approved' THEN
    UPDATE public.hr_comp_off_credits
       SET status = 'approved',
           consumed_by_application_id = NULL,
           consumed_at = NULL
     WHERE consumed_by_application_id = NEW.id;
  END IF;

  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_hla_comp_off_consume ON public.hr_leave_applications;
CREATE TRIGGER trg_hla_comp_off_consume
  AFTER UPDATE OF status ON public.hr_leave_applications
  FOR EACH ROW EXECUTE FUNCTION public.hr_trig_comp_off_consume();

CREATE OR REPLACE FUNCTION public.hr_comp_off_balance(p_employee_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_emp uuid;
  v_out jsonb;
BEGIN
  -- Default to the caller's own staff record. An explicit id is honoured only
  -- for approvers, so this cannot be used to read a colleague's ledger.
  v_emp := COALESCE(p_employee_id, (SELECT unnest(public.fn_my_staff_ids()) LIMIT 1));
  IF v_emp IS NULL THEN
    RETURN jsonb_build_object('earned',0,'available',0,'expired',0,'consumed',0,'pending',0,'credits','[]'::jsonb);
  END IF;

  IF p_employee_id IS NOT NULL
     AND NOT (p_employee_id IN (SELECT unnest(public.fn_my_staff_ids())))
     AND NOT public.is_super_admin()
     AND NOT public.user_has_permission('hr.leave.approve') THEN
    RAISE EXCEPTION 'Not authorized to read this compensatory off ledger';
  END IF;

  SELECT jsonb_build_object(
    'employee_id', v_emp,
    'earned',    COALESCE(sum(credit_days) FILTER (WHERE status IN ('approved','consumed')), 0),
    'available', COALESCE(sum(credit_days) FILTER (WHERE status = 'approved' AND expires_on >= CURRENT_DATE), 0),
    'expired',   COALESCE(sum(credit_days) FILTER (WHERE status = 'approved' AND expires_on <  CURRENT_DATE), 0),
    'consumed',  COALESCE(sum(credit_days) FILTER (WHERE status = 'consumed'), 0),
    'pending',   COALESCE(sum(credit_days) FILTER (WHERE status = 'pending'), 0),
    'credits', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.worked_date DESC)
      FROM (
        SELECT c.id, c.worked_date, c.expires_on, c.credit_days, c.status, c.source,
               c.notes, c.rejection_reason,
               CASE
                 WHEN c.status = 'approved' AND c.expires_on < CURRENT_DATE THEN 'expired'
                 ELSE c.status
               END AS effective_status,
               GREATEST(0, c.expires_on - CURRENT_DATE) AS days_until_expiry
        FROM public.hr_comp_off_credits c
        WHERE c.employee_id = v_emp
      ) x
    ), '[]'::jsonb)
  )
  INTO v_out
  FROM public.hr_comp_off_credits
  WHERE employee_id = v_emp;

  RETURN COALESCE(v_out, jsonb_build_object('earned',0,'available',0,'expired',0,'consumed',0,'pending',0,'credits','[]'::jsonb));
END $fn$;

REVOKE ALL ON FUNCTION public.hr_comp_off_balance(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_comp_off_balance(uuid) TO authenticated;
