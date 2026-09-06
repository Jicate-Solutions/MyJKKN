-- ============================================================================
-- SELF-SERVICE REGULARIZATION IS WITHDRAWN; ADMINS CORRECT DAYS AT MONTH CLOSE
-- (2026-09-06)
--
-- Until now the attendance log offered every staff member a "Regularize" action
-- on their own days, because hr.attendance.regularize_self was granted to 76 of
-- the 104 roles — staff, faculty, driver, guest, parent. HR asked for that to
-- stop and for day corrections to happen in one place instead: the month-close
-- salary preview, where the person closing the month can see what a wrong day
-- does to somebody's pay before freezing it.
--
-- HIDING THE BUTTON WOULD NOT HAVE BEEN ENOUGH. /hr/attendance/regularize is its
-- own route with its own guard, and the permission would still have been held by
-- 76 roles — anyone with the URL keeps working exactly as before. The key is
-- revoked here and the route is tightened in the same change.
--
-- SET TO false, NOT DELETED. A key that is absent and a key that is denied read
-- the same to user_has_permission but not to a human reading the catalog, and an
-- explicit false is what makes this reversible in one statement. THE EXACT 76
-- ROLES ARE LISTED BELOW so re-granting is a copy-paste, not an archaeology
-- exercise.
--
-- IN-FLIGHT REQUESTS ARE UNTOUCHED. 8 pending regularizations across 4 staff
-- remain, and /hr/attendance/regularize/approvals still decides them. Only the
-- ability to raise NEW ones is withdrawn; nothing anybody is waiting on is lost.
--
-- NO EXPLICIT BEGIN/COMMIT — see the note in 20260905120000.
-- ============================================================================

-- custom_roles.permissions is 785 kB across 104 roles — up to 1,617 keys each —
-- and every UPDATE fires four triggers, including a format validator that walks
-- all those keys and a change log that copies the whole JSONB into an audit row.
-- Seventy-six of those in one statement exceeds the default statement timeout
-- (57014). Raised for this transaction only; SET LOCAL reverts on commit.
SET LOCAL statement_timeout = '180s';

DO $do$
DECLARE
  v_before integer;
  v_after  integer;
BEGIN
  SELECT count(*) INTO v_before FROM public.custom_roles
   WHERE (permissions -> 'hr.attendance.regularize_self') = 'true'::jsonb;

  -- The 76 holders as at 2026-09-06. To reverse this migration, run the same
  -- UPDATE with 'true'::jsonb against exactly this list:
  --   accountant_assistant, accounts, accreditation_officer, administrator,
  --   admission, admission_counselor, admission_staff, ai_assistant_pilot,
  --   ai_pulse_champion, anti_ragging_member, board, builder, cao, cbo,
  --   cdc_coordinator, cdc_head, ceo, chief_warden, client, coe, coe_office,
  --   cohort_member, coo, digital_coordinator, digital_transformation_officer,
  --   driver, event_coordinator, evidence_uploader, executive_admin_officer,
  --   expo_counselor, external_auditor_timeboxed, faculty, gate_security, guest,
  --   gym_trainer, health_counselor, health_screener, health_supervisor, hod,
  --   hostel_office, housekeeping_staff, hr_admin, hr_head, hr_manager,
  --   induction_coordinator, induction_lead, jicate_staff, lab_assistant,
  --   lead_auditor, learner_counselor, maintenance_vendor, managing_director,
  --   medical_superintendent, mess_caterer, nif_coordinator, office_assistant,
  --   outreach_coordinator, parent, payment_audit_admin, principal,
  --   production_learner, program_lead, registrar, school_faculty,
  --   school_principal, seo, sports_coordinator, staff, staff_counselor,
  --   store_admin, super_admin, system_admin, transport_boarding,
  --   transport_head, vice_principal, warden
  UPDATE public.custom_roles
     SET permissions = jsonb_set(permissions, '{hr.attendance.regularize_self}', 'false'::jsonb),
         updated_at  = now()
   WHERE (permissions -> 'hr.attendance.regularize_self') = 'true'::jsonb;

  SELECT count(*) INTO v_after FROM public.custom_roles
   WHERE (permissions -> 'hr.attendance.regularize_self') = 'true'::jsonb;

  IF v_after <> 0 THEN
    RAISE EXCEPTION 'Expected 0 roles holding hr.attendance.regularize_self, found %', v_after;
  END IF;
  RAISE NOTICE 'hr.attendance.regularize_self revoked from % role(s).', v_before;
END
$do$;

-- ---------------------------------------------------------------------------
-- Correcting one day, directly.
--
-- Gated on hr.attendance.period.manage — held by hr_head ALONE, which is
-- precisely "super admin and HR Head" once is_super_admin() is ORed in. The
-- same key that lets somebody close the month lets them fix a day inside it,
-- which is the point: the correction and the freeze are one person's decision.
--
-- NO APPROVAL STEP, BY DECISION. The only roles that can reach this are the
-- ones that would approve the request, so a request they immediately approve
-- themselves is ceremony rather than control. An hr_attendance_regularizations
-- row is still written — status 'approved', approver = the actor — so admin
-- corrections and staff-raised ones share ONE audit shape and the approvals
-- history stays complete.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_regularize_attendance_day(
  p_staff_id    uuid,
  p_date        date,
  p_status_code text,
  p_reason      text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rec      record;
  v_status   record;
  v_old_code text;
  v_locked   timestamptz;
BEGIN
  IF NOT (public.is_super_admin()
          OR public.user_has_permission('hr.attendance.period.manage')) THEN
    RAISE EXCEPTION 'Only a super administrator or HR Head can regularize an attendance day.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF coalesce(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'A reason is required — it is what makes this correction auditable.';
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
  -- fire: its message is about writes in general, and "the month is closed,
  -- reopen it first" is the instruction the operator actually needs.
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
  -- raise "unknown status" for every correction, so a per-institution override
  -- is accepted if one is ever added, and the global row otherwise.
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

  INSERT INTO public.hr_attendance_regularizations (
    employee_id, attendance_record_id, for_date, reason_text,
    proposed_status_type_id, status, approver_id, approved_at)
  VALUES (
    p_staff_id, v_rec.id, p_date, btrim(p_reason),
    v_status.id, 'approved', auth.uid(), now());

  RETURN jsonb_build_object(
    'ok', true, 'date', p_date,
    'from', v_old_code, 'to', v_status.code);
END;
$function$;

COMMENT ON FUNCTION public.fn_hr_regularize_attendance_day(uuid, date, text, text) IS
  'Set one staff member''s attendance status for one day, directly. Super-admin or HR Head only, reason mandatory, refused on a closed month. Writes an approved hr_attendance_regularizations row so the audit trail matches staff-raised corrections.';

REVOKE ALL ON FUNCTION public.fn_hr_regularize_attendance_day(uuid, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_hr_regularize_attendance_day(uuid, date, text, text)
  TO authenticated, service_role;
