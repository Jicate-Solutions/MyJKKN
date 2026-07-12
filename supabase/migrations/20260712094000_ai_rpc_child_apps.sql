-- =====================================================================
-- AI Query tools: 6 more child apps (mess, hostel, meeting rooms, CDC,
--                 events, health) — completes the child-app wiring
-- Migration: 2026-07-12  (hardened same day after deep-review)
-- =====================================================================
-- Same hardened shape as ai_rpc_transport_bookings:
--  * IDENTITY = auth.uid() (NOT caller-supplied p_user_id — confused-deputy
--    fix); p_user_id kept in signature only for call-shape compatibility.
--  * NULL-safe gate: v_ok := COALESCE(v_super,false) OR EXISTS(...); an
--    explicit UNAUTHORIZED when auth.uid() is null and FORBIDDEN when the gate
--    is false — a missing profile row can never fall through to the data.
--  * Bool-safe permission read: lower(perm text) IN ('true','t','1') instead
--    of ::boolean cast (never 500s a denied user).
--  * Correct pagination: total_count from the UNPAGINATED base, has_more real.
--  * Enum columns (meal_type, status) cast to text in filters.
--
-- Gate per app (its OWN permission key; institution-scoped where the table has
-- institution_id, else permission-only for genuinely cross-institution data):
--   mess     campus_living.mess.meals.view        institution-scoped
--   hostel   campus_living.allocations.view       institution-scoped
--   meeting  meetings.view                        institution-scoped
--   events   events.view                          institution-scoped
--   cdc      cdc.drives.view                      cross-institution (drives serve all colleges)
--   health   health.programs.view                 scoped via parent program's institution
-- =====================================================================

-- ── MESS: meal bookings ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ai_rpc_mess_bookings(
  p_user_id uuid, p_learner_id uuid DEFAULT NULL, p_meal_type text DEFAULT NULL,
  p_date_from text DEFAULT NULL, p_date_to text DEFAULT NULL,
  p_limit integer DEFAULT 10000, p_offset integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_uid uuid := auth.uid(); v_super boolean; v_inst uuid; v_ok boolean; v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success',false,'data','[]'::jsonb,
    'metadata',jsonb_build_object('total_count',0,'returned_count',0,'has_more',false),
    'actions_available','[]'::jsonb,'error',jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.')); END IF;
  SELECT COALESCE(is_super_admin,false), institution_id INTO v_super, v_inst FROM profiles WHERE id = v_uid;
  v_ok := COALESCE(v_super,false) OR EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON cr.id=ur.role_id
            WHERE ur.user_id=v_uid AND COALESCE(cr.is_active,true)
              AND lower(COALESCE(cr.permissions->>'campus_living.mess.meals.view','')) IN ('true','t','1'));
  IF NOT COALESCE(v_ok,false) THEN RETURN jsonb_build_object('success',false,'data','[]'::jsonb,
    'metadata',jsonb_build_object('total_count',0,'returned_count',0,'has_more',false),'actions_available','[]'::jsonb,
    'error',jsonb_build_object('code','FORBIDDEN','message','Needs campus_living.mess.meals.view to view mess bookings.')); END IF;
  WITH base AS (
    SELECT b.date AS meal_date, b.meal_type, b.status, b.is_opt_out, lp.first_name, lp.last_name, lp.roll_number
    FROM mess_meal_bookings b LEFT JOIN learners_profiles lp ON lp.id = b.learner_id
    WHERE (v_super OR b.institution_id = v_inst)
      AND (p_learner_id IS NULL OR b.learner_id = p_learner_id)
      AND (p_meal_type IS NULL OR b.meal_type::text = p_meal_type)
      AND (p_date_from IS NULL OR b.date >= p_date_from::date)
      AND (p_date_to IS NULL OR b.date <= p_date_to::date)),
  paged AS (SELECT * FROM base ORDER BY meal_date DESC LIMIT GREATEST(p_limit,0) OFFSET GREATEST(p_offset,0))
  SELECT jsonb_build_object('success',true,'data',COALESCE((SELECT jsonb_agg(row_to_json(p)::jsonb) FROM paged p),'[]'::jsonb),
    'metadata',jsonb_build_object('total_count',(SELECT COUNT(*) FROM base),'returned_count',(SELECT COUNT(*) FROM paged),
      'has_more',(SELECT COUNT(*) FROM base) > (GREATEST(p_offset,0)+(SELECT COUNT(*) FROM paged))),
    'actions_available','[]'::jsonb) INTO v_result;
  RETURN v_result;
