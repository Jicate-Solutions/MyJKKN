-- Extend the bus-pass sync RPC to route by the requester's REAL identity:
-- learner (profiles.learner_id) -> learners_profiles, else staff (staff.profile_id) -> staff.
-- Keeps the security guards (caller must hold service_requests.approve / be super admin,
-- AND the request must be approved/fulfilled). Routing is by identity, NOT by the
-- display-only form_data.passenger_type, so a tampered field can't misroute the write.
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
  v_form         jsonb;
  v_slug         text;
  v_status       text;
  v_route_id     uuid;
  v_stop_id      uuid;
BEGIN
  SELECT sr.requester_id, sr.form_data, st.slug, sr.status::text
    INTO v_requester_id, v_form, v_slug, v_status
    FROM service_requests sr
    JOIN service_types st ON st.id = sr.service_type_id
   WHERE sr.id = p_request_id;

  IF v_requester_id IS NULL THEN
    RAISE NOTICE 'sync_bus_pass: request % not found', p_request_id; RETURN;
  END IF;

  IF v_slug <> 'transport-request' THEN
    RAISE NOTICE 'sync_bus_pass: request % is not a transport request (slug=%)', p_request_id, v_slug; RETURN;
  END IF;

  IF NOT (public.is_super_admin() OR public.user_has_permission('service_requests.approve')) THEN
    RAISE EXCEPTION 'sync_bus_pass: not authorized' USING ERRCODE = '42501';
  END IF;

  IF v_status NOT IN ('approved', 'fulfilled') THEN
    RAISE EXCEPTION 'sync_bus_pass: request % is not approved (status=%)', p_request_id, v_status;
  END IF;

  -- form_data holds UUID strings for the live lookup fields.
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

  -- Route by real identity. Learner takes priority over staff.
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
