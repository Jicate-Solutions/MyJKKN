-- =====================================================================
-- Approval trigger: insert entitled = NULL, not 0
-- =====================================================================
-- WHY: approving leave for someone with no balance row inserted
-- (entitled = 0, used = total_days) -- a permanently negative balance the
-- generator could never repair, because it was ON CONFLICT DO NOTHING and
-- would skip the row it needed to fix. NULL means "derive from the leave
-- type", so the row records the usage without pinning entitlement to zero.

CREATE OR REPLACE FUNCTION public.hr_trig_update_leave_balance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_delta numeric;
  v_category text;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT request_category INTO v_category
  FROM public.hr_leave_types WHERE id = NEW.leave_type_id;

  -- Comp off is credit-backed; short time off is minute-backed. Neither draws
  -- on a day entitlement.
  IF v_category IN ('compensatory_off', 'short_time_off') THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
    v_delta := NEW.total_days;
    INSERT INTO hr_leave_balances (employee_id, leave_type_id, hr_academic_year_id, hr_organization_id, entitled, used, carried_forward)
    VALUES (NEW.employee_id, NEW.leave_type_id, NEW.hr_academic_year_id, NEW.hr_organization_id, NULL, v_delta, 0)
    ON CONFLICT (employee_id, leave_type_id, hr_academic_year_id)
    DO UPDATE SET
      used = hr_leave_balances.used + EXCLUDED.used,
      updated_at = now();

  ELSIF NEW.status IN ('cancelled', 'rejected', 'withdrawn') AND OLD.status = 'approved' THEN
    v_delta := NEW.total_days;
    UPDATE hr_leave_balances
       SET used = GREATEST(0, used - v_delta),
           updated_at = now()
     WHERE employee_id         = NEW.employee_id
       AND leave_type_id       = NEW.leave_type_id
       AND hr_academic_year_id = NEW.hr_academic_year_id;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $function$;
