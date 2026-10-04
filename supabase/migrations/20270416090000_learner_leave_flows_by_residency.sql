-- Learner leave / on-duty approval flows become residency-aware.
--
-- Before: one flow per (leave type, institution). A "both" type could not route
-- a day scholar as HOD -> Principal and a hosteler as HOD -> Principal -> Chief
-- Warden, and the hostel-only types routed Warden -> Principal.
-- After:  learner_leave_flows.flow_residency ('day_scholar' | 'hostel' | NULL =
-- any). _fn_lo_seed_steps prefers the flow that matches the learner's
-- residency. Institution override still beats group default.
--
-- Standard chains seeded here (group default, every type):
--   day scholar : HOD (own department) -> Principal (own institution)
--   hosteler    : HOD (own department) -> Principal (own institution) -> Chief Warden (own institution)
-- Pending applications keep the chain frozen at submit time; only new
-- submissions use the new flows.

ALTER TABLE public.learner_leave_flows
  ADD COLUMN IF NOT EXISTS flow_residency text
  CONSTRAINT learner_leave_flows_flow_residency_check
    CHECK (flow_residency IN ('day_scholar', 'hostel'));

ALTER TABLE public.learner_leave_flows
  DROP CONSTRAINT IF EXISTS learner_leave_flows_type_inst_key;

ALTER TABLE public.learner_leave_flows
  ADD CONSTRAINT learner_leave_flows_type_inst_res_key
  UNIQUE NULLS NOT DISTINCT (leave_type_id, institution_id, flow_residency);

-- ---------------------------------------------------------------------------
-- fn_lo_save_flow: add the residency argument (drop the old signature so a
-- named-arg RPC call is never ambiguous).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_lo_save_flow(uuid, uuid, jsonb);

