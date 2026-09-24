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
-- [id]/approve/route.ts, `err.message`), so it is what an approver sees whenever
-- the UI's disabled button is stale -- e.g. a biometric month purged after the
-- queue loaded -- and what every non-UI caller sees.
--
-- MESSAGE ONLY. The body below is 20260829120000's definition verbatim (no later
-- migration on main redefines this function) with the RAISE text changed. The
-- predicate, the transition check, ERRCODE and both format arguments are
-- unchanged, so the gate admits and refuses exactly the same rows as before.
-- CREATE OR REPLACE keeps the existing trigger binding and privileges.

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
