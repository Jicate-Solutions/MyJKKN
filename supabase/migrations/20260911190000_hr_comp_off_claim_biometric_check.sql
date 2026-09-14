-- An INSIDE-CAMPUS compensatory off claim needs a punch on the worked day
-- before it can be approved.
--
-- HR decision 2026-09-11. A claim now says where the day was worked
-- (20260911160000). For inside campus the attendance device is the evidence:
-- the approver must see whether the person punched in that day, and cannot
-- approve without it. Outside campus relies on the proof document alone.
--
-- One definition, fn_hr_comp_off_biometric_check, feeds both the approver's
-- screen (hr_comp_off_claims_biometric) and the wall (trg_hcoc_require_biometric),
-- so what the screen promises is what the database accepts.
--
--   status        when                                               approve
--   punched       inside; the day's attendance row has in/out times   yes
--   no_punch      inside; attendance for that day is uploaded, none   NO
--                 for this person (or a row with no times)
--   not_uploaded  inside; nothing uploaded for the institution yet    NO
--   no_device     inside; the person has no device code              yes (HR: verify the proof)
--                 (staff.biometric_id blank -- all of Matric HSS and
--                 Nattraja CBSE, most of Main Office)
--   not_required  outside campus                                      yes
--   not_recorded  claim filed before the location field existed      yes (HR: no check)
--
-- hr_attendance_records holds ONE row per person per day (unique employee_id,
-- work_date). The biometric import writes it even for a Sunday with no punch; an
-- approved regularization rewrites it with source='regularization' and times --
-- an HR-approved correction, so it counts as present and is reported with its
-- source rather than silently passed off as a device punch.
--
-- The check reads attendance, which RLS hides from approvers holding only
-- hr.leave.approve, so it runs SECURITY DEFINER and is internal. The client RPC
-- authorises each claim the way hcoc_select does.

CREATE OR REPLACE FUNCTION public.fn_hr_comp_off_biometric_check(
  p_employee_id   uuid,
  p_worked_date   date,
  p_work_location text
)
RETURNS TABLE(status text, in_at timestamptz, out_at timestamptz, source text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_device  text;
  v_inst    uuid;
  v_in      timestamptz;
  v_out     timestamptz;
  v_source  text;
  v_has_row boolean;
BEGIN
  IF p_work_location IS NULL THEN
    RETURN QUERY SELECT 'not_recorded'::text, NULL::timestamptz, NULL::timestamptz, NULL::text;
    RETURN;
  END IF;

  IF p_work_location <> 'inside_campus' THEN
    RETURN QUERY SELECT 'not_required'::text, NULL::timestamptz, NULL::timestamptz, NULL::text;
    RETURN;
  END IF;

  SELECT NULLIF(btrim(s.biometric_id), ''), s.institution_id INTO v_device, v_inst
  FROM public.staff s WHERE s.id = p_employee_id;

  -- Not enrolled on any device: there is no punch to look for. (A planned
  -- staff.attendance_mode column never reached the live database; the device
  -- code is the signal that exists.)
  IF v_device IS NULL THEN
    RETURN QUERY SELECT 'no_device'::text, NULL::timestamptz, NULL::timestamptz, NULL::text;
    RETURN;
  END IF;

  SELECT r.in_at, r.out_at, r.source INTO v_in, v_out, v_source
  FROM public.hr_attendance_records r
  WHERE r.employee_id = p_employee_id AND r.work_date = p_worked_date;
  v_has_row := FOUND;

  IF v_has_row AND (v_in IS NOT NULL OR v_out IS NOT NULL) THEN
    RETURN QUERY SELECT 'punched'::text, v_in, v_out, v_source;
    RETURN;
  END IF;

  -- A row with no times, or the institution's upload for that day exists and
  -- simply has nothing for this person: uploaded, and absent.
  IF v_has_row OR EXISTS (
    SELECT 1 FROM public.hr_attendance_records r
    WHERE r.institution_id = v_inst
      AND r.work_date = p_worked_date
      AND r.source = 'biometric'
  ) THEN
    RETURN QUERY SELECT 'no_punch'::text, NULL::timestamptz, NULL::timestamptz, v_source;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'not_uploaded'::text, NULL::timestamptz, NULL::timestamptz, NULL::text;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_hr_comp_off_biometric_check(uuid, date, text) FROM PUBLIC, anon, authenticated;

-- What the approver's screen reads: the check for each claim the caller may see.
-- The visibility test is hcoc_select's, so nobody learns another person's
-- attendance through a claim they could not open.
CREATE OR REPLACE FUNCTION public.hr_comp_off_claims_biometric(p_claim_ids uuid[])
RETURNS TABLE(claim_id uuid, status text, in_at timestamptz, out_at timestamptz, source text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_super    boolean := COALESCE(public.is_super_admin(), false);
  v_approver boolean := COALESCE(public.user_has_permission('hr.leave.approve'), false);
  v_orgs     uuid[]  := COALESCE(public.fn_my_hr_organization_ids(), ARRAY[]::uuid[]);
  v_mine     uuid[]  := COALESCE(public.fn_my_staff_ids(), ARRAY[]::uuid[]);
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT c.id, chk.status, chk.in_at, chk.out_at, chk.source
  FROM public.hr_comp_off_credits c
  CROSS JOIN LATERAL public.fn_hr_comp_off_biometric_check(
    c.employee_id, c.worked_date, c.work_location) chk
  WHERE c.id = ANY (COALESCE(p_claim_ids, ARRAY[]::uuid[]))
    AND (
      v_super
      OR c.employee_id = ANY (v_mine)
      OR (v_approver AND c.hr_organization_id = ANY (v_orgs))
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.hr_comp_off_claims_biometric(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_comp_off_claims_biometric(uuid[]) TO authenticated, service_role;

-- The wall. SECURITY DEFINER because the check it calls is not executable by
-- the approver (authenticated) -- the trigger runs as its owner to reach it.
CREATE OR REPLACE FUNCTION public.hr_trig_comp_off_require_biometric()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
BEGIN
  IF NOT (OLD.status = 'pending' AND NEW.status = 'approved') THEN
    RETURN NEW;
  END IF;

  SELECT chk.status INTO v_status
  FROM public.fn_hr_comp_off_biometric_check(NEW.employee_id, NEW.worked_date, NEW.work_location) chk;

  IF v_status = 'no_punch' THEN
    RAISE EXCEPTION
      'No biometric punch on % — this inside-campus claim is not eligible for compensatory off. Reject it instead.',
      to_char(NEW.worked_date, 'DD/MM/YYYY')
      USING ERRCODE = '23514';
  ELSIF v_status = 'not_uploaded' THEN
    RAISE EXCEPTION
      'Biometric attendance for % has not been uploaded yet, so the punch cannot be checked. Import it from HR > Attendance > Import, then approve.',
      to_char(NEW.worked_date, 'DD/MM/YYYY')
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.hr_trig_comp_off_require_biometric() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_hcoc_require_biometric ON public.hr_comp_off_credits;
CREATE TRIGGER trg_hcoc_require_biometric
  BEFORE UPDATE OF status ON public.hr_comp_off_credits
  FOR EACH ROW EXECUTE FUNCTION public.hr_trig_comp_off_require_biometric();
