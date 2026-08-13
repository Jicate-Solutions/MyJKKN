-- =====================================================================
-- The leave-balance ledger write must not depend on the approver's rights
-- =====================================================================
-- Third layer found while verifying the designated-approver model by actually
-- approving something, rather than by reading policies.
--
-- The application UPDATE passed hla_update, and then the approval failed with:
--   42501: new row violates row-level security policy for table "hr_leave_balances"
--   CONTEXT: PL/pgSQL function hr_trig_update_leave_balance() line 22
--
-- hr_trig_update_leave_balance ran as the INVOKER, so approving leave also
-- required satisfying hlb_write on hr_leave_balances -- that is,
-- hr.leave.policies.write, the key that lets a person rewrite entitlements
-- directly. A designated Principal has no such key, and granting it to fix
-- this would be badly disproportionate: approving one person's leave is not
-- the same authority as editing everyone's balances.
--
-- SECURITY DEFINER is the right instrument here because the trigger accepts
-- no user-supplied target. Every value it writes is derived from NEW on a row
-- that hla_update has already authorized, and the ON CONFLICT key is fixed.
-- It maintains a system ledger; it does not author user data.
--
-- The body below is byte-identical to 20260811180300 (entitled = NULL rather
-- than 0) apart from the SECURITY DEFINER clause. CREATE OR REPLACE, never
-- DROP + CREATE: dropping discards EXECUTE grants and reverts them to PUBLIC.

CREATE OR REPLACE FUNCTION public.hr_trig_update_leave_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
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
