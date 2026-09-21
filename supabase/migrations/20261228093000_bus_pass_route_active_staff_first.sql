-- ============================================================================
-- Bus pass: an active staff member is routed as staff, even with a learner link
-- ============================================================================
-- Created: 2026-09-19
--
-- sync_bus_pass_to_learner_profile routed by profiles.learner_id first. A
-- graduate who later joined as staff keeps that old learner_id, so their
-- approved bus pass was written onto the graduated learner record and never
-- reached their staff record. Live on 2026-09-19: 5 staff-role profiles carry
-- a learner_id (e.g. MR.JASWANTH J — graduated NB21016, now active staff CNR015).
--
-- Only the routing order changes: an ACTIVE staff record (staff.profile_id =
-- requester, is_active) wins; otherwise the learner link; otherwise any staff
-- record — which is exactly the old behaviour for everyone without an active
-- staff record. Every guard and the signature are unchanged from
-- 20260602120100_sync_bus_pass_self_service_authz.sql. The form's display-only
-- Passenger Type field applies the same rule.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_bus_pass_to_learner_profile(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requester_id uuid;
  v_learner_id   uuid;
  v_staff_id     uuid;
  v_type_id      uuid;
  v_has_steps    boolean;
  v_form         jsonb;
  v_slug         text;
  v_status       text;
  v_route_id     uuid;
  v_stop_id      uuid;
BEGIN
  SELECT sr.requester_id, sr.form_data, sr.service_type_id, st.slug, sr.status::text
    INTO v_requester_id, v_form, v_type_id, v_slug, v_status
    FROM service_requests sr
    JOIN service_types st ON st.id = sr.service_type_id
   WHERE sr.id = p_request_id;

  IF v_requester_id IS NULL THEN
    RAISE NOTICE 'sync_bus_pass: request % not found', p_request_id; RETURN;
  END IF;

  IF v_slug <> 'transport-request' THEN
    RAISE NOTICE 'sync_bus_pass: request % is not a transport request (slug=%)', p_request_id, v_slug; RETURN;
  END IF;

  v_has_steps := EXISTS (SELECT 1 FROM service_request_approval_steps WHERE service_type_id = v_type_id);

  IF (public.is_super_admin() OR public.user_has_permission('service_requests.approve')) THEN
    IF v_status NOT IN ('approved', 'fulfilled') THEN
      RAISE EXCEPTION 'sync_bus_pass: request % is not approved (status=%)', p_request_id, v_status;
    END IF;
  ELSIF v_requester_id = auth.uid() AND NOT v_has_steps
        AND v_status IN ('submitted', 'approved', 'fulfilled') THEN
    NULL; -- self-service no-approval path
  ELSE
    RAISE EXCEPTION 'sync_bus_pass: not authorized' USING ERRCODE = '42501';
  END IF;

  BEGIN
    v_route_id := (v_form->>'bus_route')::uuid;
    v_stop_id  := (v_form->>'boarding_stop')::uuid;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'sync_bus_pass: bus_route/boarding_stop are not valid UUIDs for request %', p_request_id;
  END;

  IF v_route_id IS NULL OR v_stop_id IS NULL THEN
    RAISE EXCEPTION 'sync_bus_pass: missing route/stop for request %', p_request_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM tms_route WHERE id = v_route_id) THEN
    RAISE EXCEPTION 'sync_bus_pass: route % does not exist', v_route_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tms_route_stop WHERE id = v_stop_id AND route_id = v_route_id) THEN
    RAISE EXCEPTION 'sync_bus_pass: stop % does not belong to route %', v_stop_id, v_route_id;
  END IF;

  -- CHANGED 2026-09-19: an active staff record wins over a (possibly graduated)
  -- learner link.
  SELECT id INTO v_staff_id
    FROM staff
   WHERE profile_id = v_requester_id AND is_active = true
   LIMIT 1;
  IF v_staff_id IS NOT NULL THEN
    UPDATE staff
       SET bus_required=true, transport_route_id=v_route_id, transport_stop_id=v_stop_id, updated_at=now()
     WHERE id = v_staff_id;
    RAISE NOTICE 'sync_bus_pass: staff % set route=% stop=%', v_staff_id, v_route_id, v_stop_id;
    RETURN;
  END IF;

  SELECT learner_id INTO v_learner_id FROM profiles WHERE id = v_requester_id;
  IF v_learner_id IS NOT NULL THEN
    UPDATE learners_profiles
       SET bus_required=true, transport_route_id=v_route_id, transport_stop_id=v_stop_id, updated_at=now()
     WHERE id = v_learner_id;
    RAISE NOTICE 'sync_bus_pass: learner % set route=% stop=%', v_learner_id, v_route_id, v_stop_id;
    RETURN;
  END IF;

  SELECT id INTO v_staff_id FROM staff WHERE profile_id = v_requester_id;
  IF v_staff_id IS NOT NULL THEN
    UPDATE staff
       SET bus_required=true, transport_route_id=v_route_id, transport_stop_id=v_stop_id, updated_at=now()
     WHERE id = v_staff_id;
    RAISE NOTICE 'sync_bus_pass: staff % set route=% stop=%', v_staff_id, v_route_id, v_stop_id;
    RETURN;
  END IF;

  RAISE NOTICE 'sync_bus_pass: requester % is neither learner nor staff; skipping', v_requester_id;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_bus_pass_to_learner_profile(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.sync_bus_pass_to_learner_profile(uuid) TO authenticated;

COMMIT;
