-- ============================================================================
-- ai-rpc-dead-scope-pre-fix.sql
--
-- CONTROL for ai-rpc-dead-scope-rehearsal.sql. OFF PRODUCTION ONLY (load it
-- into the stub from ai-rpc-dead-scope-stub-schema.sql).
--
-- The 16 functions 20270308090000_ai_rpc_repair_dead_scope_lookups.sql
-- replaces, exactly as they are LIVE: pg_get_functiondef() output read
-- 2026-09-24, verbatim, each with its live md5(prosrc). Loaded into the stub,
-- the 14 lookups raise "function ai_rpc_accessible_scope(uuid) does not exist"
-- on every call (as they do live), ai_rpc_admission_analytics raises
-- "aggregate function calls cannot be nested" and ai_rpc_academic_context
-- raises 42703 on academic_years.is_current. The rehearsal must report FAIL
-- over these bodies; that proves its checks can fail.
--
-- ACLs mirror production: EXECUTE for authenticated (and service_role), not
-- for anon or PUBLIC.
-- ============================================================================

-- public.ai_rpc_academic_years(uuid,uuid,integer,integer)  live md5(prosrc)=04de97aa21d92437e1ca17b8f38e1abc
CREATE OR REPLACE FUNCTION public.ai_rpc_academic_years(p_user_id uuid, p_institution_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_scope jsonb;
  v_result jsonb;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  SELECT ai_rpc_accessible_scope(p_user_id) INTO v_scope;
  
  SELECT jsonb_build_object(
    'success', true,
    'data', COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb),
    'metadata', jsonb_build_object(
      'total_count', COUNT(*) OVER(),
      'returned_count', COUNT(*),
      'has_more', COUNT(*) OVER() > p_offset + p_limit,
      'filters_applied', jsonb_build_object('institution_id', p_institution_id)
    )
  )
  INTO v_result
  FROM (
    SELECT 
      ay.id,
      ay.academic_year_name,
      ay.start_date,
      ay.end_date,
      ay.is_active,
      ay.institution_id,
      ay.created_at
    FROM academic_years ay
    WHERE ay.institution_id = ANY(SELECT jsonb_array_elements_text(v_scope->'institution_ids')::uuid)
    AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
    ORDER BY ay.start_date DESC
    LIMIT p_limit
    OFFSET p_offset
  ) t;
  
  RETURN v_result;
END;
$function$;

-- public.ai_rpc_attendance_summary(uuid,uuid,uuid,uuid,text,text)  live md5(prosrc)=97523943b875e4162305c6f0b76f66a8
CREATE OR REPLACE FUNCTION public.ai_rpc_attendance_summary(p_user_id uuid, p_student_id uuid DEFAULT NULL::uuid, p_section_id uuid DEFAULT NULL::uuid, p_department_id uuid DEFAULT NULL::uuid, p_date_from text DEFAULT NULL::text, p_date_to text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_scope jsonb;
  v_result jsonb;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  SELECT ai_rpc_accessible_scope(p_user_id) INTO v_scope;
  
  SELECT jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'total_records', COUNT(*),
      'date_range', jsonb_build_object(
        'earliest', MIN(sa.attendance_date),
        'latest', MAX(sa.attendance_date)
      ),
      'sections_count', COUNT(DISTINCT sa.section_id),
      'by_section', COALESCE(
        jsonb_agg(DISTINCT jsonb_build_object(
          'section_id', sa.section_id,
          'section_name', sec.section_name,
          'records_count', 1
        )), '[]'::jsonb
      )
    ),
    'metadata', jsonb_build_object(
      'total_count', 1,
      'returned_count', 1,
      'has_more', false,
      'filters_applied', jsonb_build_object(
        'student_id', p_student_id,
        'section_id', p_section_id,
        'department_id', p_department_id,
        'date_from', p_date_from,
        'date_to', p_date_to
      )
    )
  )
  INTO v_result
  FROM student_attendance sa
  LEFT JOIN sections sec ON sa.section_id = sec.id
  WHERE sa.institution_id = ANY(SELECT jsonb_array_elements_text(v_scope->'institution_ids')::uuid)
  AND (p_section_id IS NULL OR sa.section_id = p_section_id)
  AND (p_department_id IS NULL OR sa.department_id = p_department_id)
  AND (p_date_from IS NULL OR sa.attendance_date >= p_date_from::date)
  AND (p_date_to IS NULL OR sa.attendance_date <= p_date_to::date);
  
  RETURN v_result;
