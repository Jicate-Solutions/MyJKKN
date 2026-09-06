-- ============================================================================
-- 20260712134500_ai_rpc_authuid_confused_deputy_sweep.sql
-- ----------------------------------------------------------------------------
-- SECURITY (confused-deputy / privilege escalation) — applied live 2026-07-12.
--
-- Every legacy ai_rpc_* AI-Query tool took `p_user_id uuid` and ran its
-- permission / super-admin / institution-scope lookup on THAT caller-supplied
-- param while being GRANTed to `authenticated`. The AI route always passes the
-- real session user's id, so legit calls were fine — but any authenticated user
-- could call the RPC directly via PostgREST + the public anon key, pass
-- `p_user_id = <a super_admin uuid>` (readable from profiles), and read across
-- every tenant. Proven live: a low-priv student forging a super uuid pulled
-- 4,486 learners (vs their honest 6) out of ai_rpc_students.
--
-- FIX: a plpgsql parameter is a mutable local. Pinning `p_user_id := auth.uid()`
-- at the top of each body rebinds every downstream use of p_user_id (identity
-- lookups, helper calls, self-filters) to the server-trusted caller, discarding
-- any forged value. Data/scoping logic is left byte-identical. A null-gate on
-- auth.uid() returns UNAUTHORIZED for unauthenticated callers.
--
-- Covers all 59 remaining vulnerable ai_rpc_* functions (the 7 child-app tools
-- from #1989 were already on auth.uid()) + the shared root helper
-- ai_get_accessible_institutions (secures 6 catalog tools) + repairs the broken
-- column names in ai_rpc_validate_permission (ur.role_id / ur.user_id).
--
-- Validated on prod in a rolled-back txn (all 60 compile; low-priv-forges-super
-- collapses to own scope; legit super unchanged at 4,486; no-jwt -> UNAUTHORIZED)
-- then applied. Coverage after: 66/66 ai_rpc_* reference auth.uid().
-- Ref: memory/feedback_ai_rpc_confused_deputy_p_user_id.md
-- ============================================================================

-- ===================================================================
-- Migration: authz-guard the legacy ai_rpc_* AI-Query tools
-- Confused-deputy fix: derive identity from auth.uid(), ignore p_user_id.
-- Generated 2026-07-12. Idempotent (CREATE OR REPLACE).
-- ===================================================================

-- ai_rpc_academic_context(p_institution_id uuid)
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

-- ai_rpc_academic_years(p_user_id uuid, p_institution_id uuid, p_limit integer, p_offset integer)
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

-- ai_rpc_admission_analytics(p_user_id uuid, p_institution_id uuid, p_academic_year_id uuid, p_include_trends boolean)
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
      COUNT(*) FILTER (WHERE lifecycle_status::TEXT IN ('admitted', 'registered', 'active')) as converted,
      ROUND((COUNT(*) FILTER (WHERE lifecycle_status::TEXT IN ('admitted', 'registered', 'active'))::NUMERIC / NULLIF(COUNT(*), 0)) * 100, 2) as conversion_rate,
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

-- ai_rpc_admission_details(p_user_id uuid, p_admission_id uuid, p_application_id text)
CREATE OR REPLACE FUNCTION public.ai_rpc_admission_details(p_user_id uuid, p_admission_id uuid DEFAULT NULL::uuid, p_application_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_result JSONB; v_profile RECORD;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  SELECT institution_id, is_super_admin INTO v_profile FROM profiles WHERE id = p_user_id;

  WITH admission AS (
    SELECT lp.*, 
           i.name as institution_name, deg.degree_name, d.department_name, 
           p.program_name, s.semester_name, sec.section_name
    FROM learners_profiles lp
    LEFT JOIN institutions i ON lp.institution_id = i.id
    LEFT JOIN degrees deg ON lp.degree_id = deg.id
    LEFT JOIN departments d ON lp.department_id = d.id
    LEFT JOIN programs p ON lp.program_id = p.id
    LEFT JOIN semesters s ON lp.semester_id = s.id
    LEFT JOIN sections sec ON lp.section_id = sec.id
    WHERE (v_profile.is_super_admin = TRUE OR lp.institution_id = v_profile.institution_id)
      AND (p_admission_id IS NULL OR lp.id = p_admission_id)
      AND (p_application_id IS NULL OR lp.application_id = p_application_id)
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'success', TRUE,
    'data', row_to_json(a)::jsonb,
    'metadata', jsonb_build_object('total_count', 1, 'returned_count', 1, 'has_more', FALSE),
    'actions_available', '[]'::jsonb
  ) INTO v_result FROM admission a;
  
  RETURN COALESCE(v_result, jsonb_build_object(
    'success', FALSE, 'data', NULL,
    'error', jsonb_build_object('code', 'NOT_FOUND', 'message', 'Admission not found')
  ));
END;
$function$;

-- ai_rpc_admission_referrers(p_user_id uuid, p_reference_type text, p_reference_name text, p_institution_id uuid, p_program_id uuid, p_department_id uuid, p_status text, p_date_from text, p_date_to text, p_top_n integer, p_include_details boolean)
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
      COUNT(*) FILTER (WHERE lifecycle_status::TEXT IN ('admitted', 'registered', 'active')) as converted_count,
      ROUND((COUNT(*) FILTER (WHERE lifecycle_status::TEXT IN ('admitted', 'registered', 'active'))::NUMERIC / NULLIF(COUNT(*), 0)) * 100, 2) as conversion_rate,
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

-- ai_rpc_admission_statistics(p_user_id uuid, p_institution_id uuid, p_date_from text, p_date_to text, p_group_by text)
CREATE OR REPLACE FUNCTION public.ai_rpc_admission_statistics(p_user_id uuid, p_institution_id uuid DEFAULT NULL::uuid, p_date_from text DEFAULT NULL::text, p_date_to text DEFAULT NULL::text, p_group_by text DEFAULT 'status'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_profile RECORD; v_inst_id UUID;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  SELECT p.id, p.role, p.is_super_admin, p.institution_id INTO v_profile FROM profiles p WHERE p.id = p_user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', FALSE, 'error', 'User profile not found'); END IF;
  IF v_profile.is_super_admin AND p_institution_id IS NOT NULL THEN v_inst_id := p_institution_id;
  ELSIF v_profile.institution_id IS NOT NULL THEN v_inst_id := v_profile.institution_id;
  ELSE v_inst_id := NULL; END IF;
  RETURN (
    WITH base_admissions AS (
      SELECT lp.*,
        cc.code AS community_code,
        d.department_name, prog.program_name, sem.semester_name, sec.section_name,
        deg.degree_name, ay.academic_year_name, bat.batch_name,
        reg.regulation_year, reg.regulation_code, i.name as institution_name
      FROM learners_profiles lp
      LEFT JOIN departments d ON lp.department_id = d.id
      LEFT JOIN programs prog ON lp.program_id = prog.id
      LEFT JOIN semesters sem ON lp.semester_id = sem.id
      LEFT JOIN sections sec ON lp.section_id = sec.id
      LEFT JOIN degrees deg ON lp.degree_id = deg.id
      LEFT JOIN academic_years ay ON lp.academic_year_id = ay.id
      LEFT JOIN batches bat ON lp.batch_id = bat.id
      LEFT JOIN regulations reg ON lp.regulation_id = reg.id
      LEFT JOIN institutions i ON lp.institution_id = i.id
      LEFT JOIN community_categories cc ON cc.id = lp.community_category_id
      WHERE lp.lifecycle_status::TEXT IN ('admitted', 'pending', 'approved', 'rejected', 'waitlisted', 'admitted', 'registered')
        AND (v_profile.is_super_admin = TRUE OR lp.institution_id = v_inst_id)
        AND (p_date_from IS NULL OR lp.created_at::DATE >= p_date_from::DATE)
        AND (p_date_to IS NULL OR lp.created_at::DATE <= p_date_to::DATE)
    ),
    by_status AS (
      SELECT jsonb_object_agg(status_name, cnt) as status_stats
      FROM (SELECT COALESCE(lifecycle_status::TEXT, 'Unknown') as status_name, COUNT(*) as cnt FROM base_admissions GROUP BY lifecycle_status::TEXT ORDER BY cnt DESC) status_counts
    ),
    by_department AS (
      SELECT jsonb_object_agg(dept_name, cnt) as dept_stats
      FROM (SELECT COALESCE(department_name, 'Unassigned') as dept_name, COUNT(*) as cnt FROM base_admissions WHERE department_id IS NOT NULL GROUP BY department_name ORDER BY cnt DESC) dept_counts
    ),
    by_program AS (
      SELECT jsonb_object_agg(prog_name, cnt) as prog_stats
      FROM (SELECT COALESCE(program_name, 'Unassigned') as prog_name, COUNT(*) as cnt FROM base_admissions WHERE program_id IS NOT NULL GROUP BY program_name ORDER BY cnt DESC) prog_counts
    ),
    by_degree AS (
      SELECT jsonb_object_agg(deg_name, cnt) as degree_stats
      FROM (SELECT COALESCE(degree_name, 'Unassigned') as deg_name, COUNT(*) as cnt FROM base_admissions WHERE degree_id IS NOT NULL GROUP BY degree_name ORDER BY cnt DESC) degree_counts
    ),
    by_academic_year AS (
      SELECT jsonb_object_agg(year_name, cnt) as year_stats
      FROM (SELECT COALESCE(academic_year_name, 'Unassigned') as year_name, COUNT(*) as cnt FROM base_admissions WHERE academic_year_id IS NOT NULL GROUP BY academic_year_name ORDER BY cnt DESC) year_counts
    ),
    by_batch AS (
      SELECT jsonb_object_agg(batch_name_val, cnt) as batch_stats
      FROM (SELECT COALESCE(batch_name, 'Unassigned') as batch_name_val, COUNT(*) as cnt FROM base_admissions WHERE batch_id IS NOT NULL GROUP BY batch_name ORDER BY cnt DESC) batch_counts
    ),
    by_regulation AS (
      SELECT jsonb_object_agg(reg_name, cnt) as reg_stats
      FROM (SELECT COALESCE(regulation_year || ' (' || regulation_code || ')', 'Unassigned') as reg_name, COUNT(*) as cnt FROM base_admissions WHERE regulation_id IS NOT NULL GROUP BY regulation_year, regulation_code ORDER BY cnt DESC) reg_counts
    ),
    by_gender AS (
      SELECT jsonb_object_agg(gender_val, cnt) as gender_stats
      FROM (SELECT COALESCE(gender, 'Not Specified') as gender_val, COUNT(*) as cnt FROM base_admissions GROUP BY gender ORDER BY cnt DESC) gender_counts
    ),
    by_community AS (
      SELECT jsonb_object_agg(community_val, cnt) as community_stats
      FROM (SELECT COALESCE(community_code, 'Not Specified') as community_val, COUNT(*) as cnt FROM base_admissions GROUP BY community_code ORDER BY cnt DESC) community_counts
    ),
    by_district AS (
      SELECT jsonb_object_agg(district_name, cnt) as district_stats
      FROM (SELECT COALESCE(permanent_address_district, 'Not Specified') as district_name, COUNT(*) as cnt FROM base_admissions WHERE permanent_address_district IS NOT NULL GROUP BY permanent_address_district ORDER BY cnt DESC LIMIT 20) district_counts
    ),
    summary_stats AS (
      SELECT COUNT(*) as total_admissions,
        COUNT(DISTINCT department_id) as total_departments,
        COUNT(DISTINCT program_id) as total_programs,
        COUNT(DISTINCT degree_id) as total_degrees,
        COUNT(CASE WHEN lifecycle_status::TEXT = 'approved' THEN 1 END) as approved_count,
        COUNT(CASE WHEN lifecycle_status::TEXT = 'rejected' THEN 1 END) as rejected_count,
        COUNT(CASE WHEN lifecycle_status::TEXT = 'pending' THEN 1 END) as pending_count,
        COUNT(CASE WHEN lifecycle_status::TEXT = 'waitlisted' THEN 1 END) as waitlisted_count
      FROM base_admissions
    )
    SELECT jsonb_build_object(
      'success', TRUE,
      'data', jsonb_build_object(
        'summary', (SELECT row_to_json(summary_stats)::jsonb FROM summary_stats),
        'by_status', COALESCE((SELECT status_stats FROM by_status), '{}'::jsonb),
        'by_department', COALESCE((SELECT dept_stats FROM by_department), '{}'::jsonb),
        'by_program', COALESCE((SELECT prog_stats FROM by_program), '{}'::jsonb),
        'by_degree', COALESCE((SELECT degree_stats FROM by_degree), '{}'::jsonb),
        'by_academic_year', COALESCE((SELECT year_stats FROM by_academic_year), '{}'::jsonb),
        'by_batch', COALESCE((SELECT batch_stats FROM by_batch), '{}'::jsonb),
        'by_regulation', COALESCE((SELECT reg_stats FROM by_regulation), '{}'::jsonb),
        'by_gender', COALESCE((SELECT gender_stats FROM by_gender), '{}'::jsonb),
        'by_community', COALESCE((SELECT community_stats FROM by_community), '{}'::jsonb),
        'by_district', COALESCE((SELECT district_stats FROM by_district), '{}'::jsonb)
      ),
      'metadata', jsonb_build_object('date_from', p_date_from, 'date_to', p_date_to, 'institution_id', v_inst_id)
    )
  );
END;
$function$;

-- ai_rpc_admissions(p_user_id uuid, p_institution_id uuid, p_department_id uuid, p_program_id uuid, p_degree_id uuid, p_status text, p_entry_type text, p_district text, p_state text, p_gender text, p_religion text, p_community text, p_counseling_applied boolean, p_first_graduate boolean, p_quota text, p_accommodation_type text, p_bus_required boolean, p_search text, p_date_from text, p_date_to text, p_include_stats boolean)
CREATE OR REPLACE FUNCTION public.ai_rpc_admissions(p_user_id uuid, p_institution_id uuid DEFAULT NULL::uuid, p_department_id uuid DEFAULT NULL::uuid, p_program_id uuid DEFAULT NULL::uuid, p_degree_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text, p_entry_type text DEFAULT NULL::text, p_district text DEFAULT NULL::text, p_state text DEFAULT NULL::text, p_gender text DEFAULT NULL::text, p_religion text DEFAULT NULL::text, p_community text DEFAULT NULL::text, p_counseling_applied boolean DEFAULT NULL::boolean, p_first_graduate boolean DEFAULT NULL::boolean, p_quota text DEFAULT NULL::text, p_accommodation_type text DEFAULT NULL::text, p_bus_required boolean DEFAULT NULL::boolean, p_search text DEFAULT NULL::text, p_date_from text DEFAULT NULL::text, p_date_to text DEFAULT NULL::text, p_include_stats boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_profile RECORD; v_inst_id UUID;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  SELECT p.id, p.role, p.is_super_admin, p.institution_id INTO v_profile FROM profiles p WHERE p.id = p_user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', FALSE, 'error', 'User profile not found'); END IF;
  IF v_profile.is_super_admin AND p_institution_id IS NOT NULL THEN v_inst_id := p_institution_id;
  ELSIF v_profile.institution_id IS NOT NULL THEN v_inst_id := v_profile.institution_id;
  ELSE v_inst_id := NULL; END IF;
  RETURN (
    WITH admissions_data AS (
      SELECT
        lp.id, lp.application_id, lp.first_name, lp.last_name, lp.date_of_birth,
        lp.gender, lp.religion,
        cst.name AS caste,
        cc.code AS community,
        q.name AS quota,
        lp.student_email, lp.student_mobile, lp.father_name, lp.father_mobile,
        lp.mother_name, lp.mother_mobile, lp.permanent_address_street,
        lp.permanent_address_taluk, lp.permanent_address_district,
        lp.permanent_address_state, lp.permanent_address_pin_code,
        lp.entry_type, acc.code AS accommodation_type, lp.bus_required,
        lp.counseling_applied, lp.tenth_marks, lp.twelfth_marks, lp.neet_score,
        lp.lifecycle_status, lp.created_at,
        lp.institution_id, i.name as institution_name,
        lp.department_id, d.department_name,
        lp.program_id, prog.program_name,
        lp.degree_id, deg.degree_name,
        lp.academic_year_id, ay.academic_year_name,
        lp.batch_id, bat.batch_name,
        lp.regulation_id, reg.regulation_year, reg.regulation_code
      FROM learners_profiles lp
      LEFT JOIN institutions i    ON lp.institution_id    = i.id
      LEFT JOIN departments d     ON lp.department_id     = d.id
      LEFT JOIN programs prog     ON lp.program_id        = prog.id
      LEFT JOIN degrees deg       ON lp.degree_id         = deg.id
      LEFT JOIN academic_years ay ON lp.academic_year_id  = ay.id
      LEFT JOIN batches bat       ON lp.batch_id          = bat.id
      LEFT JOIN regulations reg   ON lp.regulation_id     = reg.id
      LEFT JOIN quotas q          ON q.id                 = lp.quota_id
      LEFT JOIN community_categories cc ON cc.id          = lp.community_category_id
      LEFT JOIN castes cst        ON cst.id               = lp.caste_id
      LEFT JOIN accommodation_types acc ON acc.id         = lp.accommodation_type_id
      WHERE lp.lifecycle_status::TEXT IN ('admitted', 'pending', 'approved', 'rejected', 'waitlisted', 'admitted', 'registered')
        AND (v_profile.is_super_admin = TRUE OR lp.institution_id = v_inst_id)
        AND (p_institution_id     IS NULL OR lp.institution_id              = p_institution_id)
        AND (p_department_id      IS NULL OR lp.department_id               = p_department_id)
        AND (p_program_id         IS NULL OR lp.program_id                  = p_program_id)
        AND (p_degree_id          IS NULL OR lp.degree_id                   = p_degree_id)
        AND (p_status             IS NULL OR lp.lifecycle_status::TEXT      ILIKE p_status)
        AND (p_entry_type         IS NULL OR lp.entry_type                  ILIKE p_entry_type)
        AND (p_district           IS NULL OR lp.permanent_address_district  ILIKE p_district)
        AND (p_state              IS NULL OR lp.permanent_address_state     ILIKE p_state)
        AND (p_gender             IS NULL OR lp.gender                      ILIKE p_gender)
        AND (p_religion           IS NULL OR lp.religion                    ILIKE p_religion)
        AND (p_community          IS NULL OR cc.code ILIKE p_community OR cc.name ILIKE p_community)
        AND (p_counseling_applied IS NULL OR lp.counseling_applied          = p_counseling_applied)
        AND (p_quota              IS NULL OR q.name ILIKE p_quota OR q.code ILIKE p_quota)
        AND (p_accommodation_type IS NULL OR acc.code ILIKE p_accommodation_type OR acc.name ILIKE p_accommodation_type)
        AND (p_bus_required       IS NULL OR lp.bus_required                = p_bus_required)
        AND (p_date_from          IS NULL OR lp.created_at::DATE            >= p_date_from::DATE)
        AND (p_date_to            IS NULL OR lp.created_at::DATE            <= p_date_to::DATE)
        AND (
          p_search IS NULL OR
          lp.first_name      ILIKE '%' || p_search || '%' OR
          lp.last_name       ILIKE '%' || p_search || '%' OR
          lp.application_id  ILIKE '%' || p_search || '%' OR
          lp.student_email   ILIKE '%' || p_search || '%'
        )
      ORDER BY lp.created_at DESC
      LIMIT 100
    ),
    stats AS (
      SELECT COUNT(*) as total_count,
        COUNT(CASE WHEN lifecycle_status::TEXT = 'approved'   THEN 1 END) as approved_count,
        COUNT(CASE WHEN lifecycle_status::TEXT = 'rejected'   THEN 1 END) as rejected_count,
        COUNT(CASE WHEN lifecycle_status::TEXT = 'pending'    THEN 1 END) as pending_count,
        COUNT(CASE WHEN lifecycle_status::TEXT = 'waitlisted' THEN 1 END) as waitlisted_count
      FROM admissions_data
    )
    SELECT jsonb_build_object(
      'success', TRUE,
      'data', COALESCE(jsonb_agg(row_to_json(admissions_data)::jsonb), '[]'::jsonb),
      'metadata', CASE
        WHEN p_include_stats THEN (SELECT row_to_json(stats)::jsonb FROM stats)
        ELSE jsonb_build_object('total_count', (SELECT COUNT(*) FROM admissions_data))
      END
    )
    FROM admissions_data
  );
END;
$function$;

-- ai_rpc_admissions_by_location(p_user_id uuid, p_district text, p_state text, p_taluk text, p_city text, p_status text, p_include_stats boolean)
CREATE OR REPLACE FUNCTION public.ai_rpc_admissions_by_location(p_user_id uuid, p_district text DEFAULT NULL::text, p_state text DEFAULT NULL::text, p_taluk text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_include_stats boolean DEFAULT true)
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
  v_inst_id := v_profile.institution_id;

  WITH location_admissions AS (
    SELECT lp.id, lp.application_id, lp.first_name, lp.last_name,
           lp.lifecycle_status, lp.permanent_address_district, lp.permanent_address_state,
           lp.permanent_address_taluk, lp.bus_pickup_location,
           d.department_name, p.program_name
    FROM learners_profiles lp
    LEFT JOIN departments d ON lp.department_id = d.id
    LEFT JOIN programs p ON lp.program_id = p.id
    WHERE (v_profile.is_super_admin = TRUE OR lp.institution_id = v_inst_id)
      AND lp.lifecycle_status::TEXT IN ('admitted', 'admitted', 'registered')
      AND (p_status IS NULL OR lp.lifecycle_status::TEXT ILIKE p_status)
      AND (p_district IS NULL OR lp.permanent_address_district ILIKE '%' || p_district || '%')
      AND (p_state IS NULL OR lp.permanent_address_state ILIKE '%' || p_state || '%')
      AND (p_taluk IS NULL OR lp.permanent_address_taluk ILIKE '%' || p_taluk || '%')
    ORDER BY lp.permanent_address_district, lp.first_name
  ),
  location_stats AS (
    SELECT permanent_address_district as district, COUNT(*) as count
    FROM location_admissions
    GROUP BY permanent_address_district
    ORDER BY count DESC
  )
  SELECT jsonb_build_object(
    'success', TRUE,
    'data', COALESCE(jsonb_agg(row_to_json(la)::jsonb), '[]'::jsonb),
    'metadata', jsonb_build_object(
      'total_count', (SELECT COUNT(*) FROM location_admissions),
      'returned_count', (SELECT COUNT(*) FROM location_admissions),
      'has_more', FALSE,
      'location_stats', CASE WHEN p_include_stats THEN (SELECT jsonb_agg(row_to_json(ls)::jsonb) FROM location_stats ls) ELSE NULL END
    ),
    'actions_available', '[]'::jsonb
  ) INTO v_result FROM location_admissions la;
  
  RETURN v_result;
END;
$function$;

-- ai_rpc_app_favorites(p_user_id uuid, p_limit integer, p_offset integer)
CREATE OR REPLACE FUNCTION public.ai_rpc_app_favorites(p_user_id uuid, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  -- Check if app_favorites table exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'app_favorites') THEN
    RETURN jsonb_build_object(
      'success', true,
      'data', '[]'::jsonb,
      'metadata', jsonb_build_object(
        'total_count', 0,
        'returned_count', 0,
        'has_more', false,
        'filters_applied', jsonb_build_object()
      )
    );
  END IF;
  
  -- Return applications that user has favorited
  SELECT jsonb_build_object(
    'success', true,
    'data', COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb),
    'metadata', jsonb_build_object(
      'total_count', COUNT(*) OVER(),
      'returned_count', COUNT(*),
      'has_more', COUNT(*) OVER() > p_offset + p_limit,
      'filters_applied', jsonb_build_object()
    )
  )
  INTO v_result
  FROM (
    SELECT 
      a.id,
      a.name,
      a.description,
      a.url,
      a.icon_path,
      a.application_type,
      a.is_active
    FROM applications a
    WHERE a.is_active = true
    ORDER BY a.name
    LIMIT p_limit
    OFFSET p_offset
  ) t;
  
  RETURN v_result;
END;
$function$;

-- ai_rpc_applications_hub(p_user_id uuid, p_category_id uuid, p_search text, p_limit integer, p_offset integer)
CREATE OR REPLACE FUNCTION public.ai_rpc_applications_hub(p_user_id uuid, p_category_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_user_role text;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  -- Get user's role
  SELECT role INTO v_user_role FROM profiles WHERE id = p_user_id;
  
  SELECT jsonb_build_object(
    'success', true,
    'data', COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb),
    'metadata', jsonb_build_object(
      'total_count', COUNT(*) OVER(),
      'returned_count', COUNT(*),
      'has_more', COUNT(*) OVER() > p_offset + p_limit,
      'filters_applied', jsonb_build_object(
        'category_id', p_category_id,
        'search', p_search
      )
    )
  )
  INTO v_result
  FROM (
    SELECT 
      a.id,
      a.name,
      a.description,
      a.url,
      a.icon_path,
      a.application_type,
      a.integration_type,
      a.is_active,
      a.display_order,
      a.tags,
      a.supported_platforms,
      a.category_id,
      a.subcategory_id,
      a.created_at
    FROM applications a
    WHERE a.is_active = true
    AND (v_user_role = ANY(a.roles_access) OR a.roles_access IS NULL OR array_length(a.roles_access, 1) = 0)
    AND (p_category_id IS NULL OR a.category_id = p_category_id)
    AND (p_search IS NULL OR 
         a.name ILIKE '%' || p_search || '%' OR
         a.description ILIKE '%' || p_search || '%')
    ORDER BY a.display_order, a.name
    LIMIT p_limit
    OFFSET p_offset
  ) t;
  
  RETURN v_result;
END;
$function$;

-- ai_rpc_attendance(p_user_id uuid, p_student_id uuid, p_section_id uuid, p_department_id uuid, p_date_from text, p_date_to text, p_threshold numeric, p_limit integer, p_offset integer)
CREATE OR REPLACE FUNCTION public.ai_rpc_attendance(p_user_id uuid, p_student_id uuid DEFAULT NULL::uuid, p_section_id uuid DEFAULT NULL::uuid, p_department_id uuid DEFAULT NULL::uuid, p_date_from text DEFAULT NULL::text, p_date_to text DEFAULT NULL::text, p_threshold numeric DEFAULT NULL::numeric, p_limit integer DEFAULT 10000, p_offset integer DEFAULT 0)
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
  v_inst_id := v_profile.institution_id;

  WITH attendance AS (
    SELECT lp.id, lp.first_name, lp.last_name, lp.roll_number,
           d.department_name, s.section_name,
           COUNT(da.id) as total_periods,
           COUNT(da.id) FILTER (WHERE da.status = 'present') as present_count,
           ROUND((COUNT(da.id) FILTER (WHERE da.status = 'present')::NUMERIC / NULLIF(COUNT(da.id), 0)) * 100, 2) as attendance_percentage
    FROM learners_profiles lp
    LEFT JOIN daily_attendance da ON lp.id = da.student_id
    LEFT JOIN departments d ON lp.department_id = d.id
    LEFT JOIN sections s ON lp.section_id = s.id
    WHERE (v_profile.is_super_admin = TRUE OR lp.institution_id = v_inst_id)
      AND (p_student_id IS NULL OR lp.id = p_student_id)
      AND (p_section_id IS NULL OR lp.section_id = p_section_id)
      AND (p_department_id IS NULL OR lp.department_id = p_department_id)
      AND (p_date_from IS NULL OR da.attendance_date >= p_date_from::DATE)
      AND (p_date_to IS NULL OR da.attendance_date <= p_date_to::DATE)
    GROUP BY lp.id, lp.first_name, lp.last_name, lp.roll_number, d.department_name, s.section_name
    HAVING p_threshold IS NULL OR (COUNT(da.id) FILTER (WHERE da.status = 'present')::NUMERIC / NULLIF(COUNT(da.id), 0)) * 100 < p_threshold
    ORDER BY attendance_percentage ASC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT jsonb_build_object(
    'success', TRUE,
    'data', COALESCE(jsonb_agg(row_to_json(a)::jsonb), '[]'::jsonb),
    'metadata', jsonb_build_object('total_count', (SELECT COUNT(*) FROM attendance), 'returned_count', (SELECT COUNT(*) FROM attendance), 'has_more', FALSE),
    'actions_available', '[]'::jsonb
  ) INTO v_result FROM attendance a;
  
  RETURN v_result;
END;
$function$;

-- ai_rpc_attendance_defaulters(p_user_id uuid, p_department_id uuid, p_threshold numeric, p_semester text, p_limit integer, p_offset integer)
CREATE OR REPLACE FUNCTION public.ai_rpc_attendance_defaulters(p_user_id uuid, p_department_id uuid DEFAULT NULL::uuid, p_threshold numeric DEFAULT 75, p_semester text DEFAULT 'current'::text, p_limit integer DEFAULT 10000, p_offset integer DEFAULT 0)
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
  v_inst_id := v_profile.institution_id;

  WITH defaulters AS (
    SELECT lp.id, lp.first_name, lp.last_name, lp.roll_number, lp.student_mobile,
           d.department_name, s.section_name, sem.semester_name,
           COUNT(da.id) as total_periods,
           COUNT(da.id) FILTER (WHERE da.status = 'present') as present_count,
           ROUND((COUNT(da.id) FILTER (WHERE da.status = 'present')::NUMERIC / NULLIF(COUNT(da.id), 0)) * 100, 2) as attendance_percentage
    FROM learners_profiles lp
    INNER JOIN daily_attendance da ON lp.id = da.student_id
    LEFT JOIN departments d ON lp.department_id = d.id
    LEFT JOIN sections s ON lp.section_id = s.id
    LEFT JOIN semesters sem ON lp.semester_id = sem.id
    WHERE (v_profile.is_super_admin = TRUE OR lp.institution_id = v_inst_id)
      AND (p_department_id IS NULL OR lp.department_id = p_department_id)
      AND lp.lifecycle_status::TEXT = 'active'
    GROUP BY lp.id, lp.first_name, lp.last_name, lp.roll_number, lp.student_mobile, 
             d.department_name, s.section_name, sem.semester_name
    HAVING (COUNT(da.id) FILTER (WHERE da.status = 'present')::NUMERIC / NULLIF(COUNT(da.id), 0)) * 100 < p_threshold
    ORDER BY attendance_percentage ASC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT jsonb_build_object(
    'success', TRUE,
    'data', COALESCE(jsonb_agg(row_to_json(d)::jsonb), '[]'::jsonb),
    'metadata', jsonb_build_object('total_count', (SELECT COUNT(*) FROM defaulters), 'returned_count', (SELECT COUNT(*) FROM defaulters), 'has_more', FALSE),
    'actions_available', jsonb_build_array(
      jsonb_build_object('id', 'send_attendance_alert', 'label', 'Send Attendance Alert', 'tier', 2)
    )
  ) INTO v_result FROM defaulters d;
  
  RETURN v_result;
END;
$function$;

-- ai_rpc_attendance_summary(p_user_id uuid, p_student_id uuid, p_section_id uuid, p_department_id uuid, p_date_from text, p_date_to text)
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

-- ai_rpc_billing_categories(p_user_id uuid, p_institution_id uuid, p_limit integer, p_offset integer)
CREATE OR REPLACE FUNCTION public.ai_rpc_billing_categories(p_user_id uuid, p_institution_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  -- Categories are now global, p_institution_id retained for RPC signature stability but ignored.
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
      bc.id,
      bc.category_name,
      bc.amount,
      bc.frequency,
      bc.description,
      bc.is_active,
      bc.created_at
    FROM billing_categories bc
    ORDER BY bc.category_name
    LIMIT p_limit
    OFFSET p_offset
  ) t;

  RETURN v_result;
END;
$function$;

-- ai_rpc_bug_report_details(p_user_id uuid, p_bug_report_id uuid)
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

-- ai_rpc_bug_reports(p_user_id uuid, p_status text, p_priority text, p_limit integer, p_offset integer)
CREATE OR REPLACE FUNCTION public.ai_rpc_bug_reports(p_user_id uuid, p_status text DEFAULT NULL::text, p_priority text DEFAULT NULL::text, p_limit integer DEFAULT 10000, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_result jsonb;
    v_count integer;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
    SELECT COUNT(*)
    INTO v_count
    FROM bug_reports br
    WHERE (p_status IS NULL OR br.status = p_status)
      AND (p_priority IS NULL OR br.priority = p_priority);

    SELECT jsonb_build_object(
        'success', true,
        'data', COALESCE(jsonb_agg(row_to_json(bug)), '[]'::jsonb),
        'metadata', jsonb_build_object(
            'total_count', v_count,
            'returned_count', COUNT(*),
            'has_more', v_count > p_offset + p_limit,
            'filters_applied', jsonb_build_object('status', p_status, 'priority', p_priority)
        ),
        'actions_available', '[]'::jsonb
    )
    INTO v_result
    FROM (
        SELECT
            br.id,
            br.reporter_user_id,
            pr.full_name as reporter_name,
            br.status,
            br.priority,
            br.module,
            br.description,
            br.created_at
        FROM bug_reports br
        LEFT JOIN profiles pr ON br.reporter_user_id = pr.id
        WHERE (p_status IS NULL OR br.status = p_status)
          AND (p_priority IS NULL OR br.priority = p_priority)
        ORDER BY br.created_at DESC
        LIMIT p_limit OFFSET p_offset
    ) bug;

    RETURN v_result;
END;
$function$;

-- ai_rpc_bulk_notification(p_user_id uuid, p_recipient_ids uuid[], p_title text, p_message text, p_type text, p_priority text)
CREATE OR REPLACE FUNCTION public.ai_rpc_bulk_notification(p_user_id uuid, p_recipient_ids uuid[], p_title text, p_message text, p_type text DEFAULT 'info'::text, p_priority text DEFAULT 'normal'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_scope JSONB;
  v_notification_id UUID;
  v_recipient_count INTEGER;
  v_daily_count INTEGER;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  v_scope := ai_rpc_accessible_scope(p_user_id);
  
  -- Check permission
  IF NOT ai_rpc_validate_permission(p_user_id, 'notifications.bulk') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', jsonb_build_object(
        'code', 'PERMISSION_DENIED',
        'message', 'You do not have permission to send bulk notifications.'
      )
    );
  END IF;
  
  -- Check daily limit
  SELECT COALESCE(bulk_action_count, 0) INTO v_daily_count
  FROM ai_query_rate_limits
  WHERE user_id = p_user_id;
  
  IF v_daily_count + array_length(p_recipient_ids, 1) > 500 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', jsonb_build_object(
        'code', 'BULK_LIMIT_EXCEEDED',
        'message', 'Daily bulk action limit (500) would be exceeded. You have used ' || v_daily_count || ' today.'
      )
    );
  END IF;
  
  -- Create notification
  INSERT INTO notifications (title, message, type, priority, created_by)
  VALUES (p_title, p_message, p_type, p_priority, p_user_id)
  RETURNING id INTO v_notification_id;
  
  -- Create user notifications
  INSERT INTO user_notifications (notification_id, user_id)
  SELECT v_notification_id, unnest(p_recipient_ids);
  
  GET DIAGNOSTICS v_recipient_count = ROW_COUNT;
  
  -- Update bulk action count
  PERFORM increment_ai_bulk_action_count(p_user_id, v_recipient_count);
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Bulk notification sent to ' || v_recipient_count || ' recipient(s).',
    'affected_count', v_recipient_count,
    'notification_id', v_notification_id
  );
END;
$function$;

-- ai_rpc_courses(p_user_id uuid, p_institution_id uuid, p_limit integer, p_offset integer)
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

-- ai_rpc_custom_roles(p_user_id uuid, p_limit integer, p_offset integer)
CREATE OR REPLACE FUNCTION public.ai_rpc_custom_roles(p_user_id uuid, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  SELECT jsonb_build_object(
    'success', true,
    'data', COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb),
    'metadata', jsonb_build_object(
      'total_count', COUNT(*) OVER(),
      'returned_count', COUNT(*),
      'has_more', COUNT(*) OVER() > p_offset + p_limit,
      'filters_applied', jsonb_build_object()
    )
  )
  INTO v_result
  FROM (
    SELECT 
      cr.id,
      cr.role_key,
      cr.role_name,
      cr.description,
      cr.is_system_role,
      cr.permissions,
      (SELECT COUNT(*) FROM user_roles ur WHERE ur.role_id = cr.id) as users_count,
      cr.created_at
    FROM custom_roles cr
    ORDER BY cr.role_name
    LIMIT p_limit
    OFFSET p_offset
  ) t;
  
  RETURN v_result;
END;
$function$;

-- ai_rpc_dashboard_widgets(p_user_id uuid, p_limit integer, p_offset integer)
CREATE OR REPLACE FUNCTION public.ai_rpc_dashboard_widgets(p_user_id uuid, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  SELECT jsonb_build_object(
    'success', true,
    'data', COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb),
    'metadata', jsonb_build_object(
      'total_count', COUNT(*) OVER(),
      'returned_count', COUNT(*),
      'has_more', COUNT(*) OVER() > p_offset + p_limit,
      'filters_applied', jsonb_build_object()
    )
  )
  INTO v_result
  FROM (
    SELECT 
      dw.id,
      dw.configuration_id,
      dw.widget_type_id,
      dw.position_x,
      dw.position_y,
      dw.width,
      dw.height,
      dw.widget_config,
      dw.is_visible,
      dw.sort_order,
      dw.created_at
    FROM dashboard_widgets dw
    WHERE dw.is_visible = true
    ORDER BY dw.sort_order
    LIMIT p_limit
    OFFSET p_offset
  ) t;
  
  RETURN v_result;
END;
$function$;

-- ai_rpc_degrees(p_user_id uuid, p_institution_id uuid, p_limit integer, p_offset integer)
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

-- ai_rpc_departments(p_user_id uuid, p_institution_id uuid, p_limit integer, p_offset integer)
CREATE OR REPLACE FUNCTION public.ai_rpc_departments(p_user_id uuid, p_institution_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 10000, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_result jsonb;
    v_count integer;
    v_accessible_institutions uuid[];
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
    v_accessible_institutions := ai_get_accessible_institutions(p_user_id);

    SELECT COUNT(*)
    INTO v_count
    FROM departments d
    WHERE (p_institution_id IS NULL OR d.institution_id = p_institution_id)
      AND d.institution_id = ANY(v_accessible_institutions);

    SELECT jsonb_build_object(
        'success', true,
        'data', COALESCE(jsonb_agg(row_to_json(dept)), '[]'::jsonb),
        'metadata', jsonb_build_object(
            'total_count', v_count,
            'returned_count', COUNT(*),
            'has_more', v_count > p_offset + p_limit,
            'filters_applied', jsonb_build_object('institution_id', p_institution_id)
        ),
        'actions_available', '[]'::jsonb
    )
    INTO v_result
    FROM (
        SELECT d.id, d.department_name, d.department_code, d.institution_id,
               i.name as institution_name, d.is_active, d.created_at
        FROM departments d
        LEFT JOIN institutions i ON d.institution_id = i.id
        WHERE (p_institution_id IS NULL OR d.institution_id = p_institution_id)
          AND d.institution_id = ANY(v_accessible_institutions)
        ORDER BY d.department_name
        LIMIT p_limit OFFSET p_offset
    ) dept;

    RETURN v_result;
END;
$function$;

-- ai_rpc_employment_categories(p_user_id uuid, p_limit integer, p_offset integer)
CREATE OR REPLACE FUNCTION public.ai_rpc_employment_categories(p_user_id uuid, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  SELECT jsonb_build_object(
    'success', true,
    'data', COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb),
    'metadata', jsonb_build_object(
      'total_count', COUNT(*) OVER(),
      'returned_count', COUNT(*),
      'has_more', COUNT(*) OVER() > p_offset + p_limit,
      'filters_applied', jsonb_build_object()
    )
  )
  INTO v_result
  FROM (
    SELECT 
      ec.id,
      ec.category_name,
      ec.description,
      ec.is_active,
      (SELECT COUNT(*) FROM staff st WHERE st.category_id = ec.id) as staff_count
    FROM employment_categories ec
    WHERE ec.is_active = true
    ORDER BY ec.category_name
    LIMIT p_limit
    OFFSET p_offset
  ) t;
  
  RETURN v_result;
END;
$function$;

-- ai_rpc_export_data(p_user_id uuid, p_data_source text, p_filters jsonb)
CREATE OR REPLACE FUNCTION public.ai_rpc_export_data(p_user_id uuid, p_data_source text, p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result JSONB;
  v_data JSONB;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  -- Call the appropriate RPC function based on data source
  CASE p_data_source
    WHEN 'students' THEN
      v_data := ai_rpc_students(p_user_id, 
        (p_filters->>'department_id')::UUID,
        (p_filters->>'program_id')::UUID,
        (p_filters->>'semester_id')::UUID,
        (p_filters->>'section_id')::UUID,
        p_filters->>'status',
        p_filters->>'search',
        10000, 0);
    WHEN 'staff' THEN
      v_data := ai_rpc_staff(p_user_id,
        (p_filters->>'department_id')::UUID,
        (p_filters->>'employment_category_id')::UUID,
        p_filters->>'status',
        p_filters->>'search',
        10000, 0);
    WHEN 'attendance_defaulters' THEN
      v_data := ai_rpc_attendance_defaulters(p_user_id,
        (p_filters->>'department_id')::UUID,
        COALESCE((p_filters->>'threshold')::NUMERIC, 75),
        COALESCE(p_filters->>'semester', 'current'),
        10000, 0);
    WHEN 'fee_defaulters' THEN
      v_data := ai_rpc_fee_defaulters(p_user_id,
        (p_filters->>'department_id')::UUID,
        COALESCE(p_filters->>'status', 'overdue'),
        (p_filters->>'min_amount')::NUMERIC,
        (p_filters->>'due_before')::DATE,
        10000, 0);
    ELSE
      RETURN jsonb_build_object(
        'success', false,
        'error', jsonb_build_object(
          'code', 'INVALID_SOURCE',
          'message', 'Unknown data source for export.'
        )
      );
  END CASE;
  
  -- Return the data formatted for export
  RETURN jsonb_build_object(
    'success', true,
    'data', v_data->'data',
    'export_format', 'csv',
    'filename', p_data_source || '_export_' || TO_CHAR(NOW(), 'YYYY-MM-DD_HH24MI') || '.csv',
    'metadata', v_data->'metadata'
  );
END;
$function$;

-- ai_rpc_faculty_assignments(p_user_id uuid, p_staff_id uuid, p_department_id uuid, p_limit integer, p_offset integer)
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

-- ai_rpc_fee_defaulters(p_user_id uuid, p_department_id uuid, p_status text, p_min_amount numeric, p_due_before text, p_limit integer, p_offset integer)
CREATE OR REPLACE FUNCTION public.ai_rpc_fee_defaulters(p_user_id uuid, p_department_id uuid DEFAULT NULL::uuid, p_status text DEFAULT 'overdue'::text, p_min_amount numeric DEFAULT NULL::numeric, p_due_before text DEFAULT NULL::text, p_limit integer DEFAULT 10000, p_offset integer DEFAULT 0)
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
  v_inst_id := v_profile.institution_id;

  WITH defaulters AS (
    SELECT lp.id, lp.first_name, lp.last_name, lp.roll_number, lp.student_mobile,
           d.department_name, s.section_name,
           bb.bill_number, bb.bill_amount, bb.bill_balance, bb.status, bb.due_date
    FROM learners_profiles lp
    INNER JOIN billing_bills bb ON lp.id = bb.student_id
    LEFT JOIN departments d ON lp.department_id = d.id
    LEFT JOIN sections s ON lp.section_id = s.id
    WHERE (v_profile.is_super_admin = TRUE OR bb.institution_id = v_inst_id)
      AND (p_department_id IS NULL OR lp.department_id = p_department_id)
      AND bb.status IN ('unpaid', 'partially_paid', 'overdue')
      AND bb.bill_balance > 0
      AND (p_min_amount IS NULL OR bb.bill_balance >= p_min_amount)
      AND (p_due_before IS NULL OR bb.due_date <= p_due_before::DATE)
    ORDER BY bb.bill_balance DESC, bb.due_date ASC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT jsonb_build_object(
    'success', TRUE,
    'data', COALESCE(jsonb_agg(row_to_json(d)::jsonb), '[]'::jsonb),
    'metadata', jsonb_build_object('total_count', (SELECT COUNT(*) FROM defaulters), 'returned_count', (SELECT COUNT(*) FROM defaulters), 'has_more', FALSE),
    'actions_available', jsonb_build_array(
      jsonb_build_object('id', 'send_reminder', 'label', 'Send Fee Reminder', 'tier', 2),
      jsonb_build_object('id', 'export_csv', 'label', 'Export Defaulters', 'tier', 1)
    )
  ) INTO v_result FROM defaulters d;
  
  RETURN v_result;
END;
$function$;

-- ai_rpc_hierarchy_summary(p_user_id uuid, p_institution_id uuid)
CREATE OR REPLACE FUNCTION public.ai_rpc_hierarchy_summary(p_user_id uuid, p_institution_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_profile RECORD;
  v_institution_id UUID;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  -- Get user profile
  SELECT
    p.id,
    p.role,
    p.is_super_admin,
    p.institution_id
  INTO v_profile
  FROM profiles p
  WHERE p.id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'User profile not found'
    );
  END IF;

  -- Determine institution scope
  IF v_profile.is_super_admin THEN
    v_institution_id := COALESCE(p_institution_id, v_profile.institution_id);
  ELSE
    v_institution_id := v_profile.institution_id;
  END IF;

  -- Build hierarchy summary with CORRECT column names
  RETURN jsonb_build_object(
    'success', TRUE,
    'data', jsonb_build_object(
      'institution', (
        SELECT jsonb_build_object(
          'id', i.id,
          'name', i.name,  -- FIXED: was i.institution_name
          'type', i.institution_type,
          'counselling_code', i.counselling_code
        )
        FROM institutions i
        WHERE i.id = v_institution_id
      ),
      'departments', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', d.id,
          'name', d.department_name,
          'code', d.department_code,
          'total_students', (
            SELECT COUNT(*) FROM learners_profiles lp
            WHERE lp.department_id = d.id
            AND lp.lifecycle_status = 'active'
          )
        )), '[]'::jsonb)
        FROM departments d
        WHERE d.institution_id = v_institution_id
      ),
      'programs', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', pr.id,
          'name', pr.program_name,
          'department_id', pr.department_id,
          'total_students', (
            SELECT COUNT(*) FROM learners_profiles lp
            WHERE lp.program_id = pr.id
            AND lp.lifecycle_status = 'active'
          )
        )), '[]'::jsonb)
        FROM programs pr
        WHERE pr.institution_id = v_institution_id
      ),
      'sections', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', s.id,
          'name', s.section_name,
          'department_id', s.department_id,
          'semester_id', s.semester_id,
          'total_students', (
            SELECT COUNT(*) FROM learners_profiles lp
            WHERE lp.section_id = s.id
            AND lp.lifecycle_status = 'active'
          )
        )), '[]'::jsonb)
        FROM sections s
        WHERE s.institution_id = v_institution_id
      )
    ),
    'metadata', jsonb_build_object(
      'institution_id', v_institution_id,
      'generated_at', NOW()
    )
  );
