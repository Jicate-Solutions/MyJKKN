-- ============================================================================
-- Gate Pass / Gate Outpass: an active staff member is a team member, even with
-- an old learner link
-- ============================================================================
-- Created: 2026-09-19
--
-- issue_gate_pass_for_service_request decided learner vs team member by
-- profiles.learner_id alone. A graduate who later joined as staff keeps that
-- learner_id, so their Gate Pass / Gate Outpass request took the LEARNER path:
-- it waited for approval and then issued a hostel_gate_passes row (learner QR)
-- on the graduated learner record — nothing reached their staff QR
-- ('GS:<staff.id>', which reads gate_staff_passes). Live on 2026-09-19: 5
-- active staff carry a learner_id, all graduated.
--
-- Only two lines change from 20260916100001 (section 3e):
--   * the learner lookup is skipped when the requester has an ACTIVE staff
--     record (staff.profile_id = requester, is_active);
--   * the team-member lookup prefers the active staff record.
-- Everyone without an active staff record behaves exactly as before. Guards,
-- signature and grants are unchanged. lib/services/service-requests/
-- service-request-service.ts (issueStaffGatePassOnSubmit) and the /gate-pass
-- page apply the same rule.
-- ============================================================================

BEGIN;

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

  -- CHANGED 2026-09-19: an ACTIVE team-member record wins over a learner link.
  -- A graduate who joined as staff keeps their old profiles.learner_id; without
  -- this guard their pass went onto the graduated learner record (approval
  -- required, learner QR) instead of an instant staff pass on their staff QR.
  SELECT lp.id, lp.institution_id INTO v_learner
    FROM public.profiles p JOIN public.learners_profiles lp ON lp.id = p.learner_id
   WHERE p.id = v_req.requester_id
     AND NOT EXISTS (SELECT 1 FROM public.staff s
                      WHERE s.profile_id = v_req.requester_id AND s.is_active = true);

  -- ── Team member: pass at submit time, approval never blocks ──────────
  IF v_learner.id IS NULL THEN
    SELECT COALESCE(
      -- CHANGED 2026-09-19: prefer the active record when a profile has several
      (SELECT s.id FROM public.staff s WHERE s.profile_id = v_req.requester_id
        ORDER BY s.is_active DESC NULLS LAST LIMIT 1),
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

REVOKE EXECUTE ON FUNCTION public.issue_gate_pass_for_service_request(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_gate_pass_for_service_request(uuid) TO authenticated;

COMMIT;