END;
$function$;

-- public.ai_rpc_bug_report_details(uuid,uuid)  live md5(prosrc)=30c5a9ca866186ba8c9d2b781a5d595f
CREATE OR REPLACE FUNCTION public.ai_rpc_bug_report_details(p_user_id uuid, p_bug_report_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_scope jsonb;
  v_result jsonb;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  SELECT ai_rpc_accessible_scope(p_user_id) INTO v_scope;
  
  SELECT jsonb_build_object(
    'success', true,
    'data', row_to_json(t),
    'metadata', jsonb_build_object(
      'total_count', 1,
      'returned_count', 1,
      'has_more', false,
      'filters_applied', jsonb_build_object('bug_report_id', p_bug_report_id)
    )
  )
  INTO v_result
  FROM (
    SELECT 
      br.id,
      br.display_id,
      br.description,
      br.page_url,
      br.screenshot_url,
      br.console_logs,
      br.metadata,
      br.status,
      br.priority,
      br.category,
      br.resolved_at,
      br.reporter_ip,
      br.reporter_user_agent,
      p.full_name as reporter_name,
      p.email as reporter_email,
      ap.full_name as assigned_to_name,
      i.name as institution_name,
      d.department_name,
      br.created_at,
      br.updated_at
    FROM bug_reports br
    LEFT JOIN profiles p ON br.reporter_user_id = p.id
    LEFT JOIN profiles ap ON br.assigned_to_user_id = ap.id
    LEFT JOIN institutions i ON br.institution_id = i.id
    LEFT JOIN departments d ON br.department_id = d.id
    WHERE br.id = p_bug_report_id
    AND (br.institution_id IS NULL OR br.institution_id = ANY(SELECT jsonb_array_elements_text(v_scope->'institution_ids')::uuid))
  ) t;
  
  IF v_result IS NULL OR v_result->'data' IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'data', null,
      'metadata', jsonb_build_object('total_count', 0, 'returned_count', 0, 'has_more', false, 'filters_applied', jsonb_build_object()),
      'error', jsonb_build_object('code', 'NOT_FOUND', 'message', 'Bug report not found or access denied')
    );
  END IF;
  
  RETURN v_result;
END;
$function$;

-- public.ai_rpc_courses(uuid,uuid,integer,integer)  live md5(prosrc)=1886c9dc75acde347636c7ed98983413
CREATE OR REPLACE FUNCTION public.ai_rpc_courses(p_user_id uuid, p_institution_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_scope jsonb;
  v_result jsonb;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  SELECT ai_rpc_accessible_scope(p_user_id) INTO v_scope;
  
  SELECT jsonb_build_object(
    'success', true,
    'data', COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb),
    'metadata', jsonb_build_object(
      'total_count', COUNT(*) OVER(),
      'returned_count', COUNT(*),
      'has_more', COUNT(*) OVER() > p_offset + p_limit,
      'filters_applied', jsonb_build_object('institution_id', p_institution_id)
    )
  )
  INTO v_result
  FROM (
    SELECT 
      c.id,
      c.course_code,
      c.course_name,
      c.is_active,
      c.institution_id,
      c.created_at
    FROM courses c
    WHERE c.institution_id = ANY(SELECT jsonb_array_elements_text(v_scope->'institution_ids')::uuid)
    AND (p_institution_id IS NULL OR c.institution_id = p_institution_id)
    ORDER BY c.course_name
    LIMIT p_limit
    OFFSET p_offset
  ) t;
  
  RETURN v_result;
END;
$function$;

