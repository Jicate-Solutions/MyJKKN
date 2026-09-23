-- ============================================================================
-- ai-rpc-scope-guards-pre-fix.sql
--
-- CONTROL for ai-rpc-scope-guards-rehearsal.sql. OFF-PRODUCTION ONLY (the stub
-- from ai-rpc-scope-guards-stub-schema.sql). NEVER apply this to production: it
-- re-creates the six functions exactly as they were BEFORE
-- 20270307090000_ai_rpc_scope_parameter_guards.sql, i.e. with the leak.
--
-- Each body below is copied byte-for-byte from the repo file named above it.
-- Run the rehearsal after this file and the verdict must be FAIL (the checks
-- can fail); apply the migration over it and the verdict must be PASS.
-- ============================================================================

-- ===== ai_rpc_students_summary — verbatim from supabase/migrations/20260712134500_ai_rpc_authuid_confused_deputy_sweep.sql lines 3135-3169
CREATE OR REPLACE FUNCTION public.ai_rpc_students_summary(p_user_id uuid, p_institution_id uuid DEFAULT NULL::uuid, p_department_id uuid DEFAULT NULL::uuid)
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

  WITH summary AS (
    SELECT COUNT(*) as total_learners,
           COUNT(*) FILTER (WHERE lifecycle_status::TEXT = 'active') as active_count,
           COUNT(*) FILTER (WHERE gender = 'Male') as male_count,
           COUNT(*) FILTER (WHERE gender = 'Female') as female_count,
           COUNT(*) FILTER (WHERE accommodation_type_id IN (SELECT id FROM accommodation_types WHERE code = 'hostel')) as hostel_count,
           COUNT(*) FILTER (WHERE bus_required = TRUE) as bus_required_count
           -- REMOVED: COUNT(*) FILTER (WHERE first_graduate = TRUE) as first_graduate_count
    FROM learners_profiles
    WHERE (v_profile.is_super_admin = TRUE OR institution_id = v_inst_id)
      AND (p_department_id IS NULL OR department_id = p_department_id)
  )
  SELECT jsonb_build_object('success', TRUE, 'data', row_to_json(s)::jsonb,
    'metadata', jsonb_build_object('total_count', 1, 'returned_count', 1, 'has_more', FALSE),
    'actions_available', '[]'::jsonb
  ) INTO v_result FROM summary s;
  
  RETURN v_result;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.ai_rpc_students_summary(uuid, uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_students_summary(uuid, uuid, uuid) TO authenticated;

-- ===== ai_rpc_students_by_department — verbatim from supabase/migrations/20260712134500_ai_rpc_authuid_confused_deputy_sweep.sql lines 3080-3115
CREATE OR REPLACE FUNCTION public.ai_rpc_students_by_department(p_user_id uuid, p_institution_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text)
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

  WITH dept_stats AS (
    SELECT d.id as department_id, d.department_name, d.department_code,
           COUNT(*) as total_learners,
           COUNT(*) FILTER (WHERE lp.lifecycle_status::TEXT = 'active') as active_count,
           COUNT(*) FILTER (WHERE lp.gender = 'Male') as male_count,
           COUNT(*) FILTER (WHERE lp.gender = 'Female') as female_count
    FROM departments d
    LEFT JOIN learners_profiles lp ON d.id = lp.department_id
      AND (p_status IS NULL OR lp.lifecycle_status::TEXT ILIKE p_status)
    WHERE (v_profile.is_super_admin = TRUE OR d.institution_id = v_inst_id)
    GROUP BY d.id, d.department_name, d.department_code
    ORDER BY d.department_name
  )
  SELECT jsonb_build_object('success', TRUE, 'data', COALESCE(jsonb_agg(row_to_json(ds)::jsonb), '[]'::jsonb),
    'metadata', jsonb_build_object('total_count', (SELECT COUNT(*) FROM dept_stats), 'returned_count', (SELECT COUNT(*) FROM dept_stats), 'has_more', FALSE),
    'actions_available', '[]'::jsonb
  ) INTO v_result FROM dept_stats ds;
  
  RETURN v_result;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.ai_rpc_students_by_department(uuid, uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_students_by_department(uuid, uuid, text) TO authenticated;

-- ===== ai_rpc_admission_analytics — verbatim from supabase/migrations/20261204090000_fix_ai_rpc_lifecycle_status_literals.sql lines 43-79
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
REVOKE EXECUTE ON FUNCTION public.ai_rpc_admission_analytics(uuid, uuid, uuid, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_admission_analytics(uuid, uuid, uuid, boolean) TO authenticated;

-- ===== ai_rpc_admission_referrers — verbatim from supabase/migrations/20261204090000_fix_ai_rpc_lifecycle_status_literals.sql lines 84-137
CREATE OR REPLACE FUNCTION public.ai_rpc_admission_referrers(p_user_id uuid, p_reference_type text DEFAULT NULL::text, p_reference_name text DEFAULT NULL::text, p_institution_id uuid DEFAULT NULL::uuid, p_program_id uuid DEFAULT NULL::uuid, p_department_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text, p_date_from text DEFAULT NULL::text, p_date_to text DEFAULT NULL::text, p_top_n integer DEFAULT 10, p_include_details boolean DEFAULT true)
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

  WITH referrer_stats AS (
    SELECT
      reference_type,
      reference_name,
      reference_contact,
      COUNT(*) as total_referrals,
      COUNT(*) FILTER (WHERE lifecycle_status::TEXT IN ('admitted', 'active')) as converted_count,
      ROUND((COUNT(*) FILTER (WHERE lifecycle_status::TEXT IN ('admitted', 'active'))::NUMERIC / NULLIF(COUNT(*), 0)) * 100, 2) as conversion_rate,
      jsonb_agg(DISTINCT program_name) FILTER (WHERE program_name IS NOT NULL) as programs_referred,
      jsonb_agg(DISTINCT permanent_address_district) FILTER (WHERE permanent_address_district IS NOT NULL) as districts_covered
    FROM (
      SELECT lp.*, p.program_name
      FROM learners_profiles lp
      LEFT JOIN programs p ON lp.program_id = p.id
      WHERE (v_profile.is_super_admin = TRUE OR lp.institution_id = v_inst_id)
        AND lp.reference_type IS NOT NULL
        AND lp.reference_name IS NOT NULL
        AND (p_reference_type IS NULL OR lp.reference_type ILIKE p_reference_type)
        AND (p_reference_name IS NULL OR lp.reference_name ILIKE '%' || p_reference_name || '%')
        AND (p_program_id IS NULL OR lp.program_id = p_program_id)
        AND (p_department_id IS NULL OR lp.department_id = p_department_id)
        AND (p_status IS NULL OR lp.lifecycle_status::TEXT ILIKE p_status)
        AND (p_date_from IS NULL OR lp.created_at::DATE >= p_date_from::DATE)
        AND (p_date_to IS NULL OR lp.created_at::DATE <= p_date_to::DATE)
    ) referrals
    GROUP BY reference_type, reference_name, reference_contact
    ORDER BY total_referrals DESC, conversion_rate DESC
    LIMIT p_top_n
  )
  SELECT jsonb_build_object(
    'success', TRUE,
    'data', COALESCE(jsonb_agg(row_to_json(rs)::jsonb), '[]'::jsonb),
    'metadata', jsonb_build_object('total_count', (SELECT COUNT(*) FROM referrer_stats), 'returned_count', (SELECT COUNT(*) FROM referrer_stats), 'has_more', FALSE),
    'actions_available', '[]'::jsonb
  ) INTO v_result FROM referrer_stats rs;
  
  RETURN v_result;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.ai_rpc_admission_referrers(uuid, text, text, uuid, uuid, uuid, text, text, text, integer, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_admission_referrers(uuid, text, text, uuid, uuid, uuid, text, text, text, integer, boolean) TO authenticated;

-- ===== ai_rpc_academic_context — verbatim from supabase/migrations/20260712134500_ai_rpc_authuid_confused_deputy_sweep.sql lines 39-65
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
REVOKE EXECUTE ON FUNCTION public.ai_rpc_academic_context(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_academic_context(uuid) TO authenticated;

-- ===== ai_get_accessible_institutions — verbatim from supabase/migrations/20260712134500_ai_rpc_authuid_confused_deputy_sweep.sql lines 3563-3590
CREATE OR REPLACE FUNCTION public.ai_get_accessible_institutions(p_user_id uuid)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_institution_id uuid;
    v_result uuid[];
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN RETURN ARRAY[]::uuid[]; END IF;
  p_user_id := auth.uid();
    -- Get user's institution_id from profiles
    SELECT institution_id INTO v_user_institution_id
    FROM profiles WHERE id = p_user_id;
    
    -- If NULL, user has access to all institutions
    IF v_user_institution_id IS NULL THEN
        SELECT array_agg(id) INTO v_result FROM institutions WHERE is_active = true;
    ELSE
        -- User has access only to their institution
        v_result := ARRAY[v_user_institution_id];
    END IF;
    
    RETURN COALESCE(v_result, ARRAY[]::uuid[]);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.ai_get_accessible_institutions(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_get_accessible_institutions(uuid) TO authenticated;
