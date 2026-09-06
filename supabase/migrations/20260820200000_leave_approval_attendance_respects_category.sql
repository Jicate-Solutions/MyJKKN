-- HR Attendance — an hourly permission must not erase a worked day.
--
-- THE BUG
-- -------
-- 09/07/2026 showed LEAVE against punches of 09:24-17:48 — a full day worked.
-- Two approved "Permission (Hourly)" requests covered 09:05-09:35 that morning,
-- 30 minutes each, total_days 0.13.
--
-- fn_recompute_attendance_on_leave_approval fires whenever ANY leave
-- application reaches 'approved' and then does this:
--
--     UPDATE hr_attendance_records SET status_type_id = <LEAVE>
--      WHERE employee_id = NEW.employee_id
--        AND work_date BETWEEN NEW.start_date AND NEW.end_date
--
-- No request_category test. No duration_type test. LEAVE is the only status it
-- can write. So a 30-minute permission overwrote the whole day, and a half-day
-- leave would overwrite a half-worked day just as completely.
--
-- THE TRIGGER NEXT DOOR ALREADY KNEW BETTER
-- ------------------------------------------
-- hr_trig_update_leave_balance, on the same table, guards exactly this:
--
--     IF v_category IN ('compensatory_off', 'short_time_off') THEN
--       -- "Comp off is credit-backed; short time off is minute-backed.
--       --  Neither draws on a day entitlement."
--
-- The balance side knew a permission is not a day. The attendance side never
-- learned. Two triggers on one table, one of them carrying the rule.
--
-- THE FIX
-- -------
--   short_time_off, or duration_type 'hourly'  -> touch nothing. A permission
--       is minute-backed; the day keeps whatever the biometric engine decided.
--   first_half / second_half                   -> write HALF_DAY, not LEAVE.
--       The person worked the other half; erasing it as full LEAVE loses that.
--   everything else (full-day leave, comp off)  -> LEAVE, unchanged.
--
-- compensatory_off is deliberately NOT skipped here even though the balance
-- trigger skips it: booking comp off IS a day away from work, so LEAVE is the
-- right attendance status. It is skipped for BALANCE because it draws on a
-- credit rather than an entitlement. Different question, different answer.
--
-- The audit-log INSERT is kept in step with the UPDATE — it previously recorded
-- 'previous status -> LEAVE' for rows that are now becoming HALF_DAY.

CREATE OR REPLACE FUNCTION public.fn_recompute_attendance_on_leave_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_target_status_id UUID;
  v_target_code      TEXT;
  v_category         TEXT;
  v_event_id         UUID := gen_random_uuid();
BEGIN
  IF NOT (TG_OP = 'UPDATE'
          AND NEW.status = 'approved'
          AND COALESCE(OLD.status, '') <> 'approved') THEN
    RETURN NEW;
  END IF;

  SELECT request_category INTO v_category
  FROM hr_leave_types WHERE id = NEW.leave_type_id;

  -- A permission is measured in minutes, not days. It leaves the day's verdict
  -- exactly as the biometric engine computed it.
  IF v_category = 'short_time_off' OR NEW.duration_type = 'hourly' THEN
    RETURN NEW;
  END IF;

  v_target_code := CASE
    WHEN NEW.duration_type IN ('first_half', 'second_half') THEN 'HALF_DAY'
    ELSE 'LEAVE'
  END;

  SELECT id INTO v_target_status_id
  FROM hr_attendance_status_types
  WHERE code = v_target_code AND institution_id IS NULL
  LIMIT 1;

  IF v_target_status_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO hr_attendance_audit_log (
    attendance_record_id, employee_id, institution_id, actor_id, action,
    before_state, after_state, reason, created_at
  )
  SELECT
    r.id, r.employee_id, r.institution_id, NEW.final_approver_id, 'recompute',
    jsonb_build_object('status_type_id', r.status_type_id),
    jsonb_build_object('status_type_id', v_target_status_id,
                       'status_code', v_target_code,
                       'event_id', v_event_id,
                       'leave_application_id', NEW.id),
    format('Leave application approved; previous status -> %s', v_target_code),
    NOW()
  FROM hr_attendance_records r
  WHERE r.employee_id = NEW.employee_id
    AND r.work_date BETWEEN NEW.start_date AND NEW.end_date
    AND r.status_type_id <> v_target_status_id;

  UPDATE hr_attendance_records r
    SET status_type_id = v_target_status_id,
        recomputed_from_event_id = v_event_id,
        updated_at = NOW()
  WHERE r.employee_id = NEW.employee_id
    AND r.work_date BETWEEN NEW.start_date AND NEW.end_date
    AND r.status_type_id <> v_target_status_id;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_recompute_attendance_on_leave_approval() IS
  'On leave approval, stamps the covered days LEAVE (or HALF_DAY for a half-day request). Short time off and hourly requests are skipped entirely — a permission is minute-backed and does not change the day''s attendance verdict.';

-- ---------------------------------------------------------------------------
-- Repair the days already overwritten.
-- ---------------------------------------------------------------------------
-- One row today: 09/07/2026 for staff NOT148, punched 09:24-17:48 and stamped
-- LEAVE by a 30-minute permission. The correct verdict comes from evaluateDay,
-- which is TypeScript and cannot be re-run from SQL — so this only UNDOES the
-- bad stamp where the audit log recorded what the status was before. Rows with
-- no audit trail are left alone rather than guessed at; re-importing the month
-- recomputes them from the punches.
UPDATE public.hr_attendance_records r
   SET status_type_id = (l.before_state ->> 'status_type_id')::uuid,
       recomputed_from_event_id = NULL,
       updated_at = NOW()
  FROM (
    SELECT DISTINCT ON (a.attendance_record_id)
           a.attendance_record_id, a.before_state
      FROM public.hr_attendance_audit_log a
      JOIN public.hr_leave_applications la
        ON la.id = (a.after_state ->> 'leave_application_id')::uuid
      JOIN public.hr_leave_types t ON t.id = la.leave_type_id
     WHERE a.action = 'recompute'
       AND a.after_state ->> 'status_code' = 'LEAVE'
       AND (t.request_category = 'short_time_off' OR la.duration_type = 'hourly')
       AND a.before_state ->> 'status_type_id' IS NOT NULL
     ORDER BY a.attendance_record_id, a.created_at ASC
  ) l
 WHERE r.id = l.attendance_record_id
   AND r.status_type_id = (SELECT id FROM public.hr_attendance_status_types
                            WHERE code = 'LEAVE' AND institution_id IS NULL LIMIT 1);