-- public.ai_rpc_degrees(uuid,uuid,integer,integer)  live md5(prosrc)=79342ca69b0ba3663d7431bc7091d724
CREATE OR REPLACE FUNCTION public.ai_rpc_degrees(p_user_id uuid, p_institution_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_scope JSONB;
  v_result JSONB;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  -- Get user's accessible scope
  SELECT ai_rpc_accessible_scope(p_user_id) INTO v_scope;
  
  WITH degree_data AS (
    SELECT 
      dg.id,
      dg.degree_name AS name,
      dg.degree_id AS code,
      dg.degree_type,
      dg.is_active,
      i.name AS institution_name,
      (SELECT COUNT(*) FROM programs p WHERE p.degree_id = dg.id) AS program_count,
      dg.created_at
    FROM degrees dg
    LEFT JOIN institutions i ON dg.institution_id = i.id
    WHERE 
      CASE (v_scope->>'scope_type')
        WHEN 'all' THEN true
        ELSE dg.institution_id = ANY(ARRAY(SELECT jsonb_array_elements_text(v_scope->'institution_ids')::UUID))
      END
      AND (p_institution_id IS NULL OR dg.institution_id = p_institution_id)
    ORDER BY dg.degree_name
  )
  SELECT jsonb_build_object(
    'success', true,
    'data', COALESCE(jsonb_agg(row_to_json(dd.*)), '[]'::JSONB),
    'metadata', jsonb_build_object(
      'total_count', (SELECT COUNT(*) FROM degree_data),
      'returned_count', COUNT(*),
      'has_more', false,
      'filters_applied', jsonb_build_object()
    ),
    'actions_available', '[]'::JSONB
  ) INTO v_result
  FROM (SELECT * FROM degree_data LIMIT p_limit OFFSET p_offset) dd;
  
  RETURN v_result;
END;
$function$;

-- public.ai_rpc_faculty_assignments(uuid,uuid,uuid,integer,integer)  live md5(prosrc)=2d953115cefdba7fe828eda5aca00427
CREATE OR REPLACE FUNCTION public.ai_rpc_faculty_assignments(p_user_id uuid, p_staff_id uuid DEFAULT NULL::uuid, p_department_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_scope jsonb;
  v_result jsonb;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  SELECT ai_rpc_accessible_scope(p_user_id) INTO v_scope;
  
  -- Check if faculty_assignments table exists, if not return empty
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'faculty_assignments') THEN
    RETURN jsonb_build_object(
      'success', true,
      'data', '[]'::jsonb,
      'metadata', jsonb_build_object(
        'total_count', 0,
        'returned_count', 0,
        'has_more', false,
        'filters_applied', jsonb_build_object('staff_id', p_staff_id, 'department_id', p_department_id)
      )
    );
  END IF;
  
  SELECT jsonb_build_object(
    'success', true,
    'data', COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb),
    'metadata', jsonb_build_object(
      'total_count', COUNT(*) OVER(),
      'returned_count', COUNT(*),
      'has_more', COUNT(*) OVER() > p_offset + p_limit,
      'filters_applied', jsonb_build_object('staff_id', p_staff_id, 'department_id', p_department_id)
    )
  )
  INTO v_result
  FROM (
    SELECT 
      st.id as staff_id,
      st.staff_id as staff_code,
      st.first_name,
      st.last_name,
      st.designation,
      d.department_name,
      st.is_active
    FROM staff st
    LEFT JOIN departments d ON st.department_id = d.id
    WHERE st.institution_id = ANY(SELECT jsonb_array_elements_text(v_scope->'institution_ids')::uuid)
    AND (p_staff_id IS NULL OR st.id = p_staff_id)
    AND (p_department_id IS NULL OR st.department_id = p_department_id)
    ORDER BY st.first_name, st.last_name
    LIMIT p_limit
    OFFSET p_offset
  ) t;
  
  RETURN v_result;
END;
$function$;

-- public.ai_rpc_institution_access(uuid,uuid,uuid,integer,integer)  live md5(prosrc)=2ed962ff3e26456d28b92d0ab056bba9
CREATE OR REPLACE FUNCTION public.ai_rpc_institution_access(p_user_id uuid, p_target_user_id uuid DEFAULT NULL::uuid, p_institution_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_scope jsonb;
  v_result jsonb;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  SELECT ai_rpc_accessible_scope(p_user_id) INTO v_scope;
  
  SELECT jsonb_build_object(
    'success', true,
    'data', COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb),
    'metadata', jsonb_build_object(
      'total_count', COUNT(*) OVER(),
      'returned_count', COUNT(*),
      'has_more', COUNT(*) OVER() > p_offset + p_limit,
      'filters_applied', jsonb_build_object(
        'target_user_id', p_target_user_id,
        'institution_id', p_institution_id
      )
    )
  )
  INTO v_result
  FROM (
    SELECT 
      uia.id,
      uia.user_id,
      uia.institution_id,
      uia.access_type,
      uia.is_active,
      uia.granted_at,
      p.full_name as user_name,
      p.email as user_email,
      i.name as institution_name,
      gp.full_name as granted_by_name
    FROM user_institution_access uia
    JOIN profiles p ON uia.user_id = p.id
    JOIN institutions i ON uia.institution_id = i.id
    LEFT JOIN profiles gp ON uia.granted_by = gp.id
    WHERE uia.institution_id = ANY(SELECT jsonb_array_elements_text(v_scope->'institution_ids')::uuid)
    AND (p_target_user_id IS NULL OR uia.user_id = p_target_user_id)
    AND (p_institution_id IS NULL OR uia.institution_id = p_institution_id)
    ORDER BY p.full_name, i.name
    LIMIT p_limit
    OFFSET p_offset
  ) t;
  
  RETURN v_result;
