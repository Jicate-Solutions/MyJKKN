-- ============================================================================
-- THE REGULARIZATION REASON COMES FROM THE CATALOG, NOT A TEXT BOX (2026-09-06)
--
-- 20260906200000 took a free-text reason. hr_attendance_regularizations already
-- carries reason_code_id pointing at hr_regularization_reasons — four active
-- entries: leave_clash, device_offline, forgot, network_failure — and the
-- staff-raised flow has always used it. Taking free text meant admin
-- corrections were the only rows in that table with a NULL reason_code_id,
-- which makes "how often is the biometric device offline" unanswerable the
-- moment corrections move to admins.
--
-- The reason is now a catalog id. reason_text is still written, from the code's
-- label, so anything reading the text column keeps working and an issued row
-- stays readable if the catalog label is later edited.
--
-- DROP + CREATE because the parameter type changes. That takes the ACL with it,
-- so the REVOKE/GRANT pair below is load-bearing: a new function is
-- EXECUTE-able by PUBLIC, which includes anon.
--
-- NO EXPLICIT BEGIN/COMMIT — see the note in 20260905120000.
-- ============================================================================

DROP FUNCTION IF EXISTS public.fn_hr_regularize_attendance_day(uuid, date, text, text);

CREATE FUNCTION public.fn_hr_regularize_attendance_day(
  p_staff_id       uuid,
  p_date           date,
  p_status_code    text,
  p_reason_code_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rec      record;
  v_status   record;
  v_reason   record;
  v_old_code text;
  v_locked   timestamptz;
BEGIN
  IF NOT (public.is_super_admin()
          OR public.user_has_permission('hr.attendance.period.manage')) THEN
    RAISE EXCEPTION 'Only a super administrator or HR Head can regularize an attendance day.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT r.id, r.label INTO v_reason
  FROM public.hr_regularization_reasons r
  WHERE r.id = p_reason_code_id AND r.is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pick a reason from the list — that one is unknown or no longer active.';
  END IF;

  SELECT r.id, r.institution_id, r.status_type_id
    INTO v_rec
  FROM public.hr_attendance_records r
  WHERE r.employee_id = p_staff_id AND r.work_date = p_date;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No attendance record exists for that person on %.', p_date
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.fn_hr_institution_included(v_rec.institution_id) THEN
    RAISE EXCEPTION 'This institution is excluded from the HR module.'
      USING ERRCODE = '23514';
  END IF;

  -- Named explicitly rather than letting hr_trig_block_writes_in_locked_period
  -- fire: "the month is closed, reopen it first" is the instruction the
  -- operator actually needs.
  SELECT p.locked_at INTO v_locked
  FROM public.hr_attendance_periods p
  WHERE p.institution_id = v_rec.institution_id
    AND p.period_year = EXTRACT(YEAR FROM p_date)::int
    AND p.period_month = EXTRACT(MONTH FROM p_date)::int;

  IF v_locked IS NOT NULL THEN
    RAISE EXCEPTION 'That month is already closed. Reopen it before correcting a day.'
      USING ERRCODE = '23514';
  END IF;

  -- The status catalog is GLOBAL: all nine active rows carry institution_id
  -- NULL. Matching on the record's institution alone would find nothing and
  -- raise "unknown status" for every correction.
  SELECT s.id, s.code INTO v_status
  FROM public.hr_attendance_status_types s
  WHERE s.code = p_status_code
    AND s.is_active
    AND (s.institution_id IS NULL OR s.institution_id = v_rec.institution_id)
  ORDER BY s.institution_id NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown or inactive attendance status % for this institution.', p_status_code;
  END IF;

  SELECT s.code INTO v_old_code
  FROM public.hr_attendance_status_types s WHERE s.id = v_rec.status_type_id;

  UPDATE public.hr_attendance_records
     SET status_type_id = v_status.id,
         updated_at     = now()
   WHERE id = v_rec.id;

  -- reason_code_id AND the label. The id is what a report groups by; the text
  -- keeps the row readable if somebody later edits the catalog wording.
  INSERT INTO public.hr_attendance_regularizations (
    employee_id, attendance_record_id, for_date,
    reason_code_id, reason_text,
    proposed_status_type_id, status, approver_id, approved_at)
  VALUES (
    p_staff_id, v_rec.id, p_date,
    v_reason.id, v_reason.label,
    v_status.id, 'approved', auth.uid(), now());

  RETURN jsonb_build_object(
    'ok', true, 'date', p_date,
    'from', v_old_code, 'to', v_status.code, 'reason', v_reason.label);
END;
$function$;

COMMENT ON FUNCTION public.fn_hr_regularize_attendance_day(uuid, date, text, uuid) IS
  'Set one staff member''s attendance status for one day, directly. Super-admin or HR Head only, reason chosen from hr_regularization_reasons, refused on a closed month. Writes an approved hr_attendance_regularizations row so the audit trail matches staff-raised corrections.';

REVOKE ALL ON FUNCTION public.fn_hr_regularize_attendance_day(uuid, date, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_hr_regularize_attendance_day(uuid, date, text, uuid)
  TO authenticated, service_role;
