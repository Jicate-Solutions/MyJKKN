-- ============================================================================
-- ai-rpc-meeting-bookings-pre-fix.sql                             (2026-09-26)
-- The LIVE body of public.ai_rpc_meeting_bookings, verbatim from
-- pg_get_functiondef on production (read-only, 2026-09-26), with its live ACL
-- (postgres, authenticated, service_role — no anon, no PUBLIC).
--   live md5(prosrc) = d6e4989b8923dfa57c340da538419118
-- Loaded into the local stub as the CONTROL before 20270402110000 is applied.
-- NEVER run against production.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ai_rpc_meeting_bookings(p_user_id uuid, p_status text DEFAULT NULL::text, p_date_from text DEFAULT NULL::text, p_date_to text DEFAULT NULL::text, p_limit integer DEFAULT 10000, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '10s'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_super boolean; v_inst uuid; v_all boolean; v_ok boolean; v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success',false,'data','[]'::jsonb,
    'metadata',jsonb_build_object('total_count',0,'returned_count',0,'has_more',false),
    'actions_available','[]'::jsonb,'error',jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.')); END IF;
  SELECT COALESCE(is_super_admin,false), institution_id INTO v_super, v_inst FROM profiles WHERE id = v_uid;
  v_ok := COALESCE(v_super,false) OR EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON cr.id=ur.role_id
            WHERE ur.user_id=v_uid AND COALESCE(cr.is_active,true)
              AND lower(COALESCE(cr.permissions->>'meetings.view','')) IN ('true','t','1'));
  IF NOT COALESCE(v_ok,false) THEN RETURN jsonb_build_object('success',false,'data','[]'::jsonb,
    'metadata',jsonb_build_object('total_count',0,'returned_count',0,'has_more',false),'actions_available','[]'::jsonb,
    'error',jsonb_build_object('code','FORBIDDEN','message','Needs meetings.view to view meeting bookings.')); END IF;
  -- cross-institution ONLY via a role that grants THIS permission AND is scope='all'
  -- (permission+scope must come from the SAME role — deep-review r3 decoupling fix)
  v_all := COALESCE(v_super,false) OR EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON cr.id=ur.role_id
            WHERE ur.user_id=v_uid AND COALESCE(cr.is_active,true) AND cr.institution_scope='all'
              AND lower(COALESCE(cr.permissions->>'meetings.view','')) IN ('true','t','1'));
  WITH base AS (
    SELECT b.id, b.attendee_name, b.attendee_email, mt.display_name AS meeting_type, b.start_time, b.end_time, b.status
    FROM meeting_bookings b
    LEFT JOIN jicate_booking_meeting_types mt ON mt.id = b.meeting_type_id
    WHERE (v_all OR b.institution_id = v_inst)
      AND (p_status IS NULL OR b.status::text = p_status)
      AND (p_date_from IS NULL OR trim(p_date_from) !~ '^\d{4}-\d{2}-\d{2}$' OR (b.start_time AT TIME ZONE 'Asia/Kolkata')::date >= (CASE WHEN trim(p_date_from) ~ '^\d{4}-\d{2}-\d{2}$' THEN trim(p_date_from)::date END))
      AND (p_date_to IS NULL OR trim(p_date_to) !~ '^\d{4}-\d{2}-\d{2}$' OR (b.start_time AT TIME ZONE 'Asia/Kolkata')::date <= (CASE WHEN trim(p_date_to) ~ '^\d{4}-\d{2}-\d{2}$' THEN trim(p_date_to)::date END)))
  , paged AS (SELECT * FROM base ORDER BY start_time DESC, id DESC LIMIT GREATEST(p_limit,0) OFFSET GREATEST(p_offset,0))
  SELECT jsonb_build_object('success',true,'data',COALESCE((SELECT jsonb_agg(row_to_json(p)::jsonb) FROM paged p),'[]'::jsonb),
    'metadata',jsonb_build_object('total_count',(SELECT COUNT(*) FROM base),'returned_count',(SELECT COUNT(*) FROM paged),
      'has_more',(SELECT COUNT(*) FROM base) > (GREATEST(p_offset,0)+(SELECT COUNT(*) FROM paged))),
    'actions_available','[]'::jsonb) INTO v_result;
  RETURN v_result;
END; $function$;

REVOKE ALL ON FUNCTION public.ai_rpc_meeting_bookings(uuid,text,text,text,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_rpc_meeting_bookings(uuid,text,text,text,integer,integer) TO authenticated, service_role;