END;
$function$;

-- public.ai_rpc_periods(uuid,uuid,integer,integer)  live md5(prosrc)=c421689133a0ce8862b426a26f7fc373
CREATE OR REPLACE FUNCTION public.ai_rpc_periods(p_user_id uuid, p_institution_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_scope jsonb;
  v_result jsonb;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  SELECT ai_rpc_accessible_scope(p_user_id) INTO v_scope;
  
  SELECT jsonb_build_object(
    'success', true,
    'data', COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb),
    'metadata', jsonb_build_object(
      'total_count', COUNT(*) OVER(),
      'returned_count', COUNT(*),
      'has_more', COUNT(*) OVER() > p_offset + p_limit,
      'filters_applied', jsonb_build_object('institution_id', p_institution_id)
    )
  )
  INTO v_result
  FROM (
    SELECT 
      p.id,
      p.period_name,
      p.start_time,
      p.end_time,
      p.is_break,
      p.institution_id,
      p.created_at
    FROM periods p
    WHERE p.institution_id = ANY(SELECT jsonb_array_elements_text(v_scope->'institution_ids')::uuid)
    AND (p_institution_id IS NULL OR p.institution_id = p_institution_id)
    ORDER BY p.start_time
    LIMIT p_limit
    OFFSET p_offset
  ) t;
  
  RETURN v_result;
END;
$function$;

-- public.ai_rpc_staff_details(uuid,uuid)  live md5(prosrc)=c91dc7f2dd3d8259724a33eef7266262
CREATE OR REPLACE FUNCTION public.ai_rpc_staff_details(p_user_id uuid, p_staff_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_scope jsonb;
  v_result jsonb;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  SELECT ai_rpc_accessible_scope(p_user_id) INTO v_scope;
  
  SELECT jsonb_build_object(
    'success', true,
    'data', row_to_json(t),
    'metadata', jsonb_build_object(
      'total_count', 1,
      'returned_count', 1,
      'has_more', false,
      'filters_applied', jsonb_build_object('staff_id', p_staff_id)
    )
  )
  INTO v_result
  FROM (
    SELECT 
      st.id,
      st.staff_id,
      st.first_name,
      st.last_name,
      st.gender,
      st.date_of_birth,
      st.marital_status,
      st.blood_group,
      st.email,
      st.phone,
      st.institution_email,
      st.address,
      st.state,
      st.district,
      st.pincode,
      st.designation,
      st.date_of_joining,
      st.is_active,
      st.profile_picture,
      d.department_name,
      ec.category_name,
      i.name as institution_name,
      st.created_at,
      st.updated_at
    FROM staff st
    LEFT JOIN departments d ON st.department_id = d.id
    LEFT JOIN employment_categories ec ON st.category_id = ec.id
    LEFT JOIN institutions i ON st.institution_id = i.id
    WHERE st.id = p_staff_id
    AND st.institution_id = ANY(SELECT jsonb_array_elements_text(v_scope->'institution_ids')::uuid)
  ) t;
  
  IF v_result IS NULL OR v_result->'data' IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'data', null,
      'metadata', jsonb_build_object('total_count', 0, 'returned_count', 0, 'has_more', false, 'filters_applied', jsonb_build_object()),
      'error', jsonb_build_object('code', 'NOT_FOUND', 'message', 'Staff not found or access denied')
    );
  END IF;
  
  RETURN v_result;
END;
$function$;

