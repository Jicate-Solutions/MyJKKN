-- Hostel leave / OD  →  gate pass, attendance lock, clinical-duty rule.
--
-- WHY: leave_onduty_applications (fn_lo_*) and hostel_gate_passes
-- (gate_record_movement) were unconnected. A hostel learner with an approved
-- leave still needed a hand-raised gate pass, the gate had no 12-hour rule, and
-- hostel_attendance ignored leave entirely (on_leave / medical were manual).
--
-- DESIGN: the leave application stays the single source of truth. Row triggers on
-- leave_onduty_applications create the pass when the application is born and
-- move it when the application's status moves, so EVERY path (apply form,
-- sponsor step, bulk, super-admin approval, cancel) is covered without
-- redefining fn_lo_decide / fn_lo_seed_approvals.
--
-- Identity trap: hostel_gate_passes / hostel_attendance / hostel_health_cases key
-- on profiles.id; leave_onduty_applications keys on learners_profiles.id. They are
-- joined through profiles.learner_id.

-- ── 1. Columns ───────────────────────────────────────────────────────────────
ALTER TABLE public.learner_leave_types
  ADD COLUMN IF NOT EXISTS issues_gate_pass boolean NOT NULL DEFAULT false;

ALTER TABLE public.leave_onduty_applications
  ADD COLUMN IF NOT EXISTS exit_time   time,
  ADD COLUMN IF NOT EXISTS return_time time;