END;
$function$;

-- ai_rpc_institution_access(p_user_id uuid, p_target_user_id uuid, p_institution_id uuid, p_limit integer, p_offset integer)
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

-- ai_rpc_kpi_summary(p_user_id uuid, p_institution_id uuid)
CREATE OR REPLACE FUNCTION public.ai_rpc_kpi_summary(p_user_id uuid, p_institution_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_profile RECORD;
  v_institution_id UUID;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  -- Get user profile
  SELECT
    p.id,
    p.role,
    p.is_super_admin,
    p.institution_id
  INTO v_profile
  FROM profiles p
  WHERE p.id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'User profile not found'
    );
  END IF;

  -- Determine institution scope
  IF v_profile.is_super_admin THEN
    v_institution_id := COALESCE(p_institution_id, v_profile.institution_id);
  ELSE
    v_institution_id := v_profile.institution_id;
  END IF;

  -- Build KPI summary with CORRECT table and column names
  RETURN jsonb_build_object(
    'success', TRUE,
    'data', jsonb_build_object(
      'learners', jsonb_build_object(
        'total_enquiries', (
          SELECT COUNT(*) FROM learners_profiles
          WHERE institution_id = v_institution_id
          AND lifecycle_status = 'admitted'
        ),
        'total_pending_admissions', (
          SELECT COUNT(*) FROM learners_profiles
          WHERE institution_id = v_institution_id
          AND lifecycle_status = 'pending'
        ),
        'total_approved_admissions', (
          SELECT COUNT(*) FROM learners_profiles
          WHERE institution_id = v_institution_id
          AND lifecycle_status = 'approved'
        ),
        'total_active_students', (
          SELECT COUNT(*) FROM learners_profiles
          WHERE institution_id = v_institution_id
          AND lifecycle_status = 'active'
        ),
        'total_graduated', (
          SELECT COUNT(*) FROM learners_profiles
          WHERE institution_id = v_institution_id
          AND lifecycle_status = 'graduated'
        ),
        'total_exited', (
          SELECT COUNT(*) FROM learners_profiles
          WHERE institution_id = v_institution_id
          AND lifecycle_status = 'exited'
        )
      ),
      'departments', jsonb_build_object(
        'total_count', (
          SELECT COUNT(*) FROM departments
          WHERE institution_id = v_institution_id
        )
      ),
      'programs', jsonb_build_object(
        'total_count', (
          SELECT COUNT(*) FROM programs
          WHERE institution_id = v_institution_id
        )
      ),
      'sections', jsonb_build_object(
        'total_count', (
          SELECT COUNT(*) FROM sections
          WHERE institution_id = v_institution_id
        )
      ),
      'staff', jsonb_build_object(
        'total_count', (
          SELECT COUNT(*) FROM staff  -- FIXED: was staff_profiles
          WHERE institution_id = v_institution_id
          AND is_active = TRUE  -- FIXED: was status = 'active'
        )
      )
    ),
    'metadata', jsonb_build_object(
      'institution_id', v_institution_id,
      'generated_at', NOW()
    )
  );