-- public.ai_rpc_staff_plans(uuid,uuid,uuid,integer,integer)  live md5(prosrc)=270dc58b9484cdea6fc6cc2b08e73852
CREATE OR REPLACE FUNCTION public.ai_rpc_staff_plans(p_user_id uuid, p_department_id uuid DEFAULT NULL::uuid, p_timetable_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_scope jsonb;
  v_result jsonb;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  SELECT ai_rpc_accessible_scope(p_user_id) INTO v_scope;
  
  -- Staff plans are typically embedded in timetable_data, return staff with their departments
  SELECT jsonb_build_object(
    'success', true,
    'data', COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb),
    'metadata', jsonb_build_object(
      'total_count', COUNT(*) OVER(),
      'returned_count', COUNT(*),
      'has_more', COUNT(*) OVER() > p_offset + p_limit,
      'filters_applied', jsonb_build_object('department_id', p_department_id, 'timetable_id', p_timetable_id)
    )
  )
  INTO v_result
  FROM (
    SELECT 
      st.id,
      st.staff_id,
      st.first_name,
      st.last_name,
      st.designation,
      d.department_name,
      st.is_active
    FROM staff st
    LEFT JOIN departments d ON st.department_id = d.id
    WHERE st.institution_id = ANY(SELECT jsonb_array_elements_text(v_scope->'institution_ids')::uuid)
    AND (p_department_id IS NULL OR st.department_id = p_department_id)
    AND st.is_active = true
    ORDER BY st.first_name, st.last_name
    LIMIT p_limit
    OFFSET p_offset
  ) t;
  
  RETURN v_result;
END;
$function$;

-- public.ai_rpc_timetable_slots(uuid,uuid,integer,integer)  live md5(prosrc)=c61201834b619c5ef12007d82528bc8c
CREATE OR REPLACE FUNCTION public.ai_rpc_timetable_slots(p_user_id uuid, p_timetable_id uuid, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_scope jsonb;
  v_result jsonb;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  SELECT ai_rpc_accessible_scope(p_user_id) INTO v_scope;
  
  SELECT jsonb_build_object(
    'success', true,
    'data', COALESCE(t.timetable_data, '[]'::jsonb),
    'metadata', jsonb_build_object(
      'total_count', jsonb_array_length(COALESCE(t.timetable_data, '[]'::jsonb)),
      'returned_count', jsonb_array_length(COALESCE(t.timetable_data, '[]'::jsonb)),
      'has_more', false,
      'filters_applied', jsonb_build_object('timetable_id', p_timetable_id),
      'timetable_name', t.timetable_name,
      'periods', t.periods
    )
  )
  INTO v_result
  FROM timetables t
  WHERE t.id = p_timetable_id
  AND t.institution_id = ANY(SELECT jsonb_array_elements_text(v_scope->'institution_ids')::uuid);
  
  IF v_result IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'data', null,
      'metadata', jsonb_build_object('total_count', 0, 'returned_count', 0, 'has_more', false, 'filters_applied', jsonb_build_object()),
      'error', jsonb_build_object('code', 'NOT_FOUND', 'message', 'Timetable not found or access denied')
    );
  END IF;
  
  RETURN v_result;
END;
$function$;

-- public.ai_rpc_timetables(uuid,uuid,uuid,uuid,integer,integer)  live md5(prosrc)=d855e137f1cf745f49e2e3315182aee1
CREATE OR REPLACE FUNCTION public.ai_rpc_timetables(p_user_id uuid, p_department_id uuid DEFAULT NULL::uuid, p_academic_year_id uuid DEFAULT NULL::uuid, p_section_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_scope jsonb;
  v_result jsonb;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  SELECT ai_rpc_accessible_scope(p_user_id) INTO v_scope;
  
  SELECT jsonb_build_object(
    'success', true,
    'data', COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb),
    'metadata', jsonb_build_object(
      'total_count', COUNT(*) OVER(),
      'returned_count', COUNT(*),
      'has_more', COUNT(*) OVER() > p_offset + p_limit,
      'filters_applied', jsonb_build_object(
        'department_id', p_department_id,
        'academic_year_id', p_academic_year_id,
        'section_id', p_section_id
      )
    )
  )
  INTO v_result
  FROM (
    SELECT 
      t.id,
      t.timetable_name,
      t.timetable_type,
      t.is_active,
      t.is_template,
      t.version,
      t.start_date,
      t.end_date,
      t.timetable_format,
      d.department_name,
      sec.section_name,
      ay.academic_year_name,
      t.created_at
    FROM timetables t
    LEFT JOIN departments d ON t.department_id = d.id
    LEFT JOIN sections sec ON t.section_id = sec.id
    LEFT JOIN academic_years ay ON t.academic_year_id = ay.id
    WHERE t.institution_id = ANY(SELECT jsonb_array_elements_text(v_scope->'institution_ids')::uuid)
    AND (p_department_id IS NULL OR t.department_id = p_department_id)
    AND (p_academic_year_id IS NULL OR t.academic_year_id = p_academic_year_id)
    AND (p_section_id IS NULL OR t.section_id = p_section_id)
    ORDER BY t.created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  ) t;
  
  RETURN v_result;
