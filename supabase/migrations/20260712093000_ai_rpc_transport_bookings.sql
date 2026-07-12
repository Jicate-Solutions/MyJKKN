-- =====================================================================
-- AI Query tool: transport bookings (first child-app wiring)
-- Migration: 2026-07-12
-- =====================================================================
-- Wires the Transport app (tmsadmin.jkkn.ai) into the AI Assistant. Like the
-- other 59 ai_rpc_* tools it is SECURITY DEFINER + returns the standard
-- {success,data,metadata,actions_available} envelope, BUT the access gate is
-- the TRANSPORT permission model, not the academic one:
--   * super_admin bypass, OR user_has_permission('tms.bookings.view_all')
--     — the exact key the transport admin app uses (custom_roles.permissions),
--       matching fn tms_users_with_permission('tms.bookings.view_all').
--   * NO institution scoping: tms_route has no institution_id — buses serve
--     every college, so bookings are a shared, cross-institution resource.
--     Applying role_has_institution_access here would wrongly blank the data.
-- Read-only: SELECT only, no writes. anon EXECUTE revoked (standing rule).

CREATE OR REPLACE FUNCTION public.ai_rpc_transport_bookings(
  p_user_id     uuid,
  p_learner_id  uuid    DEFAULT NULL,
  p_route_id    uuid    DEFAULT NULL,
  p_date_from   text    DEFAULT NULL,
  p_date_to     text    DEFAULT NULL,
  p_limit       integer DEFAULT 10000,
  p_offset      integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_is_super  boolean;
  v_allowed   boolean;
  v_result    jsonb;
BEGIN
  SELECT COALESCE(is_super_admin, false) INTO v_is_super
  FROM profiles WHERE id = p_user_id;

  v_allowed := COALESCE(v_is_super, false) OR EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN custom_roles cr ON cr.id = ur.role_id
    WHERE ur.user_id = p_user_id
      AND COALESCE(cr.is_active, true) = true
      AND COALESCE((cr.permissions ->> 'tms.bookings.view_all')::boolean, false) = true
  );

  IF NOT v_allowed THEN
    RETURN jsonb_build_object(
      'success', false,
      'data', '[]'::jsonb,
      'metadata', jsonb_build_object('total_count', 0, 'returned_count', 0, 'has_more', false),
      'actions_available', '[]'::jsonb,
      'error', jsonb_build_object(
        'code', 'FORBIDDEN',
        'message', 'You do not have permission to view transport bookings (needs tms.bookings.view_all).'
      )
    );
  END IF;

  WITH bookings AS (
    SELECT b.travel_date,
           b.booked_at,
           lp.first_name, lp.last_name, lp.roll_number,
           r.route_number, r.route_name,
           st.stop_name
    FROM tms_booking b
    LEFT JOIN learners_profiles lp ON lp.id = b.learner_id
    LEFT JOIN tms_route         r  ON r.id  = b.route_id
    LEFT JOIN tms_route_stop    st ON st.id = b.stop_id
    WHERE (p_learner_id IS NULL OR b.learner_id = p_learner_id)
      AND (p_route_id   IS NULL OR b.route_id   = p_route_id)
      AND (p_date_from  IS NULL OR b.travel_date >= p_date_from::date)
      AND (p_date_to    IS NULL OR b.travel_date <= p_date_to::date)
    ORDER BY b.travel_date DESC, b.booked_at DESC
    LIMIT GREATEST(p_limit, 0) OFFSET GREATEST(p_offset, 0)
  )
  SELECT jsonb_build_object(
    'success', true,
    'data', COALESCE(jsonb_agg(row_to_json(x)::jsonb), '[]'::jsonb),
    'metadata', jsonb_build_object(
      'total_count',    (SELECT COUNT(*) FROM bookings),
      'returned_count', (SELECT COUNT(*) FROM bookings),
      'has_more', false
    ),
    'actions_available', '[]'::jsonb
  ) INTO v_result
  FROM bookings x;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ai_rpc_transport_bookings(uuid, uuid, uuid, text, text, integer, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_transport_bookings(uuid, uuid, uuid, text, text, integer, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
