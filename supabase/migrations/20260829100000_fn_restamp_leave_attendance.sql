-- Re-apply approved leave / comp-off stamps over a date range.
--
-- THE PROBLEM THIS EXISTS FOR
--
-- The attendance report reads hr_attendance_records and nothing else, and an
-- approved leave reaches it only through a stamp. That stamp dies two ways:
--
--   1. APPROVE BEFORE IMPORT. fn_recompute_attendance_on_leave_approval runs a
--      bare UPDATE ... WHERE employee_id = ... AND work_date BETWEEN ... . With
--      no row for the day it matches ZERO rows and does nothing, silently. The
--      later import inserts the row carrying the raw punch verdict and nothing
--      ever re-applies the stamp -- the approval is lost from the report
--      permanently.
--
--   2. RE-IMPORT AFTER APPROVAL. app/api/hr/attendance/import/route.ts upserts
--      on (employee_id, work_date) writing status_type_id straight from the
--      biometric verdict, which knows nothing about approved leave. Re-importing
--      July 2026 today would erase 10 LEAVE + 5 HALF_DAY days.
--
-- Calling this after an import closes both: every approved leave day in the
-- imported range is re-stamped, whether it was approved before the import or
-- after. Short Time Off needs none of this -- evaluate-day.ts already reads
-- approved permissions during the import and recomputeForShortTimeOff already
-- runs on approve/reject/withdraw/cancel, so STO is correct in both orders.
--
-- IDEMPOTENT: only rows whose status actually differs are touched, so a second
-- run over the same range reports 0 and writes no audit noise.
--
-- The category rules below are copied verbatim from
-- fn_recompute_attendance_on_leave_approval, which is their current authority.
-- Two functions on one table holding the same rule is exactly how a 30-minute
-- permission came to erase a fully worked day (fixed 2026-08-20). Once this is
-- in place, fn_recompute_attendance_on_leave_approval should be refactored to
-- call THIS function for its own range so the rule lives in one body.

CREATE OR REPLACE FUNCTION public.fn_restamp_leave_attendance(
  p_institution_id uuid,
  p_from           date,
  p_to             date
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_leave_id uuid;
  v_half_id  uuid;
  v_event_id uuid := gen_random_uuid();
  v_actor    uuid := auth.uid();
  v_changed  integer := 0;
BEGIN
  -- auth.uid() IS NULL means the service-role client. EXECUTE is revoked from
  -- anon below, so NULL here cannot be an unauthenticated caller.
  --
  -- The signed-in branch mirrors app/api/hr/attendance/import/route.ts EXACTLY
  -- (is_admin OR hr.attendance.override). Anyone allowed to run an import is
  -- already allowed to rewrite every status_type_id in the range, so a narrower
  -- gate here would not protect anything -- it would just fail the re-stamp for
  -- an is_admin importer who lacks the key, silently reintroducing the very bug
  -- this function exists to fix.
  IF v_actor IS NOT NULL
     AND NOT public.is_super_admin()
     AND NOT public.is_admin()
     AND NOT public.user_has_permission('hr.attendance.override') THEN
    RAISE EXCEPTION 'Insufficient permission: hr.attendance.override required';
  END IF;

  IF p_institution_id IS NULL OR p_from IS NULL OR p_to IS NULL THEN
    RETURN 0;
  END IF;

  SELECT id INTO v_leave_id
  FROM public.hr_attendance_status_types
  WHERE code = 'LEAVE' AND institution_id IS NULL LIMIT 1;

  SELECT id INTO v_half_id
  FROM public.hr_attendance_status_types
  WHERE code = 'HALF_DAY' AND institution_id IS NULL LIMIT 1;

  -- No status vocabulary, nothing to say. Same bail-out as the trigger.
  IF v_leave_id IS NULL OR v_half_id IS NULL THEN
    RETURN 0;
  END IF;

  WITH tgt AS (
    -- DISTINCT ON collapses the theoretical case of two approved applications
    -- covering one day. trg_hla_leave_overlap should prevent it; if it ever
    -- happens the ORDER BY makes the choice deterministic and picks the FULL
    -- day, because a full-day absence is the stronger claim about the day.
    SELECT DISTINCT ON (r.id)
           r.id                AS record_id,
           r.employee_id       AS employee_id,
           r.institution_id    AS institution_id,
           r.status_type_id    AS old_status,
           CASE WHEN a.duration_type IN ('first_half', 'second_half')
                THEN v_half_id ELSE v_leave_id END AS new_status
    FROM public.hr_attendance_records r
    JOIN public.hr_leave_applications a
      ON a.employee_id = r.employee_id
     AND r.work_date BETWEEN a.start_date AND a.end_date
     AND a.status = 'approved'
    JOIN public.hr_leave_types t ON t.id = a.leave_type_id
    WHERE r.institution_id = p_institution_id
      AND r.work_date BETWEEN p_from AND p_to
      -- short_time_off is measured in minutes and never owns a day's verdict.
      -- compensatory_off IS included: booking comp off is a day away, so LEAVE
      -- is right there even though the BALANCE trigger skips the category.
      AND t.request_category IN ('leave', 'compensatory_off')
      AND a.duration_type <> 'hourly'
    ORDER BY r.id,
             CASE WHEN a.duration_type IN ('first_half', 'second_half') THEN 1 ELSE 0 END,
             a.final_decided_at DESC NULLS LAST
  ),
  upd AS (
    UPDATE public.hr_attendance_records r
       SET status_type_id           = tgt.new_status,
           recomputed_from_event_id = v_event_id,
           updated_at               = now()
      FROM tgt
     WHERE r.id = tgt.record_id
       AND r.status_type_id IS DISTINCT FROM tgt.new_status
    RETURNING r.id, r.employee_id, r.institution_id,
              tgt.old_status, tgt.new_status
  ),
  aud AS (
    -- A data-modifying CTE always runs to completion even though the outer
    -- SELECT does not read it, so the audit rows are written regardless.
    INSERT INTO public.hr_attendance_audit_log (
      attendance_record_id, employee_id, institution_id, actor_id, action,
      before_state, after_state, reason, created_at
    )
    SELECT u.id, u.employee_id, u.institution_id, v_actor, 'recompute',
           jsonb_build_object('status_type_id', u.old_status),
           jsonb_build_object('status_type_id', u.new_status,
                              'event_id', v_event_id),
           'Approved leave re-stamped over biometric verdict',
           now()
    FROM upd u
    RETURNING 1
  )
  SELECT count(*) INTO v_changed FROM upd;

  RETURN v_changed;
END $function$;

COMMENT ON FUNCTION public.fn_restamp_leave_attendance(uuid, date, date) IS
  'Re-applies LEAVE/HALF_DAY status to attendance rows covered by an approved leave or comp-off application. Idempotent. Called after a biometric import so upload order stops mattering.';

-- REVOKE from anon, not PUBLIC-only: the function trusts auth.uid() IS NULL to
-- mean service-role, and that is only safe if anon can never reach it.
REVOKE ALL ON FUNCTION public.fn_restamp_leave_attendance(uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_restamp_leave_attendance(uuid, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_restamp_leave_attendance(uuid, date, date)
  TO authenticated, service_role;