END;
$function$;

-- public.ai_rpc_user_roles(uuid,uuid,integer,integer)  live md5(prosrc)=10dc4a4b4f9cdb0ce06d93684708d8f3
CREATE OR REPLACE FUNCTION public.ai_rpc_user_roles(p_user_id uuid, p_target_user_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_scope jsonb;
  v_result jsonb;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  SELECT ai_rpc_accessible_scope(p_user_id) INTO v_scope;
  
  SELECT jsonb_build_object(
    'success', true,
    'data', COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb),
    'metadata', jsonb_build_object(
      'total_count', COUNT(*) OVER(),
      'returned_count', COUNT(*),
      'has_more', COUNT(*) OVER() > p_offset + p_limit,
      'filters_applied', jsonb_build_object('target_user_id', p_target_user_id)
    )
  )
  INTO v_result
  FROM (
    SELECT 
      ur.id,
      ur.user_id,
      ur.role_id,
      ur.is_primary,
      ur.assigned_at,
      p.full_name as user_name,
      p.email as user_email,
      cr.role_name,
      cr.role_key,
      cr.description as role_description
    FROM user_roles ur
    JOIN profiles p ON ur.user_id = p.id
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE (p.institution_id = ANY(SELECT jsonb_array_elements_text(v_scope->'institution_ids')::uuid) OR p.is_super_admin = true)
    AND (p_target_user_id IS NULL OR ur.user_id = p_target_user_id)
    ORDER BY p.full_name, ur.is_primary DESC
    LIMIT p_limit
    OFFSET p_offset
  ) t;
  
  RETURN v_result;
END;
$function$;

-- public.ai_rpc_users(uuid,uuid,text,text,integer,integer)  live md5(prosrc)=bd852f9c98381019e98460f3452c6718
CREATE OR REPLACE FUNCTION public.ai_rpc_users(p_user_id uuid, p_institution_id uuid DEFAULT NULL::uuid, p_role text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_scope jsonb;
  v_result jsonb;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  SELECT ai_rpc_accessible_scope(p_user_id) INTO v_scope;
  
  SELECT jsonb_build_object(
    'success', true,
    'data', COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb),
    'metadata', jsonb_build_object(
      'total_count', COUNT(*) OVER(),
      'returned_count', COUNT(*),
      'has_more', COUNT(*) OVER() > p_offset + p_limit,
      'filters_applied', jsonb_build_object(
        'institution_id', p_institution_id,
        'role', p_role,
        'search', p_search
      )
    )
  )
  INTO v_result
  FROM (
    SELECT 
      p.id,
      p.full_name,
      p.email,
      p.phone_number,
      p.role,
      p.designation,
      p.is_active,
      p.profile_completed,
      p.avatar_url,
      p.last_login,
      i.name as institution_name,
      d.department_name,
      p.created_at
    FROM profiles p
    LEFT JOIN institutions i ON p.institution_id = i.id
    LEFT JOIN departments d ON p.department_id = d.id
    WHERE (p.institution_id = ANY(SELECT jsonb_array_elements_text(v_scope->'institution_ids')::uuid) OR p.is_super_admin = true)
    AND (p_institution_id IS NULL OR p.institution_id = p_institution_id)
    AND (p_role IS NULL OR p.role = p_role)
    AND (p_search IS NULL OR 
         p.full_name ILIKE '%' || p_search || '%' OR
         p.email ILIKE '%' || p_search || '%')
    ORDER BY p.full_name
    LIMIT p_limit
    OFFSET p_offset
  ) t;
  
  RETURN v_result;
END;
$function$;