CREATE OR REPLACE FUNCTION public.fn_lo_save_flow(
  p_leave_type_id uuid,
  p_institution_id uuid,
  p_steps jsonb,
  p_residency text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_flow uuid;
  v_i    integer := 0;
  s      jsonb;
BEGIN
  IF NOT (SELECT public.user_has_permission('learners.leave_types.manage')) THEN
    RAISE EXCEPTION 'You do not have permission to manage leave approval flows' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(coalesce(p_steps, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Steps must be an array' USING ERRCODE = '22023';
  END IF;
  IF p_residency IS NOT NULL AND p_residency NOT IN ('day_scholar', 'hostel') THEN
    RAISE EXCEPTION 'Residency must be day_scholar or hostel' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_flow FROM public.learner_leave_flows
  WHERE leave_type_id = p_leave_type_id
    AND institution_id IS NOT DISTINCT FROM p_institution_id
    AND flow_residency IS NOT DISTINCT FROM p_residency;

  IF jsonb_array_length(coalesce(p_steps, '[]'::jsonb)) = 0 THEN
    IF v_flow IS NOT NULL THEN
      DELETE FROM public.learner_leave_flows WHERE id = v_flow;
    END IF;
    RETURN NULL;
  END IF;

  IF v_flow IS NULL THEN
    INSERT INTO public.learner_leave_flows (leave_type_id, institution_id, flow_residency, created_by)
    VALUES (p_leave_type_id, p_institution_id, p_residency, (SELECT auth.uid()))
    RETURNING id INTO v_flow;
  ELSE
    UPDATE public.learner_leave_flows SET is_active = true WHERE id = v_flow;
  END IF;

  DELETE FROM public.learner_leave_flow_steps WHERE flow_id = v_flow;

  FOR s IN SELECT * FROM jsonb_array_elements(p_steps) LOOP
    v_i := v_i + 1;
    INSERT INTO public.learner_leave_flow_steps (flow_id, step_order, role_id, scope)
    VALUES (v_flow, v_i, (s->>'role_id')::uuid, (s->>'scope')::public.learner_leave_step_scope);
  END LOOP;

  RETURN v_flow;
END
$function$;

REVOKE ALL ON FUNCTION public.fn_lo_save_flow(uuid, uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_lo_save_flow(uuid, uuid, jsonb, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- _fn_lo_seed_steps: pick the flow by learner residency.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._fn_lo_seed_steps(p_application_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_app   public.leave_onduty_applications%ROWTYPE;
  v_flow  uuid;
  v_block uuid;
  v_is_hostel boolean;
  v_n     integer := 0;
  s       record;
BEGIN
  SELECT * INTO v_app FROM public.leave_onduty_applications WHERE id = p_application_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found' USING ERRCODE = '42704';
  END IF;
  IF v_app.leave_type_id IS NULL THEN
    RAISE EXCEPTION 'Application has no leave type' USING ERRCODE = '22023';
  END IF;

  SELECT (
      EXISTS (SELECT 1 FROM public.learners_profiles lp
              JOIN public.accommodation_types at ON at.id = lp.accommodation_type_id
              WHERE lp.id = v_app.learner_id AND lower(at.name) = 'hostel')
      OR EXISTS (SELECT 1 FROM public.hostel_allocations ha
                 JOIN public.profiles p ON p.id = ha.learner_id
                 WHERE p.learner_id = v_app.learner_id AND ha.status = 'active')
    ) INTO v_is_hostel;

  -- Institution override beats group default; within that, the flow made for
  -- the learner's residency beats a residency-agnostic (NULL) one.
  SELECT f.id INTO v_flow
  FROM public.learner_leave_flows f
  WHERE f.leave_type_id = v_app.leave_type_id
    AND f.is_active
    AND (f.institution_id = v_app.institution_id OR f.institution_id IS NULL)
    AND (f.flow_residency IS NULL
         OR f.flow_residency = CASE WHEN v_is_hostel THEN 'hostel' ELSE 'day_scholar' END)
    AND EXISTS (SELECT 1 FROM public.learner_leave_flow_steps st WHERE st.flow_id = f.id)
  ORDER BY (f.institution_id IS NULL), (f.flow_residency IS NULL)
  LIMIT 1;

  IF v_flow IS NULL THEN
    RAISE EXCEPTION 'No approval flow is configured for this leave type. Please contact the office.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT ha.block_id INTO v_block
  FROM public.hostel_allocations ha
  JOIN public.profiles p ON p.id = ha.learner_id
  WHERE p.learner_id = v_app.learner_id AND ha.status = 'active'
  ORDER BY ha.allocation_date DESC
  LIMIT 1;

  FOR s IN
    SELECT st.role_id, st.scope,
           row_number() OVER (ORDER BY st.step_order)::int AS ord
    FROM public.learner_leave_flow_steps st
    WHERE st.flow_id = v_flow
    ORDER BY st.step_order
  LOOP
    IF s.scope = 'hostel_block' AND v_block IS NULL THEN
      RAISE EXCEPTION 'This leave type needs a hostel warden''s approval, but you have no active hostel allocation.'
        USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.leave_onduty_approvals
      (application_id, step_order, approver_id, approver_role, status,
       role_id, scope, scope_institution_id, scope_department_id, scope_block_id)
    VALUES
      (p_application_id, s.ord, NULL, NULL, 'pending',
       s.role_id, s.scope, v_app.institution_id, v_app.department_id,
       CASE WHEN s.scope = 'hostel_block' THEN v_block END);
    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END
$function$;

-- ---------------------------------------------------------------------------
-- Seed the standard chains. Group default (institution_id NULL) only — no
-- institution overrides existed. The old residency-agnostic defaults are
-- replaced so they cannot shadow the new ones.
-- ---------------------------------------------------------------------------
DO $seed$
DECLARE
  v_hod  uuid; v_principal uuid; v_chief uuid;
  t      record;
  v_flow uuid;
  v_res  text;
BEGIN
  SELECT id INTO v_hod       FROM public.custom_roles WHERE role_key = 'hod';
  SELECT id INTO v_principal FROM public.custom_roles WHERE role_key = 'principal';
  SELECT id INTO v_chief     FROM public.custom_roles WHERE role_key = 'chief_warden';
  IF v_hod IS NULL OR v_principal IS NULL OR v_chief IS NULL THEN
    RAISE EXCEPTION 'Missing role(s): hod=%, principal=%, chief_warden=%', v_hod, v_principal, v_chief;
  END IF;

  DELETE FROM public.learner_leave_flows
  WHERE institution_id IS NULL AND flow_residency IS NULL;

  FOR t IN SELECT id, residency::text AS residency FROM public.learner_leave_types LOOP
    FOREACH v_res IN ARRAY ARRAY['day_scholar', 'hostel'] LOOP
      IF t.residency <> 'both' AND t.residency <> v_res THEN
        CONTINUE;
      END IF;

      INSERT INTO public.learner_leave_flows (leave_type_id, institution_id, flow_residency)
      VALUES (t.id, NULL, v_res)
      ON CONFLICT ON CONSTRAINT learner_leave_flows_type_inst_res_key DO UPDATE SET is_active = true
      RETURNING id INTO v_flow;

      DELETE FROM public.learner_leave_flow_steps WHERE flow_id = v_flow;
      INSERT INTO public.learner_leave_flow_steps (flow_id, step_order, role_id, scope) VALUES
        (v_flow, 1, v_hod,       'own_department'),
        (v_flow, 2, v_principal, 'own_institution');
      IF v_res = 'hostel' THEN
        INSERT INTO public.learner_leave_flow_steps (flow_id, step_order, role_id, scope)
        VALUES (v_flow, 3, v_chief, 'own_institution');
      END IF;
    END LOOP;
  END LOOP;
END
$seed$;
