-- =====================================================================
-- AI Query tools: 6 more child apps (mess, hostel, meeting rooms, CDC,
--                 events, health) — completes the child-app wiring
-- Migration: 2026-07-12
-- =====================================================================
-- Same shape as ai_rpc_transport_bookings and the other 59 ai_rpc_* tools:
-- SECURITY DEFINER, STABLE, read-only, {success,data,metadata} envelope,
-- anon EXECUTE revoked. Each gate uses its OWN app's permission key
-- (custom_roles.permissions, mirroring how that child app gates itself):
--
--   mess     campus_living.mess.meals.view        institution-scoped
--   hostel   campus_living.allocations.view       institution-scoped
--   meeting  meetings.view                        institution-scoped
--   events   events.view                          institution-scoped
--   cdc      cdc.drives.view                      cross-institution*
--   health   health.programs.view                 scoped via parent program
--
-- * CDC placement drives are cross-institution by design (recruiters visit
--   for all colleges) and the attendance table has no institution_id — so,
--   like transport buses, access is permission-gated but not tenant-scoped.
--   Institution-scoped tables scope rows to the caller's own institution
--   unless super_admin (matches the existing ai_rpc_* academic tools).
-- =====================================================================

-- ── MESS: meal bookings ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ai_rpc_mess_bookings(
  p_user_id uuid, p_learner_id uuid DEFAULT NULL, p_meal_type text DEFAULT NULL,
  p_date_from text DEFAULT NULL, p_date_to text DEFAULT NULL,
  p_limit integer DEFAULT 10000, p_offset integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_super boolean; v_inst uuid; v_ok boolean; v_result jsonb;
BEGIN
  SELECT COALESCE(is_super_admin,false), institution_id INTO v_super, v_inst FROM profiles WHERE id = p_user_id;
  v_ok := v_super OR EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON cr.id=ur.role_id
            WHERE ur.user_id=p_user_id AND COALESCE(cr.is_active,true)
              AND COALESCE((cr.permissions->>'campus_living.mess.meals.view')::boolean,false));
  IF NOT v_ok THEN RETURN jsonb_build_object('success',false,'data','[]'::jsonb,
    'metadata',jsonb_build_object('total_count',0,'returned_count',0,'has_more',false),
    'actions_available','[]'::jsonb,
    'error',jsonb_build_object('code','FORBIDDEN','message','Needs campus_living.mess.meals.view to view mess bookings.')); END IF;
  WITH rows AS (
    SELECT b.date AS meal_date, b.meal_type, b.status, b.is_opt_out,
           lp.first_name, lp.last_name, lp.roll_number
    FROM mess_meal_bookings b LEFT JOIN learners_profiles lp ON lp.id = b.learner_id
    WHERE (v_super OR b.institution_id = v_inst)
      AND (p_learner_id IS NULL OR b.learner_id = p_learner_id)
      AND (p_meal_type IS NULL OR b.meal_type::text = p_meal_type)
      AND (p_date_from IS NULL OR b.date >= p_date_from::date)
      AND (p_date_to IS NULL OR b.date <= p_date_to::date)
    ORDER BY b.date DESC LIMIT GREATEST(p_limit,0) OFFSET GREATEST(p_offset,0))
  SELECT jsonb_build_object('success',true,'data',COALESCE(jsonb_agg(row_to_json(x)::jsonb),'[]'::jsonb),
    'metadata',jsonb_build_object('total_count',(SELECT COUNT(*) FROM rows),'returned_count',(SELECT COUNT(*) FROM rows),'has_more',false),
    'actions_available','[]'::jsonb) INTO v_result FROM rows x;
  RETURN v_result;