-- public.ai_rpc_admission_analytics(uuid,uuid,uuid,boolean)  live md5(prosrc)=3dd178483a4c6831030310cee9a30b51
CREATE OR REPLACE FUNCTION public.ai_rpc_admission_analytics(p_user_id uuid, p_institution_id uuid DEFAULT NULL::uuid, p_academic_year_id uuid DEFAULT NULL::uuid, p_include_trends boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_result JSONB; v_profile RECORD; v_inst_id UUID;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  SELECT institution_id, is_super_admin INTO v_profile FROM profiles WHERE id = p_user_id;
  v_inst_id := COALESCE(p_institution_id, v_profile.institution_id);

  WITH analytics AS (
    SELECT
      COUNT(*) as total_enquiries,
      COUNT(*) FILTER (WHERE lifecycle_status::TEXT IN ('admitted', 'active')) as converted,
      ROUND((COUNT(*) FILTER (WHERE lifecycle_status::TEXT IN ('admitted', 'active'))::NUMERIC / NULLIF(COUNT(*), 0)) * 100, 2) as conversion_rate,
      AVG(EXTRACT(DAY FROM (updated_at - created_at))) FILTER (WHERE lifecycle_status::TEXT = 'admitted') as avg_processing_days,
      jsonb_object_agg(TO_CHAR(created_at, 'YYYY-MM'), COUNT(*)) as monthly_trend,
      jsonb_object_agg(reference_type, COUNT(*)) FILTER (WHERE reference_type IS NOT NULL) as by_reference_type
    FROM learners_profiles
    WHERE (v_profile.is_super_admin = TRUE OR institution_id = v_inst_id)
      AND (p_academic_year_id IS NULL OR academic_year_id = p_academic_year_id)
  )
  SELECT jsonb_build_object(
    'success', TRUE,
    'data', row_to_json(a)::jsonb,
    'metadata', jsonb_build_object('total_count', 1, 'returned_count', 1, 'has_more', FALSE),
    'actions_available', '[]'::jsonb
  ) INTO v_result FROM analytics a;
  
  RETURN v_result;
END;
$function$;

-- public.ai_rpc_academic_context(uuid)  live md5(prosrc)=6474fe1fd5ce36e81dafe109194d2764
CREATE OR REPLACE FUNCTION public.ai_rpc_academic_context(p_institution_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_academic_year RECORD;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  SELECT * INTO v_academic_year
  FROM academic_years
  WHERE is_current = true
  AND (p_institution_id IS NULL OR institution_id = p_institution_id)
  LIMIT 1;
  
  RETURN jsonb_build_object(
    'academic_year_id', v_academic_year.id,
    'academic_year_name', v_academic_year.name,
    'start_date', v_academic_year.start_date,
    'end_date', v_academic_year.end_date
  );
END;
$function$;

-- ACLs as live: authenticated + service_role only.
REVOKE EXECUTE ON FUNCTION public.ai_rpc_academic_years(uuid,uuid,integer,integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_academic_years(uuid,uuid,integer,integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.ai_rpc_attendance_summary(uuid,uuid,uuid,uuid,text,text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_attendance_summary(uuid,uuid,uuid,uuid,text,text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.ai_rpc_bug_report_details(uuid,uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_bug_report_details(uuid,uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.ai_rpc_courses(uuid,uuid,integer,integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_courses(uuid,uuid,integer,integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.ai_rpc_degrees(uuid,uuid,integer,integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_degrees(uuid,uuid,integer,integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.ai_rpc_faculty_assignments(uuid,uuid,uuid,integer,integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_faculty_assignments(uuid,uuid,uuid,integer,integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.ai_rpc_institution_access(uuid,uuid,uuid,integer,integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_institution_access(uuid,uuid,uuid,integer,integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.ai_rpc_periods(uuid,uuid,integer,integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_periods(uuid,uuid,integer,integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.ai_rpc_staff_details(uuid,uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_staff_details(uuid,uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.ai_rpc_staff_plans(uuid,uuid,uuid,integer,integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_staff_plans(uuid,uuid,uuid,integer,integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.ai_rpc_timetable_slots(uuid,uuid,integer,integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_timetable_slots(uuid,uuid,integer,integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.ai_rpc_timetables(uuid,uuid,uuid,uuid,integer,integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_timetables(uuid,uuid,uuid,uuid,integer,integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.ai_rpc_user_roles(uuid,uuid,integer,integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_user_roles(uuid,uuid,integer,integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.ai_rpc_users(uuid,uuid,text,text,integer,integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_users(uuid,uuid,text,text,integer,integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.ai_rpc_admission_analytics(uuid,uuid,uuid,boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_admission_analytics(uuid,uuid,uuid,boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.ai_rpc_academic_context(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_academic_context(uuid) TO authenticated, service_role;
