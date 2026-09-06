-- Set a staff member's salary, superseding whatever was in force.
--
-- WHY AN RPC AND NOT TWO POSTGREST CALLS
-- --------------------------------------
-- hr_staff_salaries_one_current is a partial unique index on (staff_id) WHERE
-- superseded_by IS NULL, so a new row cannot be inserted while the old one is
-- still current -- that is a 23505. And the old row cannot be pointed at its
-- replacement before the replacement has an id. Two statements over PostgREST
-- cannot satisfy that ordering, and would leave a window with either two
-- current rows or none.
--
-- The id is minted FIRST, the incumbent is pointed at it, then the new row is
-- inserted: one transaction, index satisfied at every statement boundary, no
-- window. That order is what forces superseded_by to be a DEFERRABLE foreign
-- key -- see 20260821211000_hr_staff_salaries_superseded_by_deferrable.sql.
--
-- SECURITY INVOKER ON PURPOSE (no SECURITY DEFINER). The UPDATE and INSERT go
-- through hr_staff_salaries_write, so hr.payroll.salary.manage is enforced by
-- RLS rather than re-checked here, and a caller without it writes nothing.
--
-- THE ADVISORY LOCK is per staff member, not global: two concurrent imports
-- touching different people do not serialise, but two touching the SAME person
-- cannot both read "no current row" and both insert.

CREATE OR REPLACE FUNCTION public.fn_hr_set_staff_salary(
  p_staff_id             uuid,
  p_hr_organization_id   uuid,
  p_monthly_gross        numeric,
  p_effective_from       date,
  p_salary_structure     text    DEFAULT 'Monthly',
  p_overtime_level       text    DEFAULT 'No overtime',
  p_overtime_amount      numeric DEFAULT 0,
  p_eligible_for_pf      boolean DEFAULT false,
  p_exempt_edli          boolean DEFAULT false,
  p_eligible_for_insurance boolean DEFAULT false,
  p_eligible_for_gratuity  boolean DEFAULT false,
  p_eligible_for_etf     boolean DEFAULT false,
  p_notes                text    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_new_id  uuid := gen_random_uuid();
  v_current record;
BEGIN
  IF p_staff_id IS NULL OR p_hr_organization_id IS NULL THEN
    RAISE EXCEPTION 'Staff and payroll organisation are both required'
      USING ERRCODE = '22023';
  END IF;
  IF p_monthly_gross IS NULL OR p_monthly_gross <= 0 THEN
    RAISE EXCEPTION 'Monthly salary must be greater than zero' USING ERRCODE = '22023';
  END IF;
  IF p_effective_from IS NULL THEN
    RAISE EXCEPTION 'Effective date is required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_staff_id::text || ':salary', 0));

  SELECT id, monthly_gross, effective_from INTO v_current
    FROM public.hr_staff_salaries
   WHERE staff_id = p_staff_id AND superseded_by IS NULL;

  -- Re-writing the identical figure would bury the real history under
  -- duplicates, so the incumbent is returned untouched instead.
  IF FOUND
     AND v_current.monthly_gross = p_monthly_gross
     AND v_current.effective_from = p_effective_from THEN
    RETURN v_current.id;
  END IF;

  IF FOUND THEN
    UPDATE public.hr_staff_salaries
       SET superseded_by = v_new_id, updated_at = now(), updated_by = auth.uid()
     WHERE id = v_current.id;
  END IF;

  INSERT INTO public.hr_staff_salaries (
    id, staff_id, hr_organization_id, salary_structure, monthly_gross,
    overtime_level, overtime_amount, eligible_for_pf, exempt_edli,
    eligible_for_insurance, eligible_for_gratuity, eligible_for_etf,
    effective_from, notes, created_by, updated_by
  ) VALUES (
    v_new_id, p_staff_id, p_hr_organization_id, p_salary_structure, p_monthly_gross,
    p_overtime_level, p_overtime_amount, p_eligible_for_pf, p_exempt_edli,
    p_eligible_for_insurance, p_eligible_for_gratuity, p_eligible_for_etf,
    p_effective_from, p_notes, auth.uid(), auth.uid()
  );

  RETURN v_new_id;
END;
$function$;

-- CREATE OR REPLACE keeps existing grants, but a later DROP FUNCTION would
-- discard them and revert EXECUTE to PUBLIC. Restated so a rebuild from these
-- files lands in the same place.
REVOKE ALL ON FUNCTION public.fn_hr_set_staff_salary(uuid, uuid, numeric, date, text, text, numeric, boolean, boolean, boolean, boolean, boolean, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_hr_set_staff_salary(uuid, uuid, numeric, date, text, text, numeric, boolean, boolean, boolean, boolean, boolean, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_hr_set_staff_salary(uuid, uuid, numeric, date, text, text, numeric, boolean, boolean, boolean, boolean, boolean, text) IS
  'Supersede-and-insert a staff salary in one transaction. SECURITY INVOKER: hr_staff_salaries_write enforces hr.payroll.salary.manage.';
