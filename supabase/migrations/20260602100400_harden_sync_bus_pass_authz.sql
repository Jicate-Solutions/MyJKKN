-- SECURITY HARDENING for sync_bus_pass_to_learner_profile (supersedes 20260602100300).
--
-- The initial version was GRANTed to `authenticated` with no in-function checks,
-- so any logged-in user could call it directly on an un-approved request and flip
-- learners_profiles.bus_required — bypassing the Transport Head approval entirely
-- (and an IDOR vector against other learners). The function now self-authorizes:
--   1) caller must hold service_requests.approve (or be super admin), AND
--   2) the request must already be in 'approved'/'fulfilled' state.
-- Only the role-checked approval engine can produce that state, so these two
-- guards close the bypass while keeping the legitimate approval call working
-- (the approver invokes it under their own JWT).
CREATE OR REPLACE FUNCTION public.sync_bus_pass_to_learner_profile(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requester_id uuid;
  v_learner_id   uuid;
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
    RAISE NOTICE 'sync_bus_pass: request % not found', p_request_id;
    RETURN;
  END IF;

  IF v_slug <> 'transport-request' THEN
    RAISE NOTICE 'sync_bus_pass: request % is not a transport request (slug=%)', p_request_id, v_slug;
    RETURN;
  END IF;

  -- AUTHORIZATION: only an approver (or super admin) may trigger the sync, and
  -- only for a request that has actually been approved/fulfilled. Blocks a
  -- requester from self-approving their own bus pass by calling the RPC directly.
  IF NOT (public.is_super_admin() OR public.user_has_permission('service_requests.approve')) THEN
    RAISE EXCEPTION 'sync_bus_pass: not authorized' USING ERRCODE = '42501';
  END IF;

  IF v_status NOT IN ('approved', 'fulfilled') THEN
    RAISE EXCEPTION 'sync_bus_pass: request % is not approved (status=%)', p_request_id, v_status;
  END IF;

  SELECT learner_id INTO v_learner_id FROM profiles WHERE id = v_requester_id;
  IF v_learner_id IS NULL THEN
    RAISE NOTICE 'sync_bus_pass: requester % has no learner profile; skipping', v_requester_id;
    RETURN;
  END IF;

  -- For live lookup fields, form_data holds UUID strings.
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

  UPDATE learners_profiles
     SET bus_required       = true,
         transport_route_id = v_route_id,
         transport_stop_id  = v_stop_id,
         updated_at         = now()
   WHERE id = v_learner_id;

  RAISE NOTICE 'sync_bus_pass: learner % bus_required=true route=% stop=%', v_learner_id, v_route_id, v_stop_id;
END;
$$;