END; $fn$;
REVOKE EXECUTE ON FUNCTION public.ai_rpc_mess_bookings(uuid,uuid,text,text,text,integer,integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_mess_bookings(uuid,uuid,text,text,text,integer,integer) TO authenticated;

-- ── HOSTEL: room allocations (who lives where) ────────────────────────────────
CREATE OR REPLACE FUNCTION public.ai_rpc_hostel_allocations(
  p_user_id uuid, p_learner_id uuid DEFAULT NULL, p_status text DEFAULT NULL,
  p_limit integer DEFAULT 10000, p_offset integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_super boolean; v_inst uuid; v_ok boolean; v_result jsonb;
BEGIN
  SELECT COALESCE(is_super_admin,false), institution_id INTO v_super, v_inst FROM profiles WHERE id = p_user_id;
  v_ok := v_super OR EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON cr.id=ur.role_id
            WHERE ur.user_id=p_user_id AND COALESCE(cr.is_active,true)
              AND COALESCE((cr.permissions->>'campus_living.allocations.view')::boolean,false));
  IF NOT v_ok THEN RETURN jsonb_build_object('success',false,'data','[]'::jsonb,
    'metadata',jsonb_build_object('total_count',0,'returned_count',0,'has_more',false),
    'actions_available','[]'::jsonb,
    'error',jsonb_build_object('code','FORBIDDEN','message','Needs campus_living.allocations.view to view hostel allocations.')); END IF;
  WITH rows AS (
    SELECT lp.first_name, lp.last_name, lp.roll_number,
           blk.name AS block_name, rm.room_number,
           a.allocation_date, a.status, a.fee_status
    FROM hostel_allocations a
    LEFT JOIN learners_profiles lp ON lp.id = a.learner_id
    LEFT JOIN hostel_blocks blk ON blk.id = a.block_id
    LEFT JOIN hostel_rooms rm ON rm.id = a.room_id
    WHERE (v_super OR a.institution_id = v_inst)
      AND (p_learner_id IS NULL OR a.learner_id = p_learner_id)
      AND (p_status IS NULL OR a.status::text = p_status)
    ORDER BY a.allocation_date DESC LIMIT GREATEST(p_limit,0) OFFSET GREATEST(p_offset,0))
  SELECT jsonb_build_object('success',true,'data',COALESCE(jsonb_agg(row_to_json(x)::jsonb),'[]'::jsonb),
    'metadata',jsonb_build_object('total_count',(SELECT COUNT(*) FROM rows),'returned_count',(SELECT COUNT(*) FROM rows),'has_more',false),
    'actions_available','[]'::jsonb) INTO v_result FROM rows x;
  RETURN v_result;
END; $fn$;
REVOKE EXECUTE ON FUNCTION public.ai_rpc_hostel_allocations(uuid,uuid,text,integer,integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_hostel_allocations(uuid,uuid,text,integer,integer) TO authenticated;

-- ── MEETING ROOMS: meeting/appointment bookings ───────────────────────────────
CREATE OR REPLACE FUNCTION public.ai_rpc_meeting_bookings(
  p_user_id uuid, p_status text DEFAULT NULL,
  p_date_from text DEFAULT NULL, p_date_to text DEFAULT NULL,
  p_limit integer DEFAULT 10000, p_offset integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_super boolean; v_inst uuid; v_ok boolean; v_result jsonb;
BEGIN
  SELECT COALESCE(is_super_admin,false), institution_id INTO v_super, v_inst FROM profiles WHERE id = p_user_id;
  v_ok := v_super OR EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON cr.id=ur.role_id
            WHERE ur.user_id=p_user_id AND COALESCE(cr.is_active,true)
              AND COALESCE((cr.permissions->>'meetings.view')::boolean,false));
  IF NOT v_ok THEN RETURN jsonb_build_object('success',false,'data','[]'::jsonb,
    'metadata',jsonb_build_object('total_count',0,'returned_count',0,'has_more',false),
    'actions_available','[]'::jsonb,
    'error',jsonb_build_object('code','FORBIDDEN','message','Needs meetings.view to view meeting bookings.')); END IF;
  WITH rows AS (
    SELECT b.attendee_name, b.attendee_email, mt.display_name AS meeting_type,
           b.start_time, b.end_time, b.status
    FROM meeting_bookings b
    LEFT JOIN jicate_booking_meeting_types mt ON mt.id = b.meeting_type_id
    WHERE (v_super OR b.institution_id = v_inst)
      AND (p_status IS NULL OR b.status::text = p_status)
      AND (p_date_from IS NULL OR b.start_time >= p_date_from::timestamptz)
      AND (p_date_to IS NULL OR b.start_time <= p_date_to::timestamptz)
    ORDER BY b.start_time DESC LIMIT GREATEST(p_limit,0) OFFSET GREATEST(p_offset,0))
  SELECT jsonb_build_object('success',true,'data',COALESCE(jsonb_agg(row_to_json(x)::jsonb),'[]'::jsonb),
    'metadata',jsonb_build_object('total_count',(SELECT COUNT(*) FROM rows),'returned_count',(SELECT COUNT(*) FROM rows),'has_more',false),
    'actions_available','[]'::jsonb) INTO v_result FROM rows x;
  RETURN v_result;
END; $fn$;
REVOKE EXECUTE ON FUNCTION public.ai_rpc_meeting_bookings(uuid,text,text,text,integer,integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_meeting_bookings(uuid,text,text,text,integer,integer) TO authenticated;

-- ── CDC: placement-drive attendance (cross-institution) ───────────────────────
CREATE OR REPLACE FUNCTION public.ai_rpc_cdc_drive_attendance(
  p_user_id uuid, p_learner_id uuid DEFAULT NULL, p_drive_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 10000, p_offset integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_super boolean; v_ok boolean; v_result jsonb;
BEGIN
  SELECT COALESCE(is_super_admin,false) INTO v_super FROM profiles WHERE id = p_user_id;
  v_ok := v_super OR EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON cr.id=ur.role_id
            WHERE ur.user_id=p_user_id AND COALESCE(cr.is_active,true)
              AND COALESCE((cr.permissions->>'cdc.drives.view')::boolean,false));
  IF NOT v_ok THEN RETURN jsonb_build_object('success',false,'data','[]'::jsonb,
    'metadata',jsonb_build_object('total_count',0,'returned_count',0,'has_more',false),
    'actions_available','[]'::jsonb,
    'error',jsonb_build_object('code','FORBIDDEN','message','Needs cdc.drives.view to view placement-drive attendance.')); END IF;
  WITH rows AS (
    SELECT lp.first_name, lp.last_name, lp.roll_number,
           dr.title AS drive_title, a.round_no, a.round_type, a.attended, a.no_show_reason
    FROM cdc_drive_attendance a
    LEFT JOIN learners_profiles lp ON lp.id = a.learner_id
    LEFT JOIN cdc_drives dr ON dr.id = a.drive_id
    WHERE (p_learner_id IS NULL OR a.learner_id = p_learner_id)
      AND (p_drive_id IS NULL OR a.drive_id = p_drive_id)
    ORDER BY a.created_at DESC LIMIT GREATEST(p_limit,0) OFFSET GREATEST(p_offset,0))
  SELECT jsonb_build_object('success',true,'data',COALESCE(jsonb_agg(row_to_json(x)::jsonb),'[]'::jsonb),
    'metadata',jsonb_build_object('total_count',(SELECT COUNT(*) FROM rows),'returned_count',(SELECT COUNT(*) FROM rows),'has_more',false),
    'actions_available','[]'::jsonb) INTO v_result FROM rows x;
  RETURN v_result;
END; $fn$;
REVOKE EXECUTE ON FUNCTION public.ai_rpc_cdc_drive_attendance(uuid,uuid,uuid,integer,integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_cdc_drive_attendance(uuid,uuid,uuid,integer,integer) TO authenticated;

-- ── EVENTS: event-session attendance ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ai_rpc_event_attendance(
  p_user_id uuid, p_learner_id uuid DEFAULT NULL, p_session_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 10000, p_offset integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_super boolean; v_inst uuid; v_ok boolean; v_result jsonb;
BEGIN
  SELECT COALESCE(is_super_admin,false), institution_id INTO v_super, v_inst FROM profiles WHERE id = p_user_id;
  v_ok := v_super OR EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON cr.id=ur.role_id
            WHERE ur.user_id=p_user_id AND COALESCE(cr.is_active,true)
              AND COALESCE((cr.permissions->>'events.view')::boolean,false));
  IF NOT v_ok THEN RETURN jsonb_build_object('success',false,'data','[]'::jsonb,
    'metadata',jsonb_build_object('total_count',0,'returned_count',0,'has_more',false),
    'actions_available','[]'::jsonb,
    'error',jsonb_build_object('code','FORBIDDEN','message','Needs events.view to view event attendance.')); END IF;
  WITH rows AS (
    SELECT lp.first_name, lp.last_name, lp.roll_number,
           se.title AS session_title, a.status, a.marked_at
    FROM event_session_attendance a
    LEFT JOIN learners_profiles lp ON lp.id = a.learner_id
    LEFT JOIN event_sessions se ON se.id = a.session_id
    WHERE (v_super OR a.institution_id = v_inst)
      AND (p_learner_id IS NULL OR a.learner_id = p_learner_id)
      AND (p_session_id IS NULL OR a.session_id = p_session_id)
    ORDER BY a.marked_at DESC NULLS LAST LIMIT GREATEST(p_limit,0) OFFSET GREATEST(p_offset,0))
  SELECT jsonb_build_object('success',true,'data',COALESCE(jsonb_agg(row_to_json(x)::jsonb),'[]'::jsonb),
    'metadata',jsonb_build_object('total_count',(SELECT COUNT(*) FROM rows),'returned_count',(SELECT COUNT(*) FROM rows),'has_more',false),
    'actions_available','[]'::jsonb) INTO v_result FROM rows x;
  RETURN v_result;
END; $fn$;
REVOKE EXECUTE ON FUNCTION public.ai_rpc_event_attendance(uuid,uuid,uuid,integer,integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_event_attendance(uuid,uuid,uuid,integer,integer) TO authenticated;

-- ── HEALTH: program participation (scoped via parent program's institution) ───
CREATE OR REPLACE FUNCTION public.ai_rpc_health_participation(
  p_user_id uuid, p_learner_id uuid DEFAULT NULL, p_program_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 10000, p_offset integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_super boolean; v_inst uuid; v_ok boolean; v_result jsonb;
BEGIN
  SELECT COALESCE(is_super_admin,false), institution_id INTO v_super, v_inst FROM profiles WHERE id = p_user_id;
  v_ok := v_super OR EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON cr.id=ur.role_id
            WHERE ur.user_id=p_user_id AND COALESCE(cr.is_active,true)
              AND COALESCE((cr.permissions->>'health.programs.view')::boolean,false));
  IF NOT v_ok THEN RETURN jsonb_build_object('success',false,'data','[]'::jsonb,
    'metadata',jsonb_build_object('total_count',0,'returned_count',0,'has_more',false),
    'actions_available','[]'::jsonb,
    'error',jsonb_build_object('code','FORBIDDEN','message','Needs health.programs.view to view health participation.')); END IF;
  WITH rows AS (
    SELECT lp.first_name, lp.last_name, lp.roll_number,
           pr.title AS program_title, p.watch_completed, p.quiz_score, p.usefulness_rating, p.watched_at
    FROM health_program_participation p
    LEFT JOIN learners_profiles lp ON lp.id = p.learner_id
    LEFT JOIN health_programs pr ON pr.id = p.program_id
    WHERE (v_super OR pr.institution_id = v_inst)   -- scope via parent program (table has no institution_id)
      AND (p_learner_id IS NULL OR p.learner_id = p_learner_id)
      AND (p_program_id IS NULL OR p.program_id = p_program_id)
    ORDER BY p.watched_at DESC NULLS LAST LIMIT GREATEST(p_limit,0) OFFSET GREATEST(p_offset,0))
  SELECT jsonb_build_object('success',true,'data',COALESCE(jsonb_agg(row_to_json(x)::jsonb),'[]'::jsonb),
    'metadata',jsonb_build_object('total_count',(SELECT COUNT(*) FROM rows),'returned_count',(SELECT COUNT(*) FROM rows),'has_more',false),
    'actions_available','[]'::jsonb) INTO v_result FROM rows x;
  RETURN v_result;
END; $fn$;
REVOKE EXECUTE ON FUNCTION public.ai_rpc_health_participation(uuid,uuid,uuid,integer,integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_health_participation(uuid,uuid,uuid,integer,integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