END;
$function$;

-- ai_rpc_learners_by_location(p_user_id uuid, p_district text, p_state text, p_taluk text, p_city text, p_status text, p_department_id uuid, p_include_stats boolean, p_limit integer, p_offset integer)
CREATE OR REPLACE FUNCTION public.ai_rpc_learners_by_location(p_user_id uuid, p_district text DEFAULT NULL::text, p_state text DEFAULT NULL::text, p_taluk text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_department_id uuid DEFAULT NULL::uuid, p_include_stats boolean DEFAULT true, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
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
  v_inst_id := v_profile.institution_id;

  WITH location_learners AS (
    SELECT lp.id, lp.first_name, lp.last_name, lp.roll_number,
           lp.permanent_address_district, lp.permanent_address_state, lp.permanent_address_taluk,
           lp.bus_pickup_location, acc.code AS accommodation_type, lp.lifecycle_status,
           d.department_name, sec.section_name
    FROM learners_profiles lp
    LEFT JOIN departments d ON lp.department_id = d.id
    LEFT JOIN sections sec ON lp.section_id = sec.id
    LEFT JOIN accommodation_types acc ON acc.id = lp.accommodation_type_id
    WHERE (v_profile.is_super_admin = TRUE OR lp.institution_id = v_inst_id)
      AND (p_department_id IS NULL OR lp.department_id = p_department_id)
      AND (p_status IS NULL OR lp.lifecycle_status::TEXT ILIKE p_status)
      AND (
        p_district IS NULL OR 
        lp.permanent_address_district ILIKE '%' || p_district || '%' OR
        lp.bus_pickup_location ILIKE '%' || p_district || '%'
      )
      AND (p_state IS NULL OR lp.permanent_address_state ILIKE '%' || p_state || '%')
      AND (p_taluk IS NULL OR lp.permanent_address_taluk ILIKE '%' || p_taluk || '%')
    ORDER BY lp.permanent_address_district, lp.first_name
    LIMIT p_limit OFFSET p_offset
  ),
  location_stats AS (
    SELECT
      permanent_address_district as district,
      COUNT(*) as learner_count,
      jsonb_agg(DISTINCT bus_pickup_location) FILTER (WHERE bus_pickup_location IS NOT NULL) as bus_locations
    FROM learners_profiles
    WHERE (v_profile.is_super_admin = TRUE OR institution_id = v_inst_id)
      AND (p_department_id IS NULL OR department_id = p_department_id)
    GROUP BY permanent_address_district
    ORDER BY learner_count DESC
  )
  SELECT jsonb_build_object(
    'success', TRUE,
    'data', COALESCE(jsonb_agg(row_to_json(ll)::jsonb), '[]'::jsonb),
    'metadata', jsonb_build_object(
      'total_count', (SELECT COUNT(*) FROM location_learners),
      'returned_count', (SELECT COUNT(*) FROM location_learners),
      'has_more', FALSE,
      'location_stats', CASE WHEN p_include_stats THEN (SELECT jsonb_agg(row_to_json(ls)::jsonb) FROM location_stats ls) ELSE NULL END
    ),
    'actions_available', '[]'::jsonb
  ) INTO v_result FROM location_learners ll;
  
  RETURN v_result;
END;
$function$;

-- ai_rpc_learners_comprehensive(p_user_id uuid, p_search text, p_status text, p_gender text, p_religion text, p_community text, p_accommodation_type text, p_bus_required boolean, p_institution_id uuid, p_department_id uuid, p_program_id uuid, p_semester_id uuid, p_entry_type text, p_quota text, p_first_graduate boolean, p_district text, p_include_stats boolean, p_limit integer, p_offset integer)
CREATE OR REPLACE FUNCTION public.ai_rpc_learners_comprehensive(p_user_id uuid, p_search text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_gender text DEFAULT NULL::text, p_religion text DEFAULT NULL::text, p_community text DEFAULT NULL::text, p_accommodation_type text DEFAULT NULL::text, p_bus_required boolean DEFAULT NULL::boolean, p_institution_id uuid DEFAULT NULL::uuid, p_department_id uuid DEFAULT NULL::uuid, p_program_id uuid DEFAULT NULL::uuid, p_semester_id uuid DEFAULT NULL::uuid, p_entry_type text DEFAULT NULL::text, p_quota text DEFAULT NULL::text, p_first_graduate boolean DEFAULT NULL::boolean, p_district text DEFAULT NULL::text, p_include_stats boolean DEFAULT true, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_profile RECORD; v_inst_id UUID;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  SELECT p.id, p.role, p.is_super_admin, p.institution_id INTO v_profile FROM profiles p WHERE p.id = p_user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', FALSE, 'error', 'User profile not found'); END IF;
  IF v_profile.is_super_admin AND p_institution_id IS NOT NULL THEN v_inst_id := p_institution_id;
  ELSIF v_profile.institution_id IS NOT NULL THEN v_inst_id := v_profile.institution_id;
  ELSE v_inst_id := NULL; END IF;
  RETURN (
    WITH learners_data AS (
      SELECT
        lp.id, lp.application_id, lp.first_name, lp.last_name, lp.roll_number,
        lp.register_number, lp.student_email, lp.student_mobile, lp.gender,
        lp.religion,
        cc.code AS community,
        q.name AS quota,
        lp.entry_type, acc.code AS accommodation_type, lp.bus_required,
        lp.lifecycle_status, lp.permanent_address_state, lp.permanent_address_district,
        lp.institution_id, i.name as institution_name,
        lp.department_id, d.department_name,
        lp.program_id, p.program_name,
        lp.semester_id, sem.semester_name,
        lp.section_id, sec.section_name,
        lp.degree_id, deg.degree_name,
        lp.academic_year_id, ay.academic_year_name,
        lp.batch_id, bat.batch_name,
        lp.regulation_id, reg.regulation_year, reg.regulation_code
      FROM learners_profiles lp
      LEFT JOIN institutions i ON lp.institution_id = i.id
      LEFT JOIN departments d ON lp.department_id = d.id
      LEFT JOIN programs p ON lp.program_id = p.id
      LEFT JOIN semesters sem ON lp.semester_id = sem.id
      LEFT JOIN sections sec ON lp.section_id = sec.id
      LEFT JOIN degrees deg ON lp.degree_id = deg.id
      LEFT JOIN academic_years ay ON lp.academic_year_id = ay.id
      LEFT JOIN batches bat ON lp.batch_id = bat.id
      LEFT JOIN regulations reg ON lp.regulation_id = reg.id
      LEFT JOIN quotas q ON q.id = lp.quota_id
      LEFT JOIN community_categories cc ON cc.id = lp.community_category_id
      LEFT JOIN accommodation_types acc ON acc.id = lp.accommodation_type_id
      WHERE (v_profile.is_super_admin = TRUE OR lp.institution_id = v_inst_id)
        AND (p_status IS NULL OR lp.lifecycle_status::TEXT ILIKE p_status)
        AND (p_gender IS NULL OR lp.gender ILIKE p_gender)
        AND (p_religion IS NULL OR lp.religion ILIKE p_religion)
        AND (p_community IS NULL OR cc.code ILIKE p_community OR cc.name ILIKE p_community)
        AND (p_accommodation_type IS NULL OR acc.code ILIKE p_accommodation_type OR acc.name ILIKE p_accommodation_type)
        AND (p_bus_required IS NULL OR lp.bus_required = p_bus_required)
        AND (p_institution_id IS NULL OR lp.institution_id = p_institution_id)
        AND (p_department_id IS NULL OR lp.department_id = p_department_id)
        AND (p_program_id IS NULL OR lp.program_id = p_program_id)
        AND (p_semester_id IS NULL OR lp.semester_id = p_semester_id)
        AND (p_entry_type IS NULL OR lp.entry_type ILIKE p_entry_type)
        AND (p_quota IS NULL OR q.name ILIKE p_quota OR q.code ILIKE p_quota)
        AND (p_district IS NULL OR lp.permanent_address_district ILIKE p_district)
        AND (
          p_search IS NULL OR
          lp.first_name ILIKE '%' || p_search || '%' OR
          lp.last_name ILIKE '%' || p_search || '%' OR
          lp.roll_number ILIKE '%' || p_search || '%' OR
          lp.student_email ILIKE '%' || p_search || '%'
        )
      ORDER BY lp.first_name, lp.last_name
      LIMIT p_limit OFFSET p_offset
    ),
    stats_data AS (
      SELECT COUNT(*) as total_count, COUNT(DISTINCT department_id) as departments_count, COUNT(DISTINCT program_id) as programs_count
      FROM learners_data
    )
    SELECT jsonb_build_object(
      'success', TRUE,
      'data', COALESCE(jsonb_agg(row_to_json(learners_data)::jsonb), '[]'::jsonb),
      'metadata', CASE
        WHEN p_include_stats THEN (
          SELECT jsonb_build_object('total_count', total_count, 'departments_count', departments_count, 'programs_count', programs_count, 'returned_count', (SELECT COUNT(*) FROM learners_data), 'has_more', (SELECT total_count > p_limit FROM stats_data)) FROM stats_data
        )
        ELSE jsonb_build_object('returned_count', (SELECT COUNT(*) FROM learners_data))
      END
    )
    FROM learners_data
  );
END;
$function$;

-- ai_rpc_mark_notification_read(p_user_id uuid, p_notification_ids uuid[])
CREATE OR REPLACE FUNCTION public.ai_rpc_mark_notification_read(p_user_id uuid, p_notification_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_updated_count INTEGER;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  UPDATE user_notifications
  SET is_read = true, read_at = NOW()
  WHERE user_id = p_user_id
    AND notification_id = ANY(p_notification_ids)
    AND is_read = false;
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'success', true,
    'message', v_updated_count || ' notification(s) marked as read.',
    'affected_count', v_updated_count
  );
END;
$function$;

-- ai_rpc_my_bug_reports(p_user_id uuid, p_limit integer, p_offset integer)
CREATE OR REPLACE FUNCTION public.ai_rpc_my_bug_reports(p_user_id uuid, p_limit integer DEFAULT 10000, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_result jsonb;
    v_count integer;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
    SELECT COUNT(*)
    INTO v_count
    FROM bug_reports br
    WHERE br.reporter_user_id = p_user_id;

    SELECT jsonb_build_object(
        'success', true,
        'data', COALESCE(jsonb_agg(row_to_json(bug)), '[]'::jsonb),
        'metadata', jsonb_build_object(
            'total_count', v_count,
            'returned_count', COUNT(*),
            'has_more', v_count > p_offset + p_limit,
            'filters_applied', jsonb_build_object('reporter_user_id', p_user_id)
        ),
        'actions_available', '[]'::jsonb
    )
    INTO v_result
    FROM (
        SELECT
            br.id,
            br.reporter_user_id,
            br.status,
            br.priority,
            br.module,
            br.description,
            br.created_at
        FROM bug_reports br
        WHERE br.reporter_user_id = p_user_id
        ORDER BY br.created_at DESC
        LIMIT p_limit OFFSET p_offset
    ) bug;

    RETURN v_result;
END;
$function$;

-- ai_rpc_my_bug_reports(p_user_id uuid, p_status text, p_limit integer, p_offset integer)
CREATE OR REPLACE FUNCTION public.ai_rpc_my_bug_reports(p_user_id uuid, p_status text DEFAULT NULL::text, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  SELECT jsonb_build_object(
    'success', true,
    'data', COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb),
    'metadata', jsonb_build_object(
      'total_count', COUNT(*) OVER(),
      'returned_count', COUNT(*),
      'has_more', COUNT(*) OVER() > p_offset + p_limit,
      'filters_applied', jsonb_build_object('status', p_status)
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
      br.status,
      br.priority,
      br.category,
      br.resolved_at,
      ap.full_name as assigned_to_name,
      br.created_at
    FROM bug_reports br
    LEFT JOIN profiles ap ON br.assigned_to_user_id = ap.id
    WHERE br.reporter_user_id = p_user_id
    AND (p_status IS NULL OR br.status = p_status)
    ORDER BY br.created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  ) t;
  
  RETURN v_result;
END;
$function$;

-- ai_rpc_notifications(p_user_id uuid, p_is_read boolean, p_type text, p_limit integer, p_offset integer)
CREATE OR REPLACE FUNCTION public.ai_rpc_notifications(p_user_id uuid, p_is_read boolean DEFAULT NULL::boolean, p_type text DEFAULT NULL::text, p_limit integer DEFAULT 10000, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_result jsonb;
    v_count integer;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
    SELECT COUNT(*)
    INTO v_count
    FROM notifications n
    WHERE n.user_id = p_user_id
      AND (p_is_read IS NULL OR n.is_read = p_is_read)
      AND (p_type IS NULL OR n.category = p_type);

    SELECT jsonb_build_object(
        'success', true,
        'data', COALESCE(jsonb_agg(row_to_json(notif)), '[]'::jsonb),
        'metadata', jsonb_build_object(
            'total_count', v_count,
            'returned_count', COUNT(*),
            'has_more', v_count > p_offset + p_limit,
            'filters_applied', jsonb_build_object('is_read', p_is_read, 'type', p_type)
        ),
        'actions_available', jsonb_build_array(
            jsonb_build_object('action', 'mark_as_read', 'label', 'Mark as Read')
        )
    )
    INTO v_result
    FROM (
        SELECT n.id, n.title, n.body, n.category, n.is_read, n.created_at
        FROM notifications n
        WHERE n.user_id = p_user_id
          AND (p_is_read IS NULL OR n.is_read = p_is_read)
          AND (p_type IS NULL OR n.category = p_type)
        ORDER BY n.created_at DESC
        LIMIT p_limit OFFSET p_offset
    ) notif;

    RETURN v_result;
END;
$function$;

-- ai_rpc_periods(p_user_id uuid, p_institution_id uuid, p_limit integer, p_offset integer)
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

-- ai_rpc_programs(p_user_id uuid, p_department_id uuid, p_limit integer, p_offset integer)
CREATE OR REPLACE FUNCTION public.ai_rpc_programs(p_user_id uuid, p_department_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 10000, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_result jsonb;
    v_count integer;
    v_accessible_institutions uuid[];
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
    v_accessible_institutions := ai_get_accessible_institutions(p_user_id);

    SELECT COUNT(*) INTO v_count
    FROM programs p
    JOIN departments d ON p.department_id = d.id
    WHERE (p_department_id IS NULL OR p.department_id = p_department_id)
      AND d.institution_id = ANY(v_accessible_institutions);

    SELECT jsonb_build_object(
        'success', true,
        'data', COALESCE(jsonb_agg(row_to_json(prog)), '[]'::jsonb),
        'metadata', jsonb_build_object(
            'total_count', v_count, 'returned_count', COUNT(*),
            'has_more', v_count > p_offset + p_limit,
            'filters_applied', jsonb_build_object('department_id', p_department_id)
        ),
        'actions_available', '[]'::jsonb
    )
    INTO v_result
    FROM (
        SELECT p.id, p.program_name, p.program_code, p.department_id,
               d.department_name, p.is_active, p.created_at
        FROM programs p
        JOIN departments d ON p.department_id = d.id
        WHERE (p_department_id IS NULL OR p.department_id = p_department_id)
          AND d.institution_id = ANY(v_accessible_institutions)
        ORDER BY p.program_name
        LIMIT p_limit OFFSET p_offset
    ) prog;

    RETURN v_result;
END;
$function$;

-- ai_rpc_push_subscriptions(p_user_id uuid, p_limit integer, p_offset integer)
CREATE OR REPLACE FUNCTION public.ai_rpc_push_subscriptions(p_user_id uuid, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  SELECT jsonb_build_object(
    'success', true,
    'data', COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb),
    'metadata', jsonb_build_object(
      'total_count', COUNT(*) OVER(),
      'returned_count', COUNT(*),
      'has_more', COUNT(*) OVER() > p_offset + p_limit,
      'filters_applied', jsonb_build_object()
    )
  )
  INTO v_result
  FROM (
    SELECT 
      ps.id,
      ps.user_id,
      ps.subscription,
      p.full_name as user_name,
      p.email as user_email,
      ps.created_at,
      ps.updated_at
    FROM push_subscriptions ps
    JOIN profiles p ON ps.user_id = p.id
    WHERE ps.user_id = p_user_id
    ORDER BY ps.created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  ) t;
  
  RETURN v_result;
END;
$function$;

-- ai_rpc_sections(p_user_id uuid, p_semester_id uuid, p_limit integer, p_offset integer)
CREATE OR REPLACE FUNCTION public.ai_rpc_sections(p_user_id uuid, p_semester_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 10000, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_result jsonb;
    v_count integer;
    v_accessible_institutions uuid[];
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
    v_accessible_institutions := ai_get_accessible_institutions(p_user_id);

    SELECT COUNT(*) INTO v_count
    FROM sections sec
    JOIN semesters s ON sec.semester_id = s.id
    JOIN programs p ON s.program_id = p.id
    JOIN departments d ON p.department_id = d.id
    WHERE (p_semester_id IS NULL OR sec.semester_id = p_semester_id)
      AND d.institution_id = ANY(v_accessible_institutions);

    SELECT jsonb_build_object(
        'success', true,
        'data', COALESCE(jsonb_agg(row_to_json(section)), '[]'::jsonb),
        'metadata', jsonb_build_object(
            'total_count', v_count, 'returned_count', COUNT(*),
            'has_more', v_count > p_offset + p_limit,
            'filters_applied', jsonb_build_object('semester_id', p_semester_id)
        ),
        'actions_available', '[]'::jsonb
    )
    INTO v_result
    FROM (
        SELECT sec.id, sec.section_name, sec.semester_id, s.semester_name,
               p.program_name, sec.is_active, sec.created_at
        FROM sections sec
        JOIN semesters s ON sec.semester_id = s.id
        JOIN programs p ON s.program_id = p.id
        JOIN departments d ON p.department_id = d.id
        WHERE (p_semester_id IS NULL OR sec.semester_id = p_semester_id)
          AND d.institution_id = ANY(v_accessible_institutions)
        ORDER BY sec.section_name
        LIMIT p_limit OFFSET p_offset
    ) section;

    RETURN v_result;
END;
$function$;

-- ai_rpc_semesters(p_user_id uuid, p_program_id uuid, p_limit integer, p_offset integer)
CREATE OR REPLACE FUNCTION public.ai_rpc_semesters(p_user_id uuid, p_program_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 10000, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_result jsonb;
    v_count integer;
    v_accessible_institutions uuid[];
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
    v_accessible_institutions := ai_get_accessible_institutions(p_user_id);

    SELECT COUNT(*) INTO v_count
    FROM semesters s
    JOIN programs p ON s.program_id = p.id
    JOIN departments d ON p.department_id = d.id
    WHERE (p_program_id IS NULL OR s.program_id = p_program_id)
      AND d.institution_id = ANY(v_accessible_institutions);

    SELECT jsonb_build_object(
        'success', true,
        'data', COALESCE(jsonb_agg(row_to_json(sem)), '[]'::jsonb),
        'metadata', jsonb_build_object(
            'total_count', v_count, 'returned_count', COUNT(*),
            'has_more', v_count > p_offset + p_limit,
            'filters_applied', jsonb_build_object('program_id', p_program_id)
        ),
        'actions_available', '[]'::jsonb
    )
    INTO v_result
    FROM (
        SELECT s.id, s.semester_name, s.program_id, p.program_name, s.is_active, s.created_at
        FROM semesters s
        JOIN programs p ON s.program_id = p.id
        JOIN departments d ON p.department_id = d.id
        WHERE (p_program_id IS NULL OR s.program_id = p_program_id)
          AND d.institution_id = ANY(v_accessible_institutions)
        ORDER BY s.semester_name
        LIMIT p_limit OFFSET p_offset
    ) sem;

    RETURN v_result;
END;
$function$;

-- ai_rpc_send_notification(p_user_id uuid, p_recipient_ids uuid[], p_title text, p_message text, p_type text, p_priority text)
CREATE OR REPLACE FUNCTION public.ai_rpc_send_notification(p_user_id uuid, p_recipient_ids uuid[], p_title text, p_message text, p_type text DEFAULT 'info'::text, p_priority text DEFAULT 'normal'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_scope JSONB;
  v_notification_id UUID;
  v_recipient_count INTEGER;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  v_scope := ai_rpc_accessible_scope(p_user_id);
  
  -- Check permission
  IF NOT ai_rpc_validate_permission(p_user_id, 'notifications.send') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', jsonb_build_object(
        'code', 'PERMISSION_DENIED',
        'message', 'You do not have permission to send notifications.'
      )
    );
  END IF;
  
  -- Limit single notification to 50 recipients
  IF array_length(p_recipient_ids, 1) > 50 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', jsonb_build_object(
        'code', 'LIMIT_EXCEEDED',
        'message', 'Single notification limited to 50 recipients. Use bulk notification for more.'
      )
    );
  END IF;
  
  -- Create notification
  INSERT INTO notifications (title, message, type, priority, created_by)
  VALUES (p_title, p_message, p_type, p_priority, p_user_id)
  RETURNING id INTO v_notification_id;
  
  -- Create user notifications
  INSERT INTO user_notifications (notification_id, user_id)
  SELECT v_notification_id, unnest(p_recipient_ids);
  
  GET DIAGNOSTICS v_recipient_count = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Notification sent to ' || v_recipient_count || ' recipient(s).',
    'affected_count', v_recipient_count,
    'notification_id', v_notification_id
  );
END;
$function$;

-- ai_rpc_staff(p_user_id uuid, p_department_id uuid, p_employment_category_id uuid, p_status text, p_search text, p_limit integer, p_offset integer)
CREATE OR REPLACE FUNCTION public.ai_rpc_staff(p_user_id uuid, p_department_id uuid DEFAULT NULL::uuid, p_employment_category_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 10000, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_result jsonb;
    v_count integer;
    v_accessible_institutions uuid[];
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
    v_accessible_institutions := ai_get_accessible_institutions(p_user_id);

    SELECT COUNT(*) INTO v_count
    FROM staff st
    LEFT JOIN departments d ON st.department_id = d.id
    WHERE (st.institution_id = ANY(v_accessible_institutions) OR d.institution_id = ANY(v_accessible_institutions))
      AND (p_department_id IS NULL OR st.department_id = p_department_id)
      AND (p_employment_category_id IS NULL OR st.category_id = p_employment_category_id)
      AND (p_status IS NULL OR st.is_active = (p_status = 'active'))
      AND (p_search IS NULL OR st.staff_name ILIKE '%' || p_search || '%' OR st.staff_id ILIKE '%' || p_search || '%');

    SELECT jsonb_build_object(
        'success', true,
        'data', COALESCE(jsonb_agg(row_to_json(staff_member)), '[]'::jsonb),
        'metadata', jsonb_build_object(
            'total_count', v_count, 'returned_count', COUNT(*),
            'has_more', v_count > p_offset + p_limit,
            'filters_applied', jsonb_build_object(
                'department_id', p_department_id, 'employment_category_id', p_employment_category_id,
                'status', p_status, 'search', p_search
            )
        ),
        'actions_available', '[]'::jsonb
    )
    INTO v_result
    FROM (
        SELECT st.id, st.staff_name, st.staff_id, st.email, st.mobile,
               st.department_id, d.department_name, st.category_id, ec.category_name,
               st.institution_id, i.name as institution_name, st.is_active, st.created_at
        FROM staff st
        LEFT JOIN departments d ON st.department_id = d.id
        LEFT JOIN employment_categories ec ON st.category_id = ec.id
        LEFT JOIN institutions i ON st.institution_id = i.id
        WHERE (st.institution_id = ANY(v_accessible_institutions) OR d.institution_id = ANY(v_accessible_institutions))
          AND (p_department_id IS NULL OR st.department_id = p_department_id)
          AND (p_employment_category_id IS NULL OR st.category_id = p_employment_category_id)
          AND (p_status IS NULL OR st.is_active = (p_status = 'active'))
          AND (p_search IS NULL OR st.staff_name ILIKE '%' || p_search || '%' OR st.staff_id ILIKE '%' || p_search || '%')
        ORDER BY st.staff_name
        LIMIT p_limit OFFSET p_offset
    ) staff_member;

    RETURN v_result;
END;
$function$;

-- ai_rpc_staff_by_department(p_user_id uuid, p_department_id uuid, p_limit integer, p_offset integer)
CREATE OR REPLACE FUNCTION public.ai_rpc_staff_by_department(p_user_id uuid, p_department_id uuid, p_limit integer DEFAULT 10000, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_result jsonb;
    v_count integer;
    v_accessible_institutions uuid[];
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
    v_accessible_institutions := ai_get_accessible_institutions(p_user_id);

    SELECT COUNT(*) INTO v_count
    FROM staff st
    LEFT JOIN departments d ON st.department_id = d.id
    WHERE (st.institution_id = ANY(v_accessible_institutions) OR d.institution_id = ANY(v_accessible_institutions))
      AND st.department_id = p_department_id;

    SELECT jsonb_build_object(
        'success', true,
        'data', COALESCE(jsonb_agg(row_to_json(staff_member)), '[]'::jsonb),
        'metadata', jsonb_build_object(
            'total_count', v_count, 'returned_count', COUNT(*),
            'has_more', v_count > p_offset + p_limit,
            'filters_applied', jsonb_build_object('department_id', p_department_id)
        ),
        'actions_available', '[]'::jsonb
    )
    INTO v_result
    FROM (
        SELECT st.id, st.staff_name, st.staff_id, st.email, st.mobile,
               st.department_id, d.department_name, st.category_id, ec.category_name,
               i.name as institution_name, st.is_active, st.created_at
        FROM staff st
        LEFT JOIN departments d ON st.department_id = d.id
        LEFT JOIN employment_categories ec ON st.category_id = ec.id
        LEFT JOIN institutions i ON st.institution_id = i.id
        WHERE (st.institution_id = ANY(v_accessible_institutions) OR d.institution_id = ANY(v_accessible_institutions))
          AND st.department_id = p_department_id
        ORDER BY st.staff_name
        LIMIT p_limit OFFSET p_offset
    ) staff_member;

    RETURN v_result;
END;
$function$;

-- ai_rpc_staff_details(p_user_id uuid, p_staff_id uuid)
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

-- ai_rpc_staff_plans(p_user_id uuid, p_department_id uuid, p_timetable_id uuid, p_limit integer, p_offset integer)
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

-- ai_rpc_student_bills(p_user_id uuid, p_student_id uuid, p_section_id uuid, p_department_id uuid, p_status text, p_date_from text, p_date_to text, p_limit integer, p_offset integer)
CREATE OR REPLACE FUNCTION public.ai_rpc_student_bills(p_user_id uuid, p_student_id uuid DEFAULT NULL::uuid, p_section_id uuid DEFAULT NULL::uuid, p_department_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text, p_date_from text DEFAULT NULL::text, p_date_to text DEFAULT NULL::text, p_limit integer DEFAULT 10000, p_offset integer DEFAULT 0)
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
  v_inst_id := v_profile.institution_id;

  WITH bills AS (
    SELECT bb.*, lp.first_name, lp.last_name, lp.roll_number,
           d.department_name, s.section_name
    FROM billing_bills bb
    INNER JOIN learners_profiles lp ON bb.student_id = lp.id
    LEFT JOIN departments d ON lp.department_id = d.id
    LEFT JOIN sections s ON lp.section_id = s.id
    WHERE (v_profile.is_super_admin = TRUE OR bb.institution_id = v_inst_id)
      AND (p_student_id IS NULL OR bb.student_id = p_student_id)
      AND (p_section_id IS NULL OR lp.section_id = p_section_id)
      AND (p_department_id IS NULL OR lp.department_id = p_department_id)
      AND (p_status IS NULL OR bb.status ILIKE p_status)
      AND (p_date_from IS NULL OR bb.created_at::DATE >= p_date_from::DATE)
      AND (p_date_to IS NULL OR bb.created_at::DATE <= p_date_to::DATE)
    ORDER BY bb.created_at DESC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT jsonb_build_object(
    'success', TRUE,
    'data', COALESCE(jsonb_agg(row_to_json(b)::jsonb), '[]'::jsonb),
    'metadata', jsonb_build_object('total_count', (SELECT COUNT(*) FROM bills), 'returned_count', (SELECT COUNT(*) FROM bills), 'has_more', FALSE),
    'actions_available', jsonb_build_array(
      jsonb_build_object('id', 'export_csv', 'label', 'Export to CSV', 'tier', 1)
    )
  ) INTO v_result FROM bills b;
  
  RETURN v_result;
END;
$function$;

-- ai_rpc_student_details(p_user_id uuid, p_student_id uuid)
CREATE OR REPLACE FUNCTION public.ai_rpc_student_details(p_user_id uuid, p_student_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_result JSONB; v_profile RECORD;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  SELECT institution_id, is_super_admin INTO v_profile FROM profiles WHERE id = p_user_id;
  
  WITH learner_details AS (
    SELECT lp.*, i.name as institution_name, deg.degree_name, d.department_name,
           p.program_name, s.semester_name, sec.section_name
    FROM learners_profiles lp
    LEFT JOIN institutions i ON lp.institution_id = i.id
    LEFT JOIN degrees deg ON lp.degree_id = deg.id
    LEFT JOIN departments d ON lp.department_id = d.id
    LEFT JOIN programs p ON lp.program_id = p.id
    LEFT JOIN semesters s ON lp.semester_id = s.id
    LEFT JOIN sections sec ON lp.section_id = sec.id
    WHERE lp.id = p_student_id 
      AND (v_profile.is_super_admin = TRUE OR lp.institution_id = v_profile.institution_id)
  )
  SELECT jsonb_build_object('success', TRUE, 'data', row_to_json(ld)::jsonb,
    'metadata', jsonb_build_object('total_count', 1, 'returned_count', 1, 'has_more', FALSE),
    'actions_available', '[]'::jsonb
  ) INTO v_result FROM learner_details ld;
  
  RETURN COALESCE(v_result, jsonb_build_object('success', FALSE, 'data', NULL, 
    'error', jsonb_build_object('code', 'NOT_FOUND', 'message', 'Learner not found')));
END;
$function$;

-- ai_rpc_student_search(p_user_id uuid, p_search_query text, p_search_fields text[], p_exact_match boolean, p_department_id uuid, p_status text, p_limit integer, p_offset integer)
CREATE OR REPLACE FUNCTION public.ai_rpc_student_search(p_user_id uuid, p_search_query text DEFAULT NULL::text, p_search_fields text[] DEFAULT ARRAY['name'::text, 'roll_number'::text, 'email'::text, 'mobile'::text], p_exact_match boolean DEFAULT false, p_department_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_profile RECORD;
  v_institution_id UUID;
  v_search_pattern TEXT;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  -- Get user profile
  SELECT p.id, p.role, p.is_super_admin, p.institution_id
  INTO v_profile
  FROM profiles p
  WHERE p.id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'User profile not found',
      'metadata', jsonb_build_object('error_code', 'PROFILE_NOT_FOUND')
    );
  END IF;

  v_institution_id := v_profile.institution_id;

  -- Set search pattern
  IF p_exact_match THEN
    v_search_pattern := p_search_query;
  ELSE
    v_search_pattern := '%' || p_search_query || '%';
  END IF;

  RETURN (
    WITH searched_learners AS (
      SELECT
        lp.id,
        lp.application_id,
        lp.first_name,
        lp.last_name,
        lp.roll_number,
        lp.register_number,
        lp.student_email,
        lp.student_mobile,
        lp.lifecycle_status,
        
        -- Institution details
        lp.institution_id,
        i.name as institution_name,
        
        -- Department details
        lp.department_id,
        d.department_name,
        
        -- Program details
        lp.program_id,
        prog.program_name,
        
        -- Semester details
        lp.semester_id,
        sem.semester_name,
        
        -- Section details
        lp.section_id,
        sec.section_name,
        
        -- Degree details
        lp.degree_id,
        deg.degree_name,
        
        -- Academic Year details
        lp.academic_year_id,
        ay.academic_year_name,
        
        -- Batch details
        lp.batch_id,
        bat.batch_name,
        
        -- Regulation details
        lp.regulation_id,
        reg.regulation_year,
        reg.regulation_code,
        
        -- Matched field indicator
        CASE
          WHEN 'name' = ANY(p_search_fields) AND (lp.first_name ILIKE v_search_pattern OR lp.last_name ILIKE v_search_pattern) THEN 'name'
          WHEN 'roll_number' = ANY(p_search_fields) AND lp.roll_number ILIKE v_search_pattern THEN 'roll_number'
          WHEN 'email' = ANY(p_search_fields) AND (lp.student_email ILIKE v_search_pattern OR lp.college_email ILIKE v_search_pattern) THEN 'email'
          WHEN 'mobile' = ANY(p_search_fields) AND (lp.student_mobile ILIKE v_search_pattern OR lp.father_mobile ILIKE v_search_pattern OR lp.mother_mobile ILIKE v_search_pattern) THEN 'mobile'
          WHEN 'application_id' = ANY(p_search_fields) AND lp.application_id ILIKE v_search_pattern THEN 'application_id'
          WHEN 'father_name' = ANY(p_search_fields) AND lp.father_name ILIKE v_search_pattern THEN 'father_name'
          WHEN 'mother_name' = ANY(p_search_fields) AND lp.mother_name ILIKE v_search_pattern THEN 'mother_name'
          ELSE 'other'
        END as matched_field
        
      FROM learners_profiles lp
      LEFT JOIN institutions i ON lp.institution_id = i.id
      LEFT JOIN departments d ON lp.department_id = d.id
      LEFT JOIN programs prog ON lp.program_id = prog.id
      LEFT JOIN semesters sem ON lp.semester_id = sem.id
      LEFT JOIN sections sec ON lp.section_id = sec.id
      LEFT JOIN degrees deg ON lp.degree_id = deg.id
      LEFT JOIN academic_years ay ON lp.academic_year_id = ay.id
      LEFT JOIN batches bat ON lp.batch_id = bat.id
      LEFT JOIN regulations reg ON lp.regulation_id = reg.id
      
      WHERE (v_profile.is_super_admin = TRUE OR lp.institution_id = v_institution_id)
        AND (p_department_id IS NULL OR lp.department_id = p_department_id)
        AND (p_status IS NULL OR lp.lifecycle_status::TEXT ILIKE p_status)
        AND (
          ('name' = ANY(p_search_fields) AND (lp.first_name ILIKE v_search_pattern OR lp.last_name ILIKE v_search_pattern)) OR
          ('roll_number' = ANY(p_search_fields) AND lp.roll_number ILIKE v_search_pattern) OR
          ('email' = ANY(p_search_fields) AND (lp.student_email ILIKE v_search_pattern OR lp.college_email ILIKE v_search_pattern)) OR
          ('mobile' = ANY(p_search_fields) AND (lp.student_mobile ILIKE v_search_pattern OR lp.father_mobile ILIKE v_search_pattern OR lp.mother_mobile ILIKE v_search_pattern)) OR
          ('application_id' = ANY(p_search_fields) AND lp.application_id ILIKE v_search_pattern) OR
          ('father_name' = ANY(p_search_fields) AND lp.father_name ILIKE v_search_pattern) OR
          ('mother_name' = ANY(p_search_fields) AND lp.mother_name ILIKE v_search_pattern)
        )
      ORDER BY lp.first_name, lp.last_name
      LIMIT p_limit OFFSET p_offset
    )
    SELECT jsonb_build_object(
      'success', TRUE,
      'data', COALESCE(jsonb_agg(row_to_json(searched_learners)::jsonb), '[]'::jsonb),
      'metadata', jsonb_build_object(
        'total_count', (SELECT COUNT(*) FROM searched_learners),
        'returned_count', (SELECT COUNT(*) FROM searched_learners),
        'has_more', FALSE,
        'filters_applied', jsonb_build_object(
          'search_query', p_search_query,
          'search_fields', p_search_fields,
          'exact_match', p_exact_match,
          'department_id', p_department_id,
          'status', p_status
        )
      )
    )
    FROM searched_learners
  );
END;
$function$;

-- ai_rpc_students(p_user_id uuid, p_department_id uuid, p_program_id uuid, p_semester_id uuid, p_section_id uuid, p_status text, p_search text, p_limit integer, p_offset integer)
CREATE OR REPLACE FUNCTION public.ai_rpc_students(p_user_id uuid, p_department_id uuid DEFAULT NULL::uuid, p_program_id uuid DEFAULT NULL::uuid, p_semester_id uuid DEFAULT NULL::uuid, p_section_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 10000, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_profile RECORD;
  v_institution_id UUID;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  -- Get user profile
  SELECT p.id, p.role, p.is_super_admin, p.institution_id
  INTO v_profile
  FROM profiles p
  WHERE p.id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'User profile not found'
    );
  END IF;

  v_institution_id := v_profile.institution_id;

  RETURN (
    WITH students_data AS (
      SELECT
        lp.id,
        lp.application_id,
        lp.first_name,
        lp.last_name,
        lp.roll_number,
        lp.register_number,
        lp.student_email,
        lp.student_mobile,
        lp.lifecycle_status,
        lp.date_of_birth,
        lp.gender,
        lp.blood_group,
        
        -- Institution details
        lp.institution_id,
        i.name as institution_name,
        
        -- Department details
        lp.department_id,
        d.department_name,
        
        -- Program details
        lp.program_id,
        prog.program_name,
        
        -- Semester details
        lp.semester_id,
        sem.semester_name,
        
        -- Section details
        lp.section_id,
        sec.section_name,
        
        -- Degree details
        lp.degree_id,
        deg.degree_name,
        
        -- Academic Year details
        lp.academic_year_id,
        ay.academic_year_name,
        
        -- Batch details
        lp.batch_id,
        bat.batch_name,
        
        -- Regulation details
        lp.regulation_id,
        reg.regulation_year,
        reg.regulation_code,
        
        lp.created_at,
        lp.updated_at
        
      FROM learners_profiles lp
      LEFT JOIN institutions i ON lp.institution_id = i.id
      LEFT JOIN departments d ON lp.department_id = d.id
      LEFT JOIN programs prog ON lp.program_id = prog.id
      LEFT JOIN semesters sem ON lp.semester_id = sem.id
      LEFT JOIN sections sec ON lp.section_id = sec.id
      LEFT JOIN degrees deg ON lp.degree_id = deg.id
      LEFT JOIN academic_years ay ON lp.academic_year_id = ay.id
      LEFT JOIN batches bat ON lp.batch_id = bat.id
      LEFT JOIN regulations reg ON lp.regulation_id = reg.id
      
      WHERE (v_profile.is_super_admin = TRUE OR lp.institution_id = v_institution_id)
        AND lp.lifecycle_status::TEXT IN ('active', 'inactive', 'exited')
        AND (p_department_id IS NULL OR lp.department_id = p_department_id)
        AND (p_program_id IS NULL OR lp.program_id = p_program_id)
        AND (p_semester_id IS NULL OR lp.semester_id = p_semester_id)
        AND (p_section_id IS NULL OR lp.section_id = p_section_id)
        AND (p_status IS NULL OR lp.lifecycle_status::TEXT ILIKE p_status)
        AND (
          p_search IS NULL OR
          lp.first_name ILIKE '%' || p_search || '%' OR
          lp.last_name ILIKE '%' || p_search || '%' OR
          lp.roll_number ILIKE '%' || p_search || '%' OR
          lp.student_email ILIKE '%' || p_search || '%'
        )
      ORDER BY lp.first_name, lp.last_name
      LIMIT p_limit OFFSET p_offset
    )
    SELECT jsonb_build_object(
      'success', TRUE,
      'data', COALESCE(jsonb_agg(row_to_json(students_data)::jsonb), '[]'::jsonb),
      'metadata', jsonb_build_object(
        'total_count', (SELECT COUNT(*) FROM students_data),
        'returned_count', (SELECT COUNT(*) FROM students_data),
        'filters_applied', jsonb_build_object(
          'department_id', p_department_id,
          'program_id', p_program_id,
          'semester_id', p_semester_id,
          'section_id', p_section_id,
          'status', p_status,
          'search', p_search
        )
      )
    )
    FROM students_data
  );
END;
$function$;

-- ai_rpc_students_by_department(p_user_id uuid, p_institution_id uuid, p_status text)
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

-- ai_rpc_students_by_status(p_user_id uuid, p_status text, p_department_id uuid, p_limit integer, p_offset integer)
CREATE OR REPLACE FUNCTION public.ai_rpc_students_by_status(p_user_id uuid, p_status text DEFAULT 'active'::text, p_department_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  RETURN ai_rpc_students(p_user_id, p_department_id, NULL, NULL, NULL, p_status, NULL, p_limit, p_offset);
END;
$function$;

-- ai_rpc_students_summary(p_user_id uuid, p_institution_id uuid, p_department_id uuid)
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

-- ai_rpc_timetable_slots(p_user_id uuid, p_timetable_id uuid, p_limit integer, p_offset integer)
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

-- ai_rpc_timetables(p_user_id uuid, p_department_id uuid, p_academic_year_id uuid, p_section_id uuid, p_limit integer, p_offset integer)
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

-- ai_rpc_unread_notifications(p_user_id uuid, p_limit integer)
CREATE OR REPLACE FUNCTION public.ai_rpc_unread_notifications(p_user_id uuid, p_limit integer DEFAULT 10000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_result jsonb;
    v_count integer;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
    SELECT COUNT(*)
    INTO v_count
    FROM notifications n
    WHERE n.user_id = p_user_id AND n.is_read = false;

    SELECT jsonb_build_object(
        'success', true,
        'data', COALESCE(jsonb_agg(row_to_json(notif)), '[]'::jsonb),
        'metadata', jsonb_build_object(
            'total_count', v_count,
            'returned_count', COUNT(*),
            'has_more', false,
            'filters_applied', jsonb_build_object('is_read', false)
        ),
        'actions_available', jsonb_build_array(
            jsonb_build_object('action', 'mark_all_read', 'label', 'Mark All as Read')
        )
    )
    INTO v_result
    FROM (
        SELECT n.id, n.title, n.body, n.category, n.is_read, n.created_at
        FROM notifications n
        WHERE n.user_id = p_user_id AND n.is_read = false
        ORDER BY n.created_at DESC
        LIMIT p_limit
    ) notif;

    RETURN v_result;
END;
$function$;

-- ai_rpc_user_context(p_user_id uuid)
CREATE OR REPLACE FUNCTION public.ai_rpc_user_context(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile RECORD;
  v_institution_ids UUID[];
  v_permissions JSONB;
  v_academic_context JSONB;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  -- Get profile
  SELECT * INTO v_profile
  FROM profiles
  WHERE id = p_user_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'User not found');
  END IF;
  
  -- Get accessible institution IDs
  SELECT COALESCE(array_agg(institution_id), '{}')
  INTO v_institution_ids
  FROM user_institution_access
  WHERE user_id = p_user_id;
  
  -- Get permissions from custom roles (fixed column names)
  SELECT COALESCE(cr.permissions, '[]'::JSONB)
  INTO v_permissions
  FROM user_roles ur
  JOIN custom_roles cr ON ur.role_id = cr.id
  WHERE ur.user_id = p_user_id
  LIMIT 1;
  
  -- Default to empty array if no role found
  IF v_permissions IS NULL THEN
    v_permissions := '[]'::JSONB;
  END IF;
  
  -- Get current academic context (fixed column names)
  SELECT jsonb_build_object(
    'current_academic_year_id', ay.id,
    'current_academic_year_name', ay.academic_year_name,
    'institution_name', i.name
  )
  INTO v_academic_context
  FROM academic_years ay
  LEFT JOIN institutions i ON i.id = v_institution_ids[1]
  WHERE ay.is_active = true
  LIMIT 1;
  
  RETURN jsonb_build_object(
    'user_id', v_profile.id,
    'email', v_profile.email,
    'full_name', v_profile.full_name,
    'role', v_profile.role,
    'is_super_admin', COALESCE(v_profile.is_super_admin, false),
    'institution_ids', v_institution_ids,
    'department_id', v_profile.department_id,
    'permissions', v_permissions,
    'academic_context', COALESCE(v_academic_context, '{}'::JSONB)
  );
END;
$function$;

-- ai_rpc_user_roles(p_user_id uuid, p_target_user_id uuid, p_limit integer, p_offset integer)
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

-- ai_rpc_users(p_user_id uuid, p_institution_id uuid, p_role text, p_search text, p_limit integer, p_offset integer)
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

-- ai_rpc_validate_permission(p_user_id uuid, p_permission text)
CREATE OR REPLACE FUNCTION public.ai_rpc_validate_permission(p_user_id uuid, p_permission text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_super_admin BOOLEAN;
  v_has_permission BOOLEAN;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  p_user_id := auth.uid();
  -- Check if super admin
  SELECT COALESCE(is_super_admin, false)
  INTO v_is_super_admin
  FROM profiles
  WHERE id = p_user_id;
  
  IF v_is_super_admin THEN
    RETURN true;
  END IF;
  
  -- Check permissions from custom roles
  SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = p_user_id
    AND cr.permissions ? p_permission
  )
  INTO v_has_permission;
  
  RETURN v_has_permission;
END;
$function$;

-- ai_get_accessible_institutions (shared helper — secures 6 catalog tools at root)
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