END; $fn$;
REVOKE EXECUTE ON FUNCTION public.ai_rpc_mess_bookings(uuid,uuid,text,text,text,integer,integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_mess_bookings(uuid,uuid,text,text,text,integer,integer) TO authenticated;

-- ── HOSTEL: room allocations ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ai_rpc_hostel_allocations(
  p_user_id uuid, p_learner_id uuid DEFAULT NULL, p_status text DEFAULT NULL,
  p_limit integer DEFAULT 10000, p_offset integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_uid uuid := auth.uid(); v_super boolean; v_inst uuid; v_ok boolean; v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success',false,'data','[]'::jsonb,
    'metadata',jsonb_build_object('total_count',0,'returned_count',0,'has_more',false),
    'actions_available','[]'::jsonb,'error',jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.')); END IF;
  SELECT COALESCE(is_super_admin,false), institution_id INTO v_super, v_inst FROM profiles WHERE id = v_uid;
  v_ok := COALESCE(v_super,false) OR EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON cr.id=ur.role_id
            WHERE ur.user_id=v_uid AND COALESCE(cr.is_active,true)
              AND lower(COALESCE(cr.permissions->>'campus_living.allocations.view','')) IN ('true','t','1'));
  IF NOT COALESCE(v_ok,false) THEN RETURN jsonb_build_object('success',false,'data','[]'::jsonb,
    'metadata',jsonb_build_object('total_count',0,'returned_count',0,'has_more',false),'actions_available','[]'::jsonb,
    'error',jsonb_build_object('code','FORBIDDEN','message','Needs campus_living.allocations.view to view hostel allocations.')); END IF;
  WITH base AS (
    SELECT lp.first_name, lp.last_name, lp.roll_number, blk.name AS block_name, rm.room_number,
           a.allocation_date, a.status, a.fee_status
    FROM hostel_allocations a
    LEFT JOIN learners_profiles lp ON lp.id = a.learner_id
    LEFT JOIN hostel_blocks blk ON blk.id = a.block_id
    LEFT JOIN hostel_rooms rm ON rm.id = a.room_id
    WHERE (v_super OR a.institution_id = v_inst)
      AND (p_learner_id IS NULL OR a.learner_id = p_learner_id)
      AND (p_status IS NULL OR a.status::text = p_status)),
  paged AS (SELECT * FROM base ORDER BY allocation_date DESC LIMIT GREATEST(p_limit,0) OFFSET GREATEST(p_offset,0))
  SELECT jsonb_build_object('success',true,'data',COALESCE((SELECT jsonb_agg(row_to_json(p)::jsonb) FROM paged p),'[]'::jsonb),
    'metadata',jsonb_build_object('total_count',(SELECT COUNT(*) FROM base),'returned_count',(SELECT COUNT(*) FROM paged),
      'has_more',(SELECT COUNT(*) FROM base) > (GREATEST(p_offset,0)+(SELECT COUNT(*) FROM paged))),
    'actions_available','[]'::jsonb) INTO v_result;
  RETURN v_result;
END; $fn$;
REVOKE EXECUTE ON FUNCTION public.ai_rpc_hostel_allocations(uuid,uuid,text,integer,integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_hostel_allocations(uuid,uuid,text,integer,integer) TO authenticated;

-- ── MEETING ROOMS: bookings ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ai_rpc_meeting_bookings(
  p_user_id uuid, p_status text DEFAULT NULL,
  p_date_from text DEFAULT NULL, p_date_to text DEFAULT NULL,
  p_limit integer DEFAULT 10000, p_offset integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_uid uuid := auth.uid(); v_super boolean; v_inst uuid; v_ok boolean; v_result jsonb;
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
  WITH base AS (
    SELECT b.attendee_name, b.attendee_email, mt.display_name AS meeting_type, b.start_time, b.end_time, b.status
    FROM meeting_bookings b
    LEFT JOIN jicate_booking_meeting_types mt ON mt.id = b.meeting_type_id
    WHERE (v_super OR b.institution_id = v_inst)
      AND (p_status IS NULL OR b.status::text = p_status)
      AND (p_date_from IS NULL OR b.start_time >= p_date_from::date)
      AND (p_date_to IS NULL OR b.start_time < (p_date_to::date + 1)))   -- inclusive of the whole date_to day
  , paged AS (SELECT * FROM base ORDER BY start_time DESC LIMIT GREATEST(p_limit,0) OFFSET GREATEST(p_offset,0))
  SELECT jsonb_build_object('success',true,'data',COALESCE((SELECT jsonb_agg(row_to_json(p)::jsonb) FROM paged p),'[]'::jsonb),
    'metadata',jsonb_build_object('total_count',(SELECT COUNT(*) FROM base),'returned_count',(SELECT COUNT(*) FROM paged),
      'has_more',(SELECT COUNT(*) FROM base) > (GREATEST(p_offset,0)+(SELECT COUNT(*) FROM paged))),
    'actions_available','[]'::jsonb) INTO v_result;
  RETURN v_result;
END; $fn$;
REVOKE EXECUTE ON FUNCTION public.ai_rpc_meeting_bookings(uuid,text,text,text,integer,integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_meeting_bookings(uuid,text,text,text,integer,integer) TO authenticated;

-- ── CDC: placement-drive attendance (cross-institution) ───────────────────────
CREATE OR REPLACE FUNCTION public.ai_rpc_cdc_drive_attendance(
  p_user_id uuid, p_learner_id uuid DEFAULT NULL, p_drive_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 10000, p_offset integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_uid uuid := auth.uid(); v_super boolean; v_ok boolean; v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success',false,'data','[]'::jsonb,
    'metadata',jsonb_build_object('total_count',0,'returned_count',0,'has_more',false),
    'actions_available','[]'::jsonb,'error',jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.')); END IF;
  SELECT COALESCE(is_super_admin,false) INTO v_super FROM profiles WHERE id = v_uid;
  v_ok := COALESCE(v_super,false) OR EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON cr.id=ur.role_id
            WHERE ur.user_id=v_uid AND COALESCE(cr.is_active,true)
              AND lower(COALESCE(cr.permissions->>'cdc.drives.view','')) IN ('true','t','1'));
  IF NOT COALESCE(v_ok,false) THEN RETURN jsonb_build_object('success',false,'data','[]'::jsonb,
    'metadata',jsonb_build_object('total_count',0,'returned_count',0,'has_more',false),'actions_available','[]'::jsonb,
    'error',jsonb_build_object('code','FORBIDDEN','message','Needs cdc.drives.view to view placement-drive attendance.')); END IF;
  WITH base AS (
    SELECT lp.first_name, lp.last_name, lp.roll_number, dr.title AS drive_title,
           a.round_no, a.round_type, a.attended, a.no_show_reason, a.created_at
    FROM cdc_drive_attendance a
    LEFT JOIN learners_profiles lp ON lp.id = a.learner_id
    LEFT JOIN cdc_drives dr ON dr.id = a.drive_id
    WHERE (p_learner_id IS NULL OR a.learner_id = p_learner_id)
      AND (p_drive_id IS NULL OR a.drive_id = p_drive_id)),
  paged AS (SELECT * FROM base ORDER BY created_at DESC LIMIT GREATEST(p_limit,0) OFFSET GREATEST(p_offset,0))
  SELECT jsonb_build_object('success',true,'data',COALESCE((SELECT jsonb_agg(row_to_json(p)::jsonb) FROM paged p),'[]'::jsonb),
    'metadata',jsonb_build_object('total_count',(SELECT COUNT(*) FROM base),'returned_count',(SELECT COUNT(*) FROM paged),
      'has_more',(SELECT COUNT(*) FROM base) > (GREATEST(p_offset,0)+(SELECT COUNT(*) FROM paged))),
    'actions_available','[]'::jsonb) INTO v_result;
  RETURN v_result;
END; $fn$;
REVOKE EXECUTE ON FUNCTION public.ai_rpc_cdc_drive_attendance(uuid,uuid,uuid,integer,integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_cdc_drive_attendance(uuid,uuid,uuid,integer,integer) TO authenticated;

-- ── EVENTS: session attendance ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ai_rpc_event_attendance(
  p_user_id uuid, p_learner_id uuid DEFAULT NULL, p_session_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 10000, p_offset integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_uid uuid := auth.uid(); v_super boolean; v_inst uuid; v_ok boolean; v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success',false,'data','[]'::jsonb,
    'metadata',jsonb_build_object('total_count',0,'returned_count',0,'has_more',false),
    'actions_available','[]'::jsonb,'error',jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.')); END IF;
  SELECT COALESCE(is_super_admin,false), institution_id INTO v_super, v_inst FROM profiles WHERE id = v_uid;
  v_ok := COALESCE(v_super,false) OR EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON cr.id=ur.role_id
            WHERE ur.user_id=v_uid AND COALESCE(cr.is_active,true)
              AND lower(COALESCE(cr.permissions->>'events.view','')) IN ('true','t','1'));
  IF NOT COALESCE(v_ok,false) THEN RETURN jsonb_build_object('success',false,'data','[]'::jsonb,
    'metadata',jsonb_build_object('total_count',0,'returned_count',0,'has_more',false),'actions_available','[]'::jsonb,
    'error',jsonb_build_object('code','FORBIDDEN','message','Needs events.view to view event attendance.')); END IF;
  WITH base AS (
    SELECT lp.first_name, lp.last_name, lp.roll_number, se.title AS session_title, a.status, a.marked_at
    FROM event_session_attendance a
    LEFT JOIN learners_profiles lp ON lp.id = a.learner_id
    LEFT JOIN event_sessions se ON se.id = a.session_id
    WHERE (v_super OR a.institution_id = v_inst)
      AND (p_learner_id IS NULL OR a.learner_id = p_learner_id)
      AND (p_session_id IS NULL OR a.session_id = p_session_id)),
  paged AS (SELECT * FROM base ORDER BY marked_at DESC NULLS LAST LIMIT GREATEST(p_limit,0) OFFSET GREATEST(p_offset,0))
  SELECT jsonb_build_object('success',true,'data',COALESCE((SELECT jsonb_agg(row_to_json(p)::jsonb) FROM paged p),'[]'::jsonb),
    'metadata',jsonb_build_object('total_count',(SELECT COUNT(*) FROM base),'returned_count',(SELECT COUNT(*) FROM paged),
      'has_more',(SELECT COUNT(*) FROM base) > (GREATEST(p_offset,0)+(SELECT COUNT(*) FROM paged))),
    'actions_available','[]'::jsonb) INTO v_result;
  RETURN v_result;
END; $fn$;
REVOKE EXECUTE ON FUNCTION public.ai_rpc_event_attendance(uuid,uuid,uuid,integer,integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_event_attendance(uuid,uuid,uuid,integer,integer) TO authenticated;

-- ── HEALTH: program participation (scoped via parent program) ─────────────────
CREATE OR REPLACE FUNCTION public.ai_rpc_health_participation(
  p_user_id uuid, p_learner_id uuid DEFAULT NULL, p_program_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 10000, p_offset integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_uid uuid := auth.uid(); v_super boolean; v_inst uuid; v_ok boolean; v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success',false,'data','[]'::jsonb,
    'metadata',jsonb_build_object('total_count',0,'returned_count',0,'has_more',false),
    'actions_available','[]'::jsonb,'error',jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.')); END IF;
  SELECT COALESCE(is_super_admin,false), institution_id INTO v_super, v_inst FROM profiles WHERE id = v_uid;
  v_ok := COALESCE(v_super,false) OR EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON cr.id=ur.role_id
            WHERE ur.user_id=v_uid AND COALESCE(cr.is_active,true)
              AND lower(COALESCE(cr.permissions->>'health.programs.view','')) IN ('true','t','1'));
  IF NOT COALESCE(v_ok,false) THEN RETURN jsonb_build_object('success',false,'data','[]'::jsonb,
    'metadata',jsonb_build_object('total_count',0,'returned_count',0,'has_more',false),'actions_available','[]'::jsonb,
    'error',jsonb_build_object('code','FORBIDDEN','message','Needs health.programs.view to view health participation.')); END IF;
  WITH base AS (
    SELECT lp.first_name, lp.last_name, lp.roll_number, pr.title AS program_title,
           p.watch_completed, p.quiz_score, p.usefulness_rating, p.watched_at
    FROM health_program_participation p
    LEFT JOIN learners_profiles lp ON lp.id = p.learner_id
    LEFT JOIN health_programs pr ON pr.id = p.program_id
    WHERE (v_super OR pr.institution_id = v_inst)   -- scope via parent program (table has no institution_id)
      AND (p_learner_id IS NULL OR p.learner_id = p_learner_id)
      AND (p_program_id IS NULL OR p.program_id = p_program_id)),
  paged AS (SELECT * FROM base ORDER BY watched_at DESC NULLS LAST LIMIT GREATEST(p_limit,0) OFFSET GREATEST(p_offset,0))
  SELECT jsonb_build_object('success',true,'data',COALESCE((SELECT jsonb_agg(row_to_json(p2)::jsonb) FROM paged p2),'[]'::jsonb),
    'metadata',jsonb_build_object('total_count',(SELECT COUNT(*) FROM base),'returned_count',(SELECT COUNT(*) FROM paged),
      'has_more',(SELECT COUNT(*) FROM base) > (GREATEST(p_offset,0)+(SELECT COUNT(*) FROM paged))),
    'actions_available','[]'::jsonb) INTO v_result;
  RETURN v_result;
END; $fn$;
REVOKE EXECUTE ON FUNCTION public.ai_rpc_health_participation(uuid,uuid,uuid,integer,integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_health_participation(uuid,uuid,uuid,integer,integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
