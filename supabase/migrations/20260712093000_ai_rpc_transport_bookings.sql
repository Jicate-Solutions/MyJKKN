-- =====================================================================
-- AI Query tool: transport bookings (first child-app wiring)
-- Migration: 2026-07-12  (hardened same day after deep-review)
-- =====================================================================
-- Wires the Transport app (tmsadmin.jkkn.ai) into the AI Assistant.
--
-- SECURITY (deep-review CRITICAL fix): identity is derived from auth.uid(),
-- NOT the caller-supplied p_user_id. The 65 legacy ai_rpc_* tools trust
-- p_user_id, which is a confused-deputy hole — any authenticated caller could
-- pass a privileged uuid and bypass the gate. This function (and its 6
-- child-app siblings) ignore p_user_id for authz and gate on the JWT identity.
-- p_user_id stays in the signature only so the existing service call shape
-- (executeTool always sends p_user_id) still resolves.
--
-- Gate: super_admin OR the 'tms.bookings.view_all' key. tms_route has no
-- institution_id, so rows scope by the LEARNER's institution — a college-scoped
-- role sees only its own learners' bookings; only super_admin or a role that
-- grants this key AND is institution_scope='all' sees every college.
-- Read-only; anon EXECUTE revoked.

CREATE OR REPLACE FUNCTION public.ai_rpc_transport_bookings(
  p_user_id     uuid,                       -- IGNORED for authz (see header); identity = auth.uid()
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
SET statement_timeout = '10s'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_super  boolean;
  v_inst   uuid;
  v_all    boolean;   -- caller sees ALL institutions (super_admin or any role scope='all')
  v_ok     boolean;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'data', '[]'::jsonb,
      'metadata', jsonb_build_object('total_count',0,'returned_count',0,'has_more',false),
      'actions_available','[]'::jsonb,
      'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;

  SELECT COALESCE(is_super_admin, false), institution_id INTO v_super, v_inst FROM profiles WHERE id = v_uid;
  v_ok := COALESCE(v_super, false) OR EXISTS (
    SELECT 1 FROM user_roles ur JOIN custom_roles cr ON cr.id = ur.role_id
    WHERE ur.user_id = v_uid AND COALESCE(cr.is_active, true)
      AND lower(COALESCE(cr.permissions ->> 'tms.bookings.view_all', '')) IN ('true','t','1'));

  IF NOT COALESCE(v_ok, false) THEN
    RETURN jsonb_build_object('success', false, 'data', '[]'::jsonb,
      'metadata', jsonb_build_object('total_count',0,'returned_count',0,'has_more',false),
      'actions_available','[]'::jsonb,
      'error', jsonb_build_object('code','FORBIDDEN','message','You do not have permission to view transport bookings (needs tms.bookings.view_all).'));
  END IF;

  -- Cross-institution ONLY via a role that grants tms.bookings.view_all AND is
  -- scope='all' (permission+scope from the SAME role — deep-review r3 fix).
  -- tms_booking/route carry no institution, so otherwise scope by the LEARNER's
  -- institution — a college-scoped role sees only its own learners' bookings.
  v_all := COALESCE(v_super, false) OR EXISTS (
    SELECT 1 FROM user_roles ur JOIN custom_roles cr ON cr.id = ur.role_id
    WHERE ur.user_id = v_uid AND COALESCE(cr.is_active, true) AND cr.institution_scope = 'all'
      AND lower(COALESCE(cr.permissions ->> 'tms.bookings.view_all', '')) IN ('true','t','1'));

  WITH base AS (
    SELECT b.ctid AS _rowid, b.travel_date, b.booked_at,
           lp.first_name, lp.last_name, lp.roll_number,
           r.route_number, r.route_name, st.stop_name
    FROM tms_booking b
    LEFT JOIN learners_profiles lp ON lp.id = b.learner_id
    LEFT JOIN tms_route         r  ON r.id  = b.route_id
    LEFT JOIN tms_route_stop    st ON st.id = b.stop_id
    WHERE (v_all OR lp.institution_id = v_inst)
      AND (p_learner_id IS NULL OR b.learner_id = p_learner_id)
      AND (p_route_id   IS NULL OR b.route_id   = p_route_id)
      AND (p_date_from IS NULL OR trim(p_date_from) !~ '^\d{4}-\d{2}-\d{2}$' OR b.travel_date >= trim(p_date_from)::date)
      AND (p_date_to IS NULL OR trim(p_date_to) !~ '^\d{4}-\d{2}-\d{2}$' OR b.travel_date <= trim(p_date_to)::date)
  ),
  paged AS (
    -- tms_booking has no primary key; ORDER BY a composite of its natural
    -- columns as a stable tiebreaker for deterministic LIMIT/OFFSET paging.
    SELECT * FROM base
    ORDER BY travel_date DESC, booked_at DESC, roll_number, route_number, stop_name, _rowid
    LIMIT GREATEST(p_limit, 0) OFFSET GREATEST(p_offset, 0)
  )
  SELECT jsonb_build_object(
    'success', true,
    -- strip the internal ctid tiebreaker from the output rows
    'data', COALESCE((SELECT jsonb_agg((row_to_json(p)::jsonb) - '_rowid') FROM paged p), '[]'::jsonb),
    'metadata', jsonb_build_object(
      'total_count',    (SELECT COUNT(*) FROM base),
      'returned_count', (SELECT COUNT(*) FROM paged),
      'has_more',       (SELECT COUNT(*) FROM base) > (GREATEST(p_offset,0) + (SELECT COUNT(*) FROM paged))
    ),
    'actions_available', '[]'::jsonb
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ai_rpc_transport_bookings(uuid, uuid, uuid, text, text, integer, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_transport_bookings(uuid, uuid, uuid, text, text, integer, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
