-- On final Bus Pass approval, write the chosen route/stop onto the learner's profile
-- so the TMS app can read who needs a bus (learners_profiles.bus_required = true).
-- SECURITY DEFINER because the approver (transport_head) cannot UPDATE arbitrary
-- learners_profiles rows under RLS. Student-only by design: a requester with no
-- profiles.learner_id is a graceful no-op.
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
  v_route_id     uuid;
  v_stop_id      uuid;
BEGIN
  SELECT sr.requester_id, sr.form_data, st.slug
    INTO v_requester_id, v_form, v_slug
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

REVOKE ALL ON FUNCTION public.sync_bus_pass_to_learner_profile(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.sync_bus_pass_to_learner_profile(uuid) TO authenticated;
