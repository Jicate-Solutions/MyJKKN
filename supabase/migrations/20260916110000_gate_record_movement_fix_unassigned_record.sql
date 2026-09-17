-- ============================================================================
-- 2026-09-16 — gate_record_movement: fix "record v_sp is not assigned yet"
--
-- ⚠️ NOT APPLIED — FILE ONLY. Apply after 20260916100000 (already live).
--
-- A scan on the personal 'GS:' QR with no staff_pass_id reached
-- `IF v_sp.id IS NULL` before any SELECT INTO had assigned the record, which
-- PL/pgSQL rejects with 55000. Scalar variables (v_sp_id / v_sp_reason) are
-- NULL until set, so the same logic reads cleanly. 20260916100000 in the repo
-- carries the same fix for fresh databases.
-- ============================================================================

BEGIN;

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


COMMIT;