ALTER TABLE public.hostel_gate_passes
  ADD COLUMN IF NOT EXISTS leave_onduty_application_id uuid
    REFERENCES public.leave_onduty_applications(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS valid_from  timestamptz,
  ADD COLUMN IF NOT EXISTS valid_until timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS ux_hostel_gate_passes_lo_application
  ON public.hostel_gate_passes (leave_onduty_application_id)
  WHERE leave_onduty_application_id IS NOT NULL;

-- Off-campus types. Events / meetings / culturals / clubs stay on campus and get
-- no pass. Editable per type in /learners/leave-onduty/settings.
UPDATE public.learner_leave_types
   SET issues_gate_pass = true
 WHERE code IN (
   'home_visit','weekend','vacation','emergency','medical','academic','festival',
   'family_function','bereavement','convocation','general',
   'industrial_visit','industrial_visits','internship','sports_cultural','training',
   'clinical_rotation'
 );

-- A pass is only ever issued by the chief warden's final step, so every
-- pass-issuing type must have a flow that ends in it. Fail loudly, never silently.
DO $$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(t.code, ', ') INTO v_bad
  FROM public.learner_leave_types t
  WHERE t.issues_gate_pass AND t.residency::text IN ('hostel','both')
    AND NOT EXISTS (
      SELECT 1 FROM public.learner_leave_flows f
      JOIN public.learner_leave_flow_steps s ON s.flow_id = f.id
      JOIN public.custom_roles r ON r.id = s.role_id
      WHERE f.leave_type_id = t.id AND r.role_key = 'chief_warden');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Pass-issuing leave types without a chief_warden step: %', v_bad;
  END IF;
END $$;

-- ── 2. Helpers ───────────────────────────────────────────────────────────────
-- Same predicate fn_lo_seed_approvals uses for "is a hostel learner".
CREATE OR REPLACE FUNCTION public.fn_lo_is_hostel_learner(p_learners_profile_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.learners_profiles lp
                 JOIN public.accommodation_types at ON at.id = lp.accommodation_type_id
                 WHERE lp.id = p_learners_profile_id AND lower(at.name) = 'hostel')
      OR EXISTS (SELECT 1 FROM public.hostel_allocations ha
                 JOIN public.profiles p ON p.id = ha.learner_id
                 WHERE p.learner_id = p_learners_profile_id AND ha.status = 'active');
$$;

-- Learners (profiles.id) covered by an approved pass-issuing leave on a date.
-- Internal: no permission check, so row triggers can use it for any caller.
CREATE OR REPLACE FUNCTION public._fn_cl_leave_cover(p_profile_ids uuid[], p_date date)
RETURNS TABLE (learner_id uuid, application_id uuid, leave_type_code text, is_clinical boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT DISTINCT ON (p.id) p.id, a.id, t.code::text, (t.code = 'clinical_rotation')
  FROM public.profiles p
  JOIN public.leave_onduty_applications a ON a.learner_id = p.learner_id
  JOIN public.learner_leave_types t ON t.id = a.leave_type_id
  WHERE p.id = ANY (p_profile_ids)
    AND a.status::text = 'approved'
    AND t.issues_gate_pass
    AND p_date BETWEEN a.start_date AND a.end_date
  ORDER BY p.id, (t.code = 'clinical_rotation') DESC, a.start_date;
$$;

-- Caller-facing wrapper for the attendance screens. The rows come from a table
-- (leave_onduty_applications) a warden's own RLS cannot read, so it is DEFINER and
-- gated here, and it returns only the minimum the sheet needs.
CREATE OR REPLACE FUNCTION public.fn_cl_leave_cover(p_profile_ids uuid[], p_date date)
RETURNS TABLE (learner_id uuid, application_id uuid, leave_type_code text, is_clinical boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF NOT ((SELECT public.is_super_admin())
          OR (SELECT public.user_has_permission('campus_living.attendance.view'))
          OR (SELECT public.user_has_permission('campus_living.attendance.mark'))
          OR (SELECT public.user_has_permission('campus_living.health.view'))) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public._fn_cl_leave_cover(p_profile_ids, p_date);
END $$;

-- ── 3. Create / move the pass from the application ───────────────────────────
CREATE OR REPLACE FUNCTION public.fn_lo_sync_gate_pass(p_application_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_app      public.leave_onduty_applications%ROWTYPE;
  v_type     public.learner_leave_types%ROWTYPE;
  v_pass     public.hostel_gate_passes%ROWTYPE;
  v_profile  uuid;
  v_inst     uuid;
  v_block    uuid;
  v_now      timestamptz := now();
  v_start    timestamptz;
  v_return   timestamptz;
  v_from     timestamptz;
  v_until    timestamptz;
  v_actor    uuid;
  v_comment  text;
BEGIN
  SELECT * INTO v_app FROM public.leave_onduty_applications WHERE id = p_application_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO v_type FROM public.learner_leave_types WHERE id = v_app.leave_type_id;
  IF NOT FOUND OR NOT v_type.issues_gate_pass THEN RETURN NULL; END IF;

  SELECT * INTO v_pass FROM public.hostel_gate_passes
   WHERE leave_onduty_application_id = p_application_id FOR UPDATE;

  -- Create: only for hostel learners, only while the application is live.
  IF NOT FOUND THEN
    IF v_app.status::text NOT IN ('pending', 'approved') THEN RETURN NULL; END IF;
    IF NOT public.fn_lo_is_hostel_learner(v_app.learner_id) THEN RETURN NULL; END IF;

    SELECT p.id, p.institution_id INTO v_profile, v_inst
      FROM public.profiles p WHERE p.learner_id = v_app.learner_id
     ORDER BY p.is_active DESC NULLS LAST LIMIT 1;
    IF v_profile IS NULL THEN RETURN NULL; END IF;

    SELECT ha.block_id INTO v_block FROM public.hostel_allocations ha
     WHERE ha.learner_id = v_profile AND ha.status = 'active' LIMIT 1;

    v_start  := (v_app.start_date + coalesce(v_app.exit_time, time '00:00')) AT TIME ZONE 'Asia/Kolkata';
    v_return := (v_app.end_date + coalesce(v_app.return_time, time '23:59')) AT TIME ZONE 'Asia/Kolkata';
    IF v_return <= v_start THEN v_return := v_return + interval '1 day'; END IF;

    INSERT INTO public.hostel_gate_passes (
      institution_id, learner_id, leave_onduty_application_id, leave_type_id, block_id,
      pass_type, destination, reason, planned_out_at, expected_exit, expected_return,
      valid_date, attachment_url, status
    ) VALUES (
      coalesce(v_app.institution_id, v_inst), v_profile, v_app.id, v_type.id, v_block,
      CASE WHEN v_app.end_date > v_app.start_date THEN 'overnight' ELSE 'regular_out' END::public.gate_pass_type_enum,
      v_type.name, v_app.reason, v_start, v_start, v_return,
      v_app.start_date, v_app.attachment_url, 'requested'
    ) RETURNING * INTO v_pass;
  END IF;

  -- Move: the application's status is the only thing that decides the pass.
  IF v_pass.status::text = 'requested' THEN
    IF v_app.status::text = 'approved' THEN
      SELECT ap.approver_id INTO v_actor FROM public.leave_onduty_approvals ap
       WHERE ap.application_id = v_app.id AND ap.status::text = 'approved'
       ORDER BY ap.action_taken_at DESC NULLS LAST LIMIT 1;
      v_actor := coalesce(v_actor, (SELECT auth.uid()));
      IF v_actor IS NULL THEN RETURN v_pass.id; END IF;   -- stays 'requested'; re-run once an approver is known

      -- 12h window from the leave start, never from the approval alone. Approved
      -- after the leave began → the window opens now. No exit time recorded (legacy
      -- rows) → the whole start day.
      v_from := greatest(coalesce(v_pass.planned_out_at, v_now), v_now);
      IF v_app.exit_time IS NULL THEN
        v_until := ((v_app.start_date + 1)::timestamp) AT TIME ZONE 'Asia/Kolkata';
      ELSE
        v_until := v_from + interval '12 hours';
      END IF;

      IF v_pass.expected_return < v_now OR v_until <= v_now THEN
        UPDATE public.hostel_gate_passes
           SET status = 'expired', valid_from = v_from, valid_until = v_until, updated_at = v_now
         WHERE id = v_pass.id;
      ELSE
        UPDATE public.hostel_gate_passes
           SET status = 'issued', pass_number = public.next_gate_pass_number(),
               qr_code = 'QR-' || gen_random_uuid()::text,
               approved_by = v_actor, approved_at = v_now,
               valid_from = v_from, valid_until = v_until, updated_at = v_now
         WHERE id = v_pass.id;
      END IF;

    ELSIF v_app.status::text = 'rejected' THEN
      SELECT ap.approver_id, nullif(btrim(coalesce(ap.comments, '')), '') INTO v_actor, v_comment
        FROM public.leave_onduty_approvals ap
       WHERE ap.application_id = v_app.id AND ap.status::text = 'rejected'
       ORDER BY ap.action_taken_at DESC NULLS LAST LIMIT 1;
      UPDATE public.hostel_gate_passes
         SET status = 'rejected', rejected_by = coalesce(v_actor, (SELECT auth.uid())), rejected_at = v_now,
             rejection_reason = coalesce(v_comment, 'Leave application was rejected'), updated_at = v_now
       WHERE id = v_pass.id;

    ELSIF v_app.status::text IN ('cancelled', 'withdrawn') THEN
      UPDATE public.hostel_gate_passes
         SET status = 'cancelled', cancelled_by = (SELECT auth.uid()),
             cancellation_reason = 'Leave application was ' || v_app.status::text, updated_at = v_now
       WHERE id = v_pass.id;
    END IF;

  ELSIF v_pass.status::text = 'issued' AND v_app.status::text IN ('cancelled', 'withdrawn', 'rejected') THEN
    UPDATE public.hostel_gate_passes
       SET status = 'cancelled', cancelled_by = (SELECT auth.uid()),
           cancellation_reason = 'Leave application was ' || v_app.status::text, updated_at = v_now
     WHERE id = v_pass.id;
  END IF;

  RETURN v_pass.id;
END $$;

CREATE OR REPLACE FUNCTION public.fn_lo_gate_pass_on_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  PERFORM public.fn_lo_sync_gate_pass(NEW.id);
  RETURN NULL;
END $$;

-- An approval must never fail because the pass could not move; the pass stays
-- 'requested' and a re-run of fn_lo_sync_gate_pass finishes it. The WARNING lands
-- in the Postgres logs.
CREATE OR REPLACE FUNCTION public.fn_lo_gate_pass_on_status()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  BEGIN
    PERFORM public.fn_lo_sync_gate_pass(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_lo_gate_pass_on_status: application % — % (%)', NEW.id, SQLERRM, SQLSTATE;
  END;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS t_lo_gate_pass_after_insert ON public.leave_onduty_applications;
CREATE TRIGGER t_lo_gate_pass_after_insert
  AFTER INSERT ON public.leave_onduty_applications
  FOR EACH ROW EXECUTE FUNCTION public.fn_lo_gate_pass_on_insert();

DROP TRIGGER IF EXISTS t_lo_gate_pass_after_status ON public.leave_onduty_applications;
CREATE TRIGGER t_lo_gate_pass_after_status
  AFTER UPDATE OF status ON public.leave_onduty_applications
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.fn_lo_gate_pass_on_status();

-- A pass tied to a leave application is issued by that leave's final approval and
-- by nothing else — the warden's generic "Approve" button must not bypass the
-- chief-warden step.
CREATE OR REPLACE FUNCTION public.fn_hostel_gate_pass_linked_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NEW.leave_onduty_application_id IS NOT NULL
     AND NEW.status::text IN ('issued', 'active', 'returned', 'overdue')
     AND NOT EXISTS (SELECT 1 FROM public.leave_onduty_applications a
                     WHERE a.id = NEW.leave_onduty_application_id AND a.status::text = 'approved') THEN
    RAISE EXCEPTION 'This gate pass belongs to a leave application that is not approved yet'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS t_hostel_gate_passes_linked_guard ON public.hostel_gate_passes;
CREATE TRIGGER t_hostel_gate_passes_linked_guard
  BEFORE INSERT OR UPDATE OF status ON public.hostel_gate_passes
  FOR EACH ROW EXECUTE FUNCTION public.fn_hostel_gate_pass_linked_guard();

-- ── 4. Gate: 12-hour window on OUT ───────────────────────────────────────────
-- Identical to the previous body except: 'expired' is a dead end, and a pass that
-- carries valid_until uses [valid_from, valid_until] instead of valid_date.
CREATE OR REPLACE FUNCTION public.gate_record_movement(p_direction text, p_gate_pass_id uuid DEFAULT NULL::uuid, p_staff_id uuid DEFAULT NULL::uuid, p_gate_location text DEFAULT NULL::text, p_reason text DEFAULT NULL::text, p_staff_pass_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pass        record;
  v_staff       record;
  v_sp_id       uuid;
  v_sp_reason   text;
  v_last_dir    text;
  v_today       date := (timezone('Asia/Kolkata', now()))::date;
  v_now         timestamptz := now();
  v_movement_id uuid;
  v_new_status  text;
  v_reason      text := NULLIF(trim(COALESCE(p_reason, '')), '');
BEGIN
  IF NOT public.gate_can_record() THEN
    RAISE EXCEPTION 'gate: not authorized to record movements' USING ERRCODE = '42501';
  END IF;
  IF p_direction NOT IN ('in', 'out') THEN
    RAISE EXCEPTION 'gate: direction must be in or out';
  END IF;

  -- ── Learner: against an approved pass ────────────────────────────────
  IF p_gate_pass_id IS NOT NULL THEN
    SELECT gp.*, p.learner_id AS learner_profile_id
      INTO v_pass
      FROM public.hostel_gate_passes gp
      LEFT JOIN public.profiles p ON p.id = gp.learner_id
     WHERE gp.id = p_gate_pass_id
     FOR UPDATE OF gp;
    IF v_pass.id IS NULL THEN
      RAISE EXCEPTION 'gate: pass not found';
    END IF;
    IF v_pass.status::text = 'requested' THEN
      RAISE EXCEPTION 'gate: pass % is not approved yet', v_pass.pass_number;
    ELSIF v_pass.status::text = 'rejected' THEN
      RAISE EXCEPTION 'gate: pass % was rejected', v_pass.pass_number;
    ELSIF v_pass.status::text = 'cancelled' THEN
      RAISE EXCEPTION 'gate: pass % was cancelled', v_pass.pass_number;
    ELSIF v_pass.status::text = 'expired' THEN
      RAISE EXCEPTION 'gate: pass % has expired — the 12-hour exit window closed', v_pass.pass_number;
    ELSIF v_pass.status::text = 'returned' THEN
      RAISE EXCEPTION 'gate: pass % is already completed', v_pass.pass_number;
    END IF;

    IF p_direction = 'out' THEN
      IF v_pass.status::text <> 'issued' THEN
        RAISE EXCEPTION 'gate: learner is already OUT on pass %', v_pass.pass_number;
      END IF;
      IF v_pass.valid_until IS NOT NULL THEN
        IF v_now < v_pass.valid_from THEN
          RAISE EXCEPTION 'gate: pass % is not valid yet — it opens at %', v_pass.pass_number,
            to_char(v_pass.valid_from AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY HH24:MI');
        END IF;
        IF v_now > v_pass.valid_until THEN
          RAISE EXCEPTION 'gate: pass % has expired — the exit window closed at %', v_pass.pass_number,
            to_char(v_pass.valid_until AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY HH24:MI');
        END IF;
      ELSIF v_pass.valid_date IS NOT NULL AND v_pass.valid_date <> v_today THEN
        RAISE EXCEPTION 'gate: pass % is valid on %, not today', v_pass.pass_number, to_char(v_pass.valid_date, 'DD Mon YYYY');
      END IF;
      IF v_pass.expected_return < v_now THEN
        RAISE EXCEPTION 'gate: pass % has expired', v_pass.pass_number;
      END IF;
      v_new_status := 'active';
      UPDATE public.hostel_gate_passes
         SET status = 'active', out_time = v_now, gate_security_out = auth.uid(), updated_at = v_now
       WHERE id = v_pass.id;
    ELSE
      IF v_pass.status::text NOT IN ('active', 'overdue') THEN
        RAISE EXCEPTION 'gate: learner has not gone OUT on pass % yet', v_pass.pass_number;
      END IF;
      v_new_status := 'returned';
      UPDATE public.hostel_gate_passes
         SET status = 'returned', actual_return = v_now, gate_security_in = auth.uid(), updated_at = v_now
       WHERE id = v_pass.id;
    END IF;

    INSERT INTO public.gate_movements (
      person_type, profile_id, learner_profile_id, gate_pass_id, institution_id,
      direction, recorded_at, movement_date, recorded_by, gate_location
    ) VALUES (
      'learner', v_pass.learner_id, v_pass.learner_profile_id, v_pass.id, v_pass.institution_id,
      p_direction, v_now, v_today, auth.uid(), NULLIF(p_gate_location, '')
    ) RETURNING id INTO v_movement_id;

    PERFORM public.gate_audit(
      CASE WHEN p_direction = 'out' THEN 'security.marked_out' ELSE 'security.marked_in' END,
      'gate_movements', v_movement_id,
      jsonb_build_object('pass_status', v_pass.status),
      jsonb_build_object('pass_id', v_pass.id, 'pass_number', v_pass.pass_number, 'pass_status', v_new_status, 'at', v_now)
    );
    RETURN jsonb_build_object('movement_id', v_movement_id, 'recorded_at', v_now, 'pass_status', v_new_status);
  END IF;

  -- ── Staff: personal QR or staff pass ─────────────────────────────────
  IF p_staff_pass_id IS NOT NULL THEN
    SELECT id, reason, staff_id INTO v_sp_id, v_sp_reason, p_staff_id
      FROM public.gate_staff_passes WHERE id = p_staff_pass_id FOR UPDATE;
    IF v_sp_id IS NULL THEN RAISE EXCEPTION 'gate: staff pass not found'; END IF;
  END IF;
  IF p_staff_id IS NULL THEN
    RAISE EXCEPTION 'gate: nothing to record against';
  END IF;

  SELECT s.id, s.is_active, s.institution_id, s.profile_id, s.email, s.institution_email
    INTO v_staff FROM public.staff s WHERE s.id = p_staff_id;
  IF v_staff.id IS NULL THEN RAISE EXCEPTION 'gate: team member not found'; END IF;
  IF v_staff.is_active IS FALSE THEN RAISE EXCEPTION 'gate: this team member is no longer active'; END IF;

  -- Latest live staff pass, if the scan came in on the personal QR.
  IF v_sp_id IS NULL THEN
    SELECT id, reason INTO v_sp_id, v_sp_reason FROM public.gate_staff_passes
     WHERE staff_id = v_staff.id AND status IN ('open', 'out')
     ORDER BY created_at DESC LIMIT 1
     FOR UPDATE;
  END IF;

  -- IN → IN / OUT → OUT is the invalid sequence. First of the day may be either.
  SELECT direction INTO v_last_dir
    FROM public.gate_movements
   WHERE staff_id = v_staff.id AND movement_date = v_today
   ORDER BY recorded_at DESC LIMIT 1;
  IF v_last_dir = p_direction THEN
    RAISE EXCEPTION 'gate: last record today is already %; the next must be %',
      upper(v_last_dir), CASE WHEN v_last_dir = 'in' THEN 'OUT' ELSE 'IN' END;
  END IF;

  IF v_reason IS NULL THEN
    v_reason := v_sp_reason;
  END IF;

  INSERT INTO public.gate_movements (
    person_type, profile_id, staff_id, staff_pass_id, institution_id, direction,
    recorded_at, movement_date, recorded_by, gate_location, reason
  ) VALUES (
    'staff',
    COALESCE(v_staff.profile_id,
             (SELECT p.id FROM public.profiles p
               WHERE lower(p.email) IN (lower(COALESCE(v_staff.institution_email, '')), lower(COALESCE(v_staff.email, '')))
               LIMIT 1)),
    v_staff.id, v_sp_id, v_staff.institution_id, p_direction,
    v_now, v_today, auth.uid(), NULLIF(p_gate_location, ''), v_reason
  ) RETURNING id INTO v_movement_id;

  IF v_sp_id IS NOT NULL THEN
    IF p_direction = 'out' THEN
      UPDATE public.gate_staff_passes SET status = 'out', out_time = v_now, updated_at = v_now WHERE id = v_sp_id;
    ELSE
      UPDATE public.gate_staff_passes SET status = 'completed', in_time = v_now, updated_at = v_now WHERE id = v_sp_id;
    END IF;
  END IF;

  PERFORM public.gate_audit(
    CASE WHEN p_direction = 'out' THEN 'security.marked_out' ELSE 'security.marked_in' END,
    'gate_movements', v_movement_id, NULL,
    jsonb_build_object('staff_id', v_staff.id, 'staff_pass_id', v_sp_id, 'at', v_now, 'reason', v_reason)
  );
  RETURN jsonb_build_object('movement_id', v_movement_id, 'recorded_at', v_now, 'staff_pass_id', v_sp_id);
END;
$function$;

-- ── 5. Hostel attendance lock + clinical-duty rule ───────────────────────────
-- A UI-only lock on an RLS-writable column is decorative, so the rule lives in the
-- table. Covered learner ⇒ on_leave, whatever the sheet sent. A clinical rotation
-- is covered too, which also removes the 'medical' status for the duration.
-- t_hostel_attendance_leave_cover sorts after t_hostel_attendance_housekeeping_gate.
CREATE OR REPLACE FUNCTION public.fn_cl_attendance_leave_cover()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public._fn_cl_leave_cover(ARRAY[NEW.learner_id], NEW.date)) THEN
    NEW.evening_status := 'on_leave';
    IF NEW.morning_status IS NOT NULL THEN NEW.morning_status := 'on_leave'; END IF;
    NEW.is_curfew_violation := false;
    NEW.late_minutes := 0;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS t_hostel_attendance_leave_cover ON public.hostel_attendance;
CREATE TRIGGER t_hostel_attendance_leave_cover
  BEFORE INSERT OR UPDATE ON public.hostel_attendance
  FOR EACH ROW EXECUTE FUNCTION public.fn_cl_attendance_leave_cover();

-- On approved clinical/hospital duty a learner is not "sick in the hostel". An
-- emergency is still loggable — blocking it would be a safety hazard.
CREATE OR REPLACE FUNCTION public.fn_cl_health_case_clinical_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NEW.severity::text <> 'emergency'
     AND EXISTS (SELECT 1 FROM public._fn_cl_leave_cover(ARRAY[NEW.learner_id],
                                                         (timezone('Asia/Kolkata', now()))::date)
                 WHERE is_clinical) THEN
    RAISE EXCEPTION 'This learner is on approved clinical / hospital duty; a hostel health case cannot be logged (emergencies excepted)'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS t_hostel_health_cases_clinical_guard ON public.hostel_health_cases;
CREATE TRIGGER t_hostel_health_cases_clinical_guard
  BEFORE INSERT ON public.hostel_health_cases
  FOR EACH ROW EXECUTE FUNCTION public.fn_cl_health_case_clinical_guard();

-- ── 6. Grants (DEFINER functions are executable by PUBLIC by default) ────────
REVOKE ALL ON FUNCTION public.fn_lo_is_hostel_learner(uuid)        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_cl_leave_cover(uuid[], date)     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_lo_sync_gate_pass(uuid)           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_lo_gate_pass_on_insert()          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_lo_gate_pass_on_status()          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_hostel_gate_pass_linked_guard()   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_cl_attendance_leave_cover()       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_cl_health_case_clinical_guard()   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_cl_leave_cover(uuid[], date)      FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cl_leave_cover(uuid[], date)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_lo_sync_gate_pass(uuid)        TO service_role;

-- ── 7. Backfill: pending applications get a 'requested' pass; approved ones that
-- are still in range get issued (window opens now). Idempotent.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT a.id FROM public.leave_onduty_applications a
    JOIN public.learner_leave_types t ON t.id = a.leave_type_id AND t.issues_gate_pass
    WHERE a.status::text = 'pending'
       OR (a.status::text = 'approved'
           AND a.end_date >= (timezone('Asia/Kolkata', now()))::date)
  LOOP
    PERFORM public.fn_lo_sync_gate_pass(r.id);
  END LOOP;
END $$;
