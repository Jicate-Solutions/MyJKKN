-- ============================================================================
-- 2026-09-16 — Gate Pass: seeded service type + staff/faculty passes (no approval)
--
-- ⚠️ NOT APPLIED — FILE ONLY. Apply out-of-band after 20260915100000.
--
-- WHAT THIS ADDS
-- --------------
--  1. A system-default service type 'gate-pass' (issues_gate_pass = true,
--     open to every role, one HOD approval step) so "Service Requests → Types
--     → Gate Pass" exists on day one. Admins may edit the steps.
--  2. gate_staff_passes — a team member (staff / faculty) enters a reason and
--     gets a QR immediately. No approval. Token 'SP-<uuid>'. The personal
--     'GS:<staff.id>' QR keeps working and picks up the latest open pass.
--  3. RPC changes:
--       gate_create_staff_pass(p_reason)          — staff self-service
--       gate_resolve_token                         — understands 'SP-…'
--       gate_person_snapshot                       — staff gets open_pass{}
--       gate_record_movement                       — p_staff_pass_id; reason
--                                                    falls back to the pass;
--                                                    pass status open→out→completed
--       issue_gate_pass_for_service_request        — a STAFF requester of a
--                                                    gate-pass type gets a staff
--                                                    pass at SUBMIT time; approval
--                                                    (if configured) never blocks
--       gate_in_out_report                         — staff reason from the pass
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- 1. Seed the Gate Pass service type
-- ────────────────────────────────────────────────────────────────────────
INSERT INTO public.service_types
  (slug, name, description, icon, color, is_active, is_system_default, allowed_roles,
   max_active_requests, auto_fulfill_on_approval, enable_priority, enable_attachments,
   enable_email_notifications, approval_workflow_type, scope_level, issues_gate_pass)
VALUES
  ('gate-pass',
   'Gate Pass',
   'Permission to leave the campus during working hours. Learners need prior approval; on approval a Gate Pass ID and QR are issued and scanned at the gate for OUT and IN. Team members get their pass immediately.',
   'DoorOpen', '#0b6d41', true, true, ARRAY['*'],
   3, false, false, false, true, 'sequential', 'common', true)
ON CONFLICT (slug) DO UPDATE SET
  issues_gate_pass = true,
  is_system_default = true,
  is_active = true,
  updated_at = now();

-- One default approval step (HOD). Admins can change it on the type page.
INSERT INTO public.service_request_approval_steps (service_type_id, step_order, step_name, approver_role, is_required)
SELECT st.id, 1, 'Department approval', 'hod', true
  FROM public.service_types st
 WHERE st.slug = 'gate-pass'
   AND NOT EXISTS (SELECT 1 FROM public.service_request_approval_steps s WHERE s.service_type_id = st.id);

-- ────────────────────────────────────────────────────────────────────────
-- 2. gate_staff_passes
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gate_staff_passes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id           uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  profile_id         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  institution_id     uuid REFERENCES public.institutions(id) ON DELETE SET NULL,
  service_request_id uuid REFERENCES public.service_requests(id) ON DELETE SET NULL,
  pass_number        text NOT NULL UNIQUE DEFAULT public.next_gate_pass_number(),
  qr_code            text NOT NULL UNIQUE DEFAULT ('SP-' || gen_random_uuid()::text),
  reason             text NOT NULL,
  status             text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'out', 'completed', 'cancelled')),
  out_time           timestamptz,
  in_time            timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gate_staff_passes_staff_idx ON public.gate_staff_passes (staff_id, created_at DESC);
CREATE INDEX IF NOT EXISTS gate_staff_passes_profile_idx ON public.gate_staff_passes (profile_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS gate_staff_passes_service_request_uniq
  ON public.gate_staff_passes (service_request_id) WHERE service_request_id IS NOT NULL;

ALTER TABLE public.gate_staff_passes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gate_staff_passes_select ON public.gate_staff_passes;
CREATE POLICY gate_staff_passes_select ON public.gate_staff_passes
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR profile_id = auth.uid()
    OR public.user_has_permission('gate_security.scan.view')
    OR public.user_has_permission('gate_security.reports.view')
    OR public.user_has_permission('campus_living.gate_passes.edit')
  );
