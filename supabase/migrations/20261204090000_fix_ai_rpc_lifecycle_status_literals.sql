-- 20261204090000_fix_ai_rpc_lifecycle_status_literals.sql
-- Updated: 2026-09-13 — five ai_rpc admission functions compare lifecycle_status
-- against literals that are not labels of that enum.
--
-- DEFECT A — dead literal, present in all five functions.
--   They compare `lp.lifecycle_status::TEXT = ... 'registered'`. `registered` is a
--   label of `gdpi_candidate_status`, NOT of `lifecycle_status` (15 labels: admitted,
--   pending, approved, account, rejected, waitlisted, active, inactive, exited,
--   graduated, alumni, enquiry, enquiry_submitted, reserved, withdrawal_pending).
--   Because the comparison CASTS to text there is no 22P02 crash — the predicate
--   simply matches nothing, forever. Live count of learners with 'registered': 0.
--
-- DEFECT B — 'admitted' duplicated where 'active' was meant, in three functions.
--   ai_rpc_admissions_by_location asked for IN ('admitted','admitted','registered'),
--   so it counted ONLY admitted learners, while its siblings
--   (ai_rpc_admission_analytics / _referrers) counted admitted + active for the very
--   same "converted" concept. Two dashboards, one word, a 15x gap:
--       by_location   359 learners
--       analytics   5,355 learners
--   ai_rpc_admission_statistics and ai_rpc_admissions carry the same duplicate inside
--   a longer list, where it is a no-op (a duplicate literal in an IN list changes
--   nothing) — removed there purely so the list stops lying about its own intent.
--
-- ROOT CAUSE: 'registered' / 'applied' / 'enrolled' are admission-FUNNEL vocabulary
--   (funnel_stage, admission_lead_stage, gdpi_candidate_status). They were copied onto
--   learners_profiles.lifecycle_status, which shares none of them. Cast to text ->
--   silent nothing; uncast -> crash (see 20261203000000 for the crashing pair).
--
-- MEASURED EFFECT (production, 2026-09-13, all learners_profiles):
--   ai_rpc_admission_analytics       5,355 -> 5,355   (no change — cleanup only)
--   ai_rpc_admission_referrers       5,355 -> 5,355   (no change — cleanup only)
--   ai_rpc_admission_statistics        449 ->   449   (no change — cleanup only)
--   ai_rpc_admissions                  449 ->   449   (no change — cleanup only)
--   ai_rpc_admissions_by_location      359 -> 5,355   (THE FIX — now matches siblings)
--   Exactly one number moves, and it is the one that was wrong.
--
-- Bodies below are verbatim `pg_get_functiondef` output from production with only the
-- IN-lists above changed, so this migration cannot silently revert unrelated drift.
-- Grants re-assert the existing posture (anon revoked, authenticated granted) using
-- identity arguments read from pg_proc — never hand-typed (cf. #3683: a grant naming a
-- 1-arg signature that never existed failed the file with 42883).

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
GRANT  EXECUTE ON FUNCTION public.ai_rpc_admission_analytics(uuid, uuid, uuid, boolean) TO authenticated;  -- ci:allow-secdef-authenticated (pre-existing reader, no new exposure)

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
GRANT  EXECUTE ON FUNCTION public.ai_rpc_admission_referrers(uuid, text, text, uuid, uuid, uuid, text, text, text, integer, boolean) TO authenticated;  -- ci:allow-secdef-authenticated (pre-existing reader, no new exposure)

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
      AND lp.lifecycle_status::TEXT IN ('admitted', 'active')
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

REVOKE EXECUTE ON FUNCTION public.ai_rpc_admissions_by_location(uuid, text, text, text, text, text, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_admissions_by_location(uuid, text, text, text, text, text, boolean) TO authenticated;  -- ci:allow-secdef-authenticated (pre-existing reader, no new exposure)

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
      WHERE lp.lifecycle_status::TEXT IN ('admitted', 'pending', 'approved', 'rejected', 'waitlisted')
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

REVOKE EXECUTE ON FUNCTION public.ai_rpc_admission_statistics(uuid, uuid, text, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_admission_statistics(uuid, uuid, text, text, text) TO authenticated;  -- ci:allow-secdef-authenticated (pre-existing reader, no new exposure)

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
      WHERE lp.lifecycle_status::TEXT IN ('admitted', 'pending', 'approved', 'rejected', 'waitlisted')
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

REVOKE EXECUTE ON FUNCTION public.ai_rpc_admissions(uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, boolean, boolean, text, text, boolean, text, text, text, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_admissions(uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, boolean, boolean, text, text, boolean, text, text, text, boolean) TO authenticated;  -- ci:allow-secdef-authenticated (pre-existing reader, no new exposure)
