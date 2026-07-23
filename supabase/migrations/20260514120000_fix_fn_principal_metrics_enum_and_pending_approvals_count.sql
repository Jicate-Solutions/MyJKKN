-- Fix fn_principal_metrics: two related bugs.
--
-- Bug 1: status NOT IN ('resolved','closed') casts 'resolved' to
--        incident_status_enum which only contains
--        (reported, under_investigation, action_taken, closed, reopened).
--        Runtime throw: invalid input value for enum incident_status_enum: "resolved".
--        Live enum has no 'resolved' -- 'closed' is the only terminal state.
--
-- Bug 2: pending_approvals counted user_notifications.requires_acknowledgment
--        rows, NOT service-request approvals waiting on the caller. A Principal
--        with 2 Nursing Bonafide rows on their desk saw pending_approvals=0.
--        Rewire the count to service_requests:
--          - status in ('submitted','in_review')
--          - at the principal's own institution
--          - at the current step, where EITHER approver_role matches the
--            caller's profile.role OR auth.uid() is in approver_user_ids
--        This matches the predicate the inbox uses, so the tile count and the
--        inbox row count agree by construction. Every principal gets a true
--        "approvals on my desk" count for their own institution by default.
--
-- Applied via MCP apply_migration on 2026-05-14.

CREATE OR REPLACE FUNCTION public.fn_principal_metrics()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_role text;
  v_institution_id uuid;
  v_today date;
  v_ohs_score int := 0;
  v_ohs_band text := 'red';
  v_ohs_components jsonb := '{}'::jsonb;
  v_incidents_today int := 0;
  v_incidents_open int := 0;
  v_pending_approvals int := 0;
  v_dashboard_data jsonb;
BEGIN
  v_today := (CURRENT_DATE AT TIME ZONE 'Asia/Kolkata')::date;

  SELECT institution_id, role
    INTO v_institution_id, v_user_role
  FROM profiles WHERE id = v_user_id;

  IF v_institution_id IS NULL THEN
    RETURN jsonb_build_object(
      'health_score',     jsonb_build_object('score',0,'band','red','components','{}'::jsonb,'data_source','no_institution'),
      'staff_attendance', jsonb_build_object('present',0,'total',0,'pct',0,'data_source','not_available'),
      'incidents',        jsonb_build_object('today_count',0,'open_count',0,'data_source','no_institution'),
      'pending_approvals',jsonb_build_object('count',0,'data_source','no_institution'),
      'scope',            jsonb_build_object('user_id',v_user_id,'institution_id',NULL,'computed_at',now())
    );
  END IF;

  BEGIN
    v_dashboard_data := fn_dashboard_metrics(v_institution_id);
    v_ohs_score      := COALESCE((v_dashboard_data->'ohs'->>'score')::int, 0);
    v_ohs_band       := COALESCE(v_dashboard_data->'ohs'->>'band', 'red');
    v_ohs_components := COALESCE(v_dashboard_data->'ohs'->'components', '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    v_ohs_score := 0; v_ohs_band := 'red'; v_ohs_components := '{}'::jsonb;
  END;

  SELECT
    COUNT(*) FILTER (WHERE incident_date::date = v_today),
    COUNT(*) FILTER (WHERE status <> 'closed'::incident_status_enum)
  INTO v_incidents_today, v_incidents_open
  FROM hostel_incidents
  WHERE institution_id = v_institution_id;

  SELECT COUNT(*) INTO v_pending_approvals
  FROM service_requests sr
  WHERE sr.institution_id = v_institution_id
    AND sr.status IN ('submitted','in_review')
    AND EXISTS (
      SELECT 1
      FROM service_request_approval_steps s
      WHERE s.service_type_id = sr.service_type_id
        AND s.step_order      = sr.current_approval_step
        AND (
          s.approver_role = v_user_role
          OR v_user_id = ANY(s.approver_user_ids)
        )
    );

  RETURN jsonb_build_object(
    'health_score',     jsonb_build_object('score',v_ohs_score,'band',v_ohs_band,'components',v_ohs_components),
    'staff_attendance', jsonb_build_object('present',0,'total',0,'pct',0,'data_source','not_available'),
    'incidents',        jsonb_build_object('today_count',v_incidents_today,'open_count',v_incidents_open),
    'pending_approvals',jsonb_build_object('count',v_pending_approvals),
    'scope',            jsonb_build_object('user_id',v_user_id,'institution_id',v_institution_id,'computed_at',now())
  );
END;
$function$;