-- Writes only through the DEFINER RPCs.

ALTER TABLE public.gate_movements
  ADD COLUMN IF NOT EXISTS staff_pass_id uuid REFERENCES public.gate_staff_passes(id) ON DELETE SET NULL;

-- Resolve the caller's staff row: profile link first, then the email bridge.
CREATE OR REPLACE FUNCTION public.gate_my_staff_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT s.id FROM public.staff s WHERE s.profile_id = auth.uid() LIMIT 1),
    (SELECT s.id FROM public.staff s
       JOIN public.profiles p ON p.id = auth.uid()
      WHERE lower(COALESCE(s.institution_email, '')) = lower(p.email)
         OR lower(COALESCE(s.email, '')) = lower(p.email)
      LIMIT 1)
  );
$$;
REVOKE ALL ON FUNCTION public.gate_my_staff_id() FROM public;
GRANT EXECUTE ON FUNCTION public.gate_my_staff_id() TO authenticated;

-- ────────────────────────────────────────────────────────────────────────
-- 3a. gate_create_staff_pass — reason in, QR out, no approval
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.gate_create_staff_pass(p_reason text, p_service_request_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid := public.gate_my_staff_id();
  v_staff    record;
  v_row      record;
BEGIN
  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'gate: no team-member record is linked to your account' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(trim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'gate: a reason is required';
  END IF;
  SELECT id, institution_id, is_active INTO v_staff FROM public.staff WHERE id = v_staff_id;
  IF v_staff.is_active IS FALSE THEN
    RAISE EXCEPTION 'gate: this team-member record is not active' USING ERRCODE = '42501';
  END IF;

  -- One live pass at a time: a still-open (not yet out) pass is replaced by
  -- the new reason rather than stacking. A pass already OUT stays.
  UPDATE public.gate_staff_passes
     SET status = 'cancelled', updated_at = now()
   WHERE staff_id = v_staff_id AND status = 'open';

  INSERT INTO public.gate_staff_passes (staff_id, profile_id, institution_id, service_request_id, reason)
  VALUES (v_staff_id, auth.uid(), v_staff.institution_id, p_service_request_id, trim(p_reason))
  RETURNING * INTO v_row;

  PERFORM public.gate_audit('staff_pass.created', 'gate_staff_passes', v_row.id, NULL,
    jsonb_build_object('pass_number', v_row.pass_number, 'reason', v_row.reason, 'service_request_id', p_service_request_id));

  RETURN to_jsonb(v_row);
END;
$$;
REVOKE ALL ON FUNCTION public.gate_create_staff_pass(text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.gate_create_staff_pass(text, uuid) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────
-- 3b. gate_resolve_token — add 'SP-…'
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.gate_resolve_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_t text := trim(COALESCE(p_token, '')); v_id uuid; v_pass record; v_sp record;
BEGIN
  IF NOT public.gate_can_scan() THEN
    RAISE EXCEPTION 'gate: not authorized' USING ERRCODE = '42501';
  END IF;
  IF v_t LIKE 'GS:%' THEN
    BEGIN v_id := substr(v_t, 4)::uuid; EXCEPTION WHEN others THEN RETURN NULL; END;
    IF EXISTS (SELECT 1 FROM public.staff WHERE id = v_id) THEN
      RETURN jsonb_build_object('kind', 'staff', 'staff_id', v_id);
    END IF;
    RETURN NULL;
  END IF;
  IF v_t LIKE 'SP-%' THEN
    SELECT id, staff_id INTO v_sp FROM public.gate_staff_passes WHERE qr_code = v_t OR pass_number = v_t LIMIT 1;
    IF v_sp.id IS NOT NULL THEN
      RETURN jsonb_build_object('kind', 'staff', 'staff_id', v_sp.staff_id, 'staff_pass_id', v_sp.id);
    END IF;
    RETURN NULL;
  END IF;
  IF v_t LIKE 'QR-%' OR v_t LIKE 'GP-%' THEN
    SELECT gp.id, gp.learner_id INTO v_pass FROM public.hostel_gate_passes gp
     WHERE gp.qr_code = v_t OR gp.pass_number = v_t LIMIT 1;
    IF v_pass.id IS NOT NULL THEN
      RETURN jsonb_build_object('kind', 'pass', 'pass_id', v_pass.id, 'profile_id', v_pass.learner_id);
    END IF;
    -- A GP- number may belong to a staff pass too.
    SELECT id, staff_id INTO v_sp FROM public.gate_staff_passes WHERE pass_number = v_t LIMIT 1;
    IF v_sp.id IS NOT NULL THEN
      RETURN jsonb_build_object('kind', 'staff', 'staff_id', v_sp.staff_id, 'staff_pass_id', v_sp.id);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────
-- 3c. gate_person_snapshot — staff gets open_pass
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.gate_person_snapshot(p_profile_id uuid DEFAULT NULL, p_staff_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_out jsonb;
BEGIN
  IF NOT public.gate_can_scan() THEN
    RAISE EXCEPTION 'gate: not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_staff_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'person_type', 'staff',
      'staff_id', s.id,
      'profile_id', s.profile_id,
      'full_name', trim(concat_ws(' ', s.first_name, s.last_name)),
      'staff_code', s.staff_id,
      'email', COALESCE(s.institution_email, s.email),
      'mobile', s.phone,
      'photo_url', s.profile_picture,
      'department', d.department_name,
      'designation', s.designation,
      'institution_id', s.institution_id,
      'is_active', s.is_active,
      'last_direction', (SELECT m.direction FROM public.gate_movements m
                          WHERE m.staff_id = s.id AND m.movement_date = (timezone('Asia/Kolkata', now()))::date
                          ORDER BY m.recorded_at DESC LIMIT 1),
      'last_movement_at', (SELECT m.recorded_at FROM public.gate_movements m
                            WHERE m.staff_id = s.id ORDER BY m.recorded_at DESC LIMIT 1),
      'open_pass', (SELECT jsonb_build_object('id', sp.id, 'pass_number', sp.pass_number, 'reason', sp.reason,
                                              'status', sp.status, 'created_at', sp.created_at, 'out_time', sp.out_time)
                      FROM public.gate_staff_passes sp
                     WHERE sp.staff_id = s.id AND sp.status IN ('open', 'out')
                     ORDER BY sp.created_at DESC LIMIT 1)
    ) INTO v_out
    FROM public.staff s
    LEFT JOIN public.departments d ON d.id = s.department_id
    WHERE s.id = p_staff_id;
    RETURN v_out;
  END IF;

  SELECT jsonb_build_object(
    'person_type', 'learner',
    'profile_id', p.id,
    'learner_profile_id', lp.id,
    'full_name', COALESCE(NULLIF(trim(concat_ws(' ', lp.first_name, lp.last_name)), ''), p.full_name),
    'roll_number', lp.roll_number,
    'register_number', lp.register_number,
    'jkkn_id', (SELECT ji.jkkn_id FROM public.jkkn_identities ji WHERE ji.learner_profile_id = lp.id AND ji.retired_at IS NULL LIMIT 1),
    'email', COALESCE(lp.college_email, lp.student_email, p.email),
    'mobile', COALESCE(lp.student_mobile, p.phone_number),
    'photo_url', lp.student_photo_url,
    'institution_id', lp.institution_id,
    'lifecycle_status', lp.lifecycle_status
  ) INTO v_out
  FROM public.profiles p
  LEFT JOIN public.learners_profiles lp ON lp.id = p.learner_id
  WHERE p.id = p_profile_id;
  RETURN v_out;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────
-- 3d. gate_record_movement — staff pass aware
-- ────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.gate_record_movement(text, uuid, uuid, text, text);
CREATE OR REPLACE FUNCTION public.gate_record_movement(
  p_direction     text,
  p_gate_pass_id  uuid DEFAULT NULL,
  p_staff_id      uuid DEFAULT NULL,
  p_gate_location text DEFAULT NULL,
  p_reason        text DEFAULT NULL,
  p_staff_pass_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    ELSIF v_pass.status::text = 'returned' THEN
      RAISE EXCEPTION 'gate: pass % is already completed', v_pass.pass_number;
    END IF;

    IF p_direction = 'out' THEN
      IF v_pass.status::text <> 'issued' THEN
        RAISE EXCEPTION 'gate: learner is already OUT on pass %', v_pass.pass_number;
      END IF;
      IF v_pass.valid_date IS NOT NULL AND v_pass.valid_date <> v_today THEN
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
$$;
REVOKE ALL ON FUNCTION public.gate_record_movement(text, uuid, uuid, text, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.gate_record_movement(text, uuid, uuid, text, text, uuid) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────
-- 3e. issue_gate_pass_for_service_request — staff requester branch
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.issue_gate_pass_for_service_request(p_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req            record;
  v_learner        record;
  v_staff_id       uuid;
  v_staff          record;
  v_existing_id    uuid;
  v_date           date;
  v_exit_t         time;
  v_return_t       time;
  v_exit_at        timestamptz;
  v_return_at      timestamptz;
  v_reason         text;
  v_pass_id        uuid;
  v_pass_number    text;
  v_qr             text;
  v_is_requester   boolean;
  v_may_approve    boolean;
BEGIN
  SELECT sr.id, sr.requester_id, sr.form_data, sr.status::text AS status, sr.institution_id,
         st.issues_gate_pass
    INTO v_req
    FROM public.service_requests sr
    JOIN public.service_types st ON st.id = sr.service_type_id
   WHERE sr.id = p_request_id;

  IF v_req.id IS NULL THEN
    RAISE EXCEPTION 'issue_gate_pass: request % not found', p_request_id;
  END IF;
  IF NOT COALESCE(v_req.issues_gate_pass, false) THEN
    RAISE NOTICE 'issue_gate_pass: request % is not a gate-pass type; skipping', p_request_id;
    RETURN NULL;
  END IF;

  v_is_requester := (v_req.requester_id = auth.uid());
  v_may_approve  := public.is_super_admin() OR public.user_has_permission('service_requests.approve');
  IF NOT (v_is_requester OR v_may_approve) THEN
    RAISE EXCEPTION 'issue_gate_pass: not authorized' USING ERRCODE = '42501';
  END IF;

  v_reason := COALESCE(NULLIF(v_req.form_data->>'gate_pass_reason', ''), 'Gate pass');

  SELECT lp.id, lp.institution_id INTO v_learner
    FROM public.profiles p JOIN public.learners_profiles lp ON lp.id = p.learner_id
   WHERE p.id = v_req.requester_id;

  -- ── Team member: pass at submit time, approval never blocks ──────────
  IF v_learner.id IS NULL THEN
    SELECT COALESCE(
      (SELECT s.id FROM public.staff s WHERE s.profile_id = v_req.requester_id LIMIT 1),
      (SELECT s.id FROM public.staff s JOIN public.profiles p ON p.id = v_req.requester_id
        WHERE lower(COALESCE(s.institution_email, '')) = lower(p.email)
           OR lower(COALESCE(s.email, '')) = lower(p.email) LIMIT 1)
    ) INTO v_staff_id;
    IF v_staff_id IS NULL THEN
      RAISE EXCEPTION 'issue_gate_pass: requester % has neither a learner nor a team-member record', v_req.requester_id;
    END IF;
    IF v_req.status NOT IN ('submitted', 'in_review', 'approved', 'fulfilled') THEN
      RAISE EXCEPTION 'issue_gate_pass: request % is not submitted (status=%)', p_request_id, v_req.status;
    END IF;
    SELECT id INTO v_existing_id FROM public.gate_staff_passes WHERE service_request_id = p_request_id;
    IF v_existing_id IS NOT NULL THEN RETURN v_existing_id; END IF;

    SELECT id, institution_id INTO v_staff FROM public.staff WHERE id = v_staff_id;
    UPDATE public.gate_staff_passes SET status = 'cancelled', updated_at = now()
     WHERE staff_id = v_staff_id AND status = 'open';
    INSERT INTO public.gate_staff_passes (staff_id, profile_id, institution_id, service_request_id, reason)
    VALUES (v_staff_id, v_req.requester_id, COALESCE(v_staff.institution_id, v_req.institution_id), p_request_id, v_reason)
    RETURNING id INTO v_pass_id;
    PERFORM public.gate_audit('staff_pass.created', 'gate_staff_passes', v_pass_id, NULL,
      jsonb_build_object('service_request_id', p_request_id, 'reason', v_reason));
    RETURN v_pass_id;
  END IF;

  -- ── Learner: approval required ───────────────────────────────────────
  IF NOT v_may_approve THEN
    RAISE EXCEPTION 'issue_gate_pass: not authorized' USING ERRCODE = '42501';
  END IF;
  IF v_req.status NOT IN ('approved', 'fulfilled') THEN
    RAISE EXCEPTION 'issue_gate_pass: request % is not approved (status=%)', p_request_id, v_req.status;
  END IF;

  SELECT id INTO v_existing_id FROM public.hostel_gate_passes WHERE service_request_id = p_request_id;
  IF v_existing_id IS NOT NULL THEN RETURN v_existing_id; END IF;

  BEGIN
    v_date     := NULLIF(v_req.form_data->>'gate_pass_date', '')::date;
    v_exit_t   := NULLIF(v_req.form_data->>'gate_pass_exit_time', '')::time;
    v_return_t := NULLIF(v_req.form_data->>'gate_pass_return_time', '')::time;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'issue_gate_pass: gate_pass_date / exit / return are not valid for request %', p_request_id;
  END;
  IF v_date IS NULL OR v_return_t IS NULL THEN
    RAISE EXCEPTION 'issue_gate_pass: date and expected return time are required (request %)', p_request_id;
  END IF;

  v_exit_at   := CASE WHEN v_exit_t IS NULL THEN NULL ELSE ((v_date + v_exit_t) AT TIME ZONE 'Asia/Kolkata') END;
  v_return_at := (v_date + v_return_t) AT TIME ZONE 'Asia/Kolkata';
  IF v_exit_at IS NOT NULL AND v_return_at <= v_exit_at THEN
    v_return_at := v_return_at + interval '1 day';
  END IF;

  v_pass_number := public.next_gate_pass_number();
  v_qr          := 'QR-' || gen_random_uuid()::text;

  INSERT INTO public.hostel_gate_passes (
    institution_id, learner_id, pass_type, pass_number, qr_code,
    destination, reason, expected_exit, expected_return, valid_date,
    alternate_mobile, approved_by, approved_at, status, service_request_id
  ) VALUES (
    COALESCE(v_learner.institution_id, v_req.institution_id),
    v_req.requester_id, 'regular_out', v_pass_number, v_qr,
    v_reason, v_reason, v_exit_at, v_return_at, v_date,
    NULLIF(v_req.form_data->>'gate_pass_alt_mobile', ''),
    auth.uid(), now(), 'issued', p_request_id
  )
  RETURNING id INTO v_pass_id;

  PERFORM public.gate_audit('gate_pass.qr_generated', 'hostel_gate_passes', v_pass_id, NULL,
    jsonb_build_object('pass_number', v_pass_number, 'service_request_id', p_request_id));
  RETURN v_pass_id;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────
-- 3f. gate_in_out_report — staff reason falls back to the pass
-- ────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.gate_in_out_report(date, date, text, uuid, uuid, text);
CREATE OR REPLACE FUNCTION public.gate_in_out_report(
  p_from date, p_to date, p_person_type text DEFAULT NULL,
  p_institution_id uuid DEFAULT NULL, p_department_id uuid DEFAULT NULL, p_state text DEFAULT NULL
)
RETURNS TABLE (
  person_type text, person_name text, code text, department text, designation text,
  institution_id uuid, gate_pass_id uuid, pass_number text, pass_status text, reason text,
  approved_by text, out_time timestamptz, in_time timestamptz, movement_date date,
  current_status text, movement_id uuid, reason_updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_super_admin() OR public.user_has_permission('gate_security.reports.view')) THEN
    RAISE EXCEPTION 'gate: not authorized to view reports' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT 'learner'::text,
         COALESCE(NULLIF(trim(concat_ws(' ', lp.first_name, lp.last_name)), ''), p.full_name)::text,
         COALESCE(lp.register_number, lp.roll_number)::text,
         d.department_name::text, NULL::text,
         gp.institution_id, gp.id, gp.pass_number::text, gp.status::text, COALESCE(gp.reason, gp.destination)::text,
         ap.full_name::text, gp.out_time, gp.actual_return,
         COALESCE(gp.valid_date, (timezone('Asia/Kolkata', COALESCE(gp.out_time, gp.approved_at, gp.created_at)))::date),
         (CASE gp.status::text WHEN 'active' THEN 'Outside' WHEN 'overdue' THEN 'Outside (late)'
              WHEN 'returned' THEN 'Completed' WHEN 'issued' THEN 'Approved' ELSE initcap(gp.status::text) END)::text,
         NULL::uuid, NULL::timestamptz
    FROM public.hostel_gate_passes gp
    JOIN public.profiles p ON p.id = gp.learner_id
    LEFT JOIN public.learners_profiles lp ON lp.id = p.learner_id
    LEFT JOIN public.departments d ON d.id = lp.department_id
    LEFT JOIN public.profiles ap ON ap.id = gp.approved_by
   WHERE (p_person_type IS NULL OR p_person_type = 'learner')
     AND COALESCE(gp.valid_date, (timezone('Asia/Kolkata', COALESCE(gp.out_time, gp.approved_at, gp.created_at)))::date) BETWEEN p_from AND p_to
     AND gp.status::text NOT IN ('requested', 'rejected')
     AND (p_institution_id IS NULL OR gp.institution_id = p_institution_id)
     AND (p_department_id IS NULL OR lp.department_id = p_department_id)
     AND (p_state IS NULL
          OR (p_state = 'outside'   AND gp.status::text IN ('active', 'overdue'))
          OR (p_state = 'completed' AND gp.status::text = 'returned'))
  UNION ALL
  SELECT 'staff'::text,
         trim(concat_ws(' ', s.first_name, s.last_name))::text, s.staff_id::text,
         d.department_name::text, s.designation::text,
         m.institution_id, NULL::uuid, sp.pass_number::text, sp.status::text, COALESCE(m.reason, sp.reason)::text,
         NULL::text,
         CASE WHEN m.direction = 'out' THEN m.recorded_at END,
         CASE WHEN m.direction = 'in'  THEN m.recorded_at END,
         m.movement_date,
         (CASE WHEN last_m.direction = 'out' THEN 'Outside' ELSE 'Inside' END)::text,
         m.id, m.reason_updated_at
    FROM public.gate_movements m
    JOIN public.staff s ON s.id = m.staff_id
    LEFT JOIN public.gate_staff_passes sp ON sp.id = m.staff_pass_id
    LEFT JOIN public.departments d ON d.id = s.department_id
    LEFT JOIN LATERAL (
      SELECT direction FROM public.gate_movements x
       WHERE x.staff_id = m.staff_id AND x.movement_date = m.movement_date
       ORDER BY x.recorded_at DESC LIMIT 1
    ) last_m ON true
   WHERE m.person_type = 'staff'
     AND (p_person_type IS NULL OR p_person_type = 'staff')
     AND m.movement_date BETWEEN p_from AND p_to
     AND (p_institution_id IS NULL OR m.institution_id = p_institution_id)
     AND (p_department_id IS NULL OR s.department_id = p_department_id)
     AND (p_state IS NULL
          OR (p_state = 'outside'   AND last_m.direction = 'out')
          OR (p_state = 'completed' AND last_m.direction = 'in'))
  ORDER BY 14 DESC, 12 DESC NULLS LAST, 13 DESC NULLS LAST;
END;
$$;
REVOKE ALL ON FUNCTION public.gate_in_out_report(date, date, text, uuid, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.gate_in_out_report(date, date, text, uuid, uuid, text) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────
-- 4. Verification
-- ────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.service_types WHERE slug = 'gate-pass' AND issues_gate_pass) THEN
    RAISE EXCEPTION 'gate-pass service type not seeded';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'gate_create_staff_pass') THEN
    RAISE EXCEPTION 'gate_create_staff_pass missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'gate_movements' AND column_name = 'staff_pass_id') THEN
    RAISE EXCEPTION 'gate_movements.staff_pass_id missing';
  END IF;
  RAISE NOTICE 'gate pass seed + staff passes verified';
END $$;

COMMIT;
