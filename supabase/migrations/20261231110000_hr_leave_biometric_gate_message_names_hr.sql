-- The biometric approval gate's refusal names HR, and the real place HR uploads.
--
-- BUG-006101 / BUG-006140 (PR #3993). The message raised by
-- hr_trig_block_leave_approval_without_biometric told the APPROVER to "Import it
-- from HR > Attendance > Import, then approve". Two things were wrong with it:
--   * an approver (a Principal, an HOD) cannot import biometric -- only HR can,
--     so the imperative read as "you are not allowed to approve";
--   * there is no Import item under Attendance. The upload lives on the HR Admin
--     Dashboard as the "Import Biometric Punches" card (app/(routes)/hr/admin/
--     page.tsx; scripts/check-nav-reachability.ts records it as a card-only
--     route), reached from the sidebar via HR Setup > Admin Dashboard.
--
-- The approve route returns this text verbatim (app/api/hr/leave/applications/
-- [id]/approve/route.ts, through errorMessage() -- LeaveService throws the
-- PostgREST error as a plain object, which `instanceof Error` used to turn into
-- "Unknown error"), so it is what an approver sees whenever the UI's disabled
-- button is stale -- e.g. a biometric month purged after the queue loaded -- and
-- what every non-UI caller sees.
--
-- The comp-off claim wall (hr_trig_comp_off_require_biometric, 20260911190000)
-- carried the same wrong instruction for its 'not_uploaded' case, and its claims
-- queue renders on the same approvals screen, so it is re-stated below too.
--
-- MESSAGE ONLY, for both functions. Each body is its last definition verbatim
-- (20260829120000 and 20260911190000; no later migration on main redefines
-- either) with the RAISE text changed. On 24 Sep 2026 the live comp-off body
-- was byte-identical to 20260911190000's (md5 of pg_proc.prosrc), and the live
-- leave body was 20260829120000's code without its two-line comment. Predicates,
-- transition checks, ERRCODEs and format arguments are unchanged, so each gate
-- admits and refuses exactly the same rows as before. CREATE OR REPLACE keeps
-- the existing trigger bindings and privileges (including 20260911190000's
-- REVOKE on the comp-off function).

CREATE OR REPLACE FUNCTION public.hr_trig_block_leave_approval_without_biometric()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_missing date;
BEGIN
  -- Only the transition INTO approved. Editing an already-approved row, or any
  -- other status change, is none of this trigger's business.
  IF NOT (NEW.status = 'approved' AND COALESCE(OLD.status, '') <> 'approved') THEN
    RETURN NEW;
  END IF;

  v_missing := public.fn_hr_leave_biometric_gap(
    NEW.employee_id, NEW.leave_type_id, NEW.start_date, NEW.end_date);

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      'Biometric attendance for % has not been uploaded yet, so approving this would not reach the attendance report. HR uploads it from HR Setup › Admin Dashboard › Import Biometric Punches; you can approve once it is in. First missing day: %.',
      to_char(v_missing, 'Mon YYYY'),
      to_char(v_missing, 'DD Mon YYYY')
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END $function$;

-- Comp-off claim wall: 20260911190000's body with only the 'not_uploaded' RAISE
-- text changed. The 'no_punch' refusal is correct as it stands (the approver
-- should reject) and is untouched.
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
      'Biometric attendance for % has not been uploaded yet, so the punch cannot be checked. HR uploads it from HR Setup › Admin Dashboard › Import Biometric Punches; you can approve once it is in.',
      to_char(NEW.worked_date, 'DD/MM/YYYY')
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;
