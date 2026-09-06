-- ============================================================================
-- 20260602173000 — AI-query RPCs: read/filter quota via FK (quotas join)
-- ============================================================================
-- ai_rpc_learners_comprehensive and ai_rpc_admissions selected lp.quota (TEXT)
-- and filtered `lp.quota ILIKE p_quota`. The quota TEXT column is being retired
-- in favour of quota_id (FK → quotas). Both now LEFT JOIN quotas and:
--   • return q.name AS quota (readable name, unchanged response shape), and
--   • filter on q.name OR q.code, so NL inputs like 'GOVERNMENT'/'MANAGEMENT'
--     match the quota CODE (government/management) — more robust than the old
--     exact-text ILIKE against the canonicalised name.
-- Only the quota SELECT line, the quotas join, and the quota filter changed.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ai_rpc_learners_comprehensive(p_user_id uuid, p_search text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_gender text DEFAULT NULL::text, p_religion text DEFAULT NULL::text, p_community text DEFAULT NULL::text, p_accommodation_type text DEFAULT NULL::text, p_bus_required boolean DEFAULT NULL::boolean, p_institution_id uuid DEFAULT NULL::uuid, p_department_id uuid DEFAULT NULL::uuid, p_program_id uuid DEFAULT NULL::uuid, p_semester_id uuid DEFAULT NULL::uuid, p_entry_type text DEFAULT NULL::text, p_quota text DEFAULT NULL::text, p_first_graduate boolean DEFAULT NULL::boolean, p_district text DEFAULT NULL::text, p_include_stats boolean DEFAULT true, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_profile RECORD;
  v_inst_id UUID;
BEGIN
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

  -- Determine institution scope
  IF v_profile.is_super_admin AND p_institution_id IS NOT NULL THEN
    v_inst_id := p_institution_id;
  ELSIF v_profile.institution_id IS NOT NULL THEN
    v_inst_id := v_profile.institution_id;
  ELSE
    v_inst_id := NULL;
  END IF;

  RETURN (
    WITH learners_data AS (
      SELECT
        lp.id,
        lp.application_id,
        lp.first_name,
        lp.last_name,
        lp.roll_number,
        lp.register_number,
        lp.student_email,
        lp.student_mobile,
        lp.gender,
        lp.religion,
        lp.community,
        q.name AS quota,
        lp.entry_type,
        lp.accommodation_type,
        lp.bus_required,
        lp.lifecycle_status,
        lp.permanent_address_state,
        lp.permanent_address_district,

        -- Institution details
        lp.institution_id,
        i.name as institution_name,

        -- Department details
        lp.department_id,
        d.department_name,

        -- Program details
        lp.program_id,
        p.program_name,

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
        reg.regulation_code

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

      WHERE (v_profile.is_super_admin = TRUE OR lp.institution_id = v_inst_id)
        AND (p_status IS NULL OR lp.lifecycle_status::TEXT ILIKE p_status)
        AND (p_gender IS NULL OR lp.gender ILIKE p_gender)
        AND (p_religion IS NULL OR lp.religion ILIKE p_religion)
        AND (p_community IS NULL OR lp.community ILIKE p_community)
        AND (p_accommodation_type IS NULL OR lp.accommodation_type ILIKE p_accommodation_type)
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
      SELECT
        COUNT(*) as total_count,
        COUNT(DISTINCT department_id) as departments_count,
        COUNT(DISTINCT program_id) as programs_count
      FROM learners_data
    )
    SELECT jsonb_build_object(
      'success', TRUE,
      'data', COALESCE(jsonb_agg(row_to_json(learners_data)::jsonb), '[]'::jsonb),
      'metadata', CASE
        WHEN p_include_stats THEN (
          SELECT jsonb_build_object(
            'total_count', total_count,
            'departments_count', departments_count,
            'programs_count', programs_count,
            'returned_count', (SELECT COUNT(*) FROM learners_data),
            'has_more', (SELECT total_count > p_limit FROM stats_data)
          )
          FROM stats_data
        )
        ELSE jsonb_build_object(
          'returned_count', (SELECT COUNT(*) FROM learners_data)
        )
      END
    )
    FROM learners_data
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.ai_rpc_admissions(p_user_id uuid, p_institution_id uuid DEFAULT NULL::uuid, p_department_id uuid DEFAULT NULL::uuid, p_program_id uuid DEFAULT NULL::uuid, p_degree_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text, p_entry_type text DEFAULT NULL::text, p_district text DEFAULT NULL::text, p_state text DEFAULT NULL::text, p_gender text DEFAULT NULL::text, p_religion text DEFAULT NULL::text, p_community text DEFAULT NULL::text, p_counseling_applied boolean DEFAULT NULL::boolean, p_first_graduate boolean DEFAULT NULL::boolean, p_quota text DEFAULT NULL::text, p_accommodation_type text DEFAULT NULL::text, p_bus_required boolean DEFAULT NULL::boolean, p_search text DEFAULT NULL::text, p_date_from text DEFAULT NULL::text, p_date_to text DEFAULT NULL::text, p_include_stats boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_profile RECORD;
  v_inst_id UUID;
BEGIN
  SELECT p.id, p.role, p.is_super_admin, p.institution_id
  INTO v_profile
  FROM profiles p
  WHERE p.id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'User profile not found');
  END IF;

  IF v_profile.is_super_admin AND p_institution_id IS NOT NULL THEN
    v_inst_id := p_institution_id;
  ELSIF v_profile.institution_id IS NOT NULL THEN
    v_inst_id := v_profile.institution_id;
  ELSE
    v_inst_id := NULL;
  END IF;

  RETURN (
    WITH admissions_data AS (
      SELECT
        lp.id,
        lp.application_id,
        lp.first_name,
        lp.last_name,
        lp.date_of_birth,
        lp.gender,
        lp.religion,
        lp.community,
        lp.caste,
        q.name AS quota,
        lp.student_email,
        lp.student_mobile,
        lp.father_name,
        lp.father_mobile,
        lp.mother_name,
        lp.mother_mobile,
        lp.permanent_address_street,
        lp.permanent_address_taluk,
        lp.permanent_address_district,
        lp.permanent_address_state,
        lp.permanent_address_pin_code,
        lp.entry_type,
        lp.accommodation_type,
        lp.bus_required,
        lp.counseling_applied,
        lp.tenth_marks,
        lp.twelfth_marks,
        lp.neet_score,
        lp.lifecycle_status,
        lp.created_at,
        lp.institution_id,
        i.name as institution_name,
        lp.department_id,
        d.department_name,
        lp.program_id,
        prog.program_name,
        lp.degree_id,
        deg.degree_name,
        lp.academic_year_id,
        ay.academic_year_name,
        lp.batch_id,
        bat.batch_name,
        lp.regulation_id,
        reg.regulation_year,
        reg.regulation_code
      FROM learners_profiles lp
      LEFT JOIN institutions i    ON lp.institution_id    = i.id
      LEFT JOIN departments d     ON lp.department_id     = d.id
      LEFT JOIN programs prog     ON lp.program_id        = prog.id
      LEFT JOIN degrees deg       ON lp.degree_id         = deg.id
      LEFT JOIN academic_years ay ON lp.academic_year_id  = ay.id
      LEFT JOIN batches bat       ON lp.batch_id          = bat.id
      LEFT JOIN regulations reg   ON lp.regulation_id     = reg.id
      LEFT JOIN quotas q          ON q.id                 = lp.quota_id
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
        AND (p_community          IS NULL OR lp.community                   ILIKE p_community)
        AND (p_counseling_applied IS NULL OR lp.counseling_applied          = p_counseling_applied)
        AND (p_quota              IS NULL OR q.name ILIKE p_quota OR q.code ILIKE p_quota)
        AND (p_accommodation_type IS NULL OR lp.accommodation_type          ILIKE p_accommodation_type)
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
      SELECT
        COUNT(*) as total_count,
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
