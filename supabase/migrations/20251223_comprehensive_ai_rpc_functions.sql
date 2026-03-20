-- ============================================
-- Comprehensive AI RPC Functions for Learners & Admissions
-- Created: 2025-12-23
-- Purpose: Complete implementation of AI Query System with all learners_profiles fields
-- Covers: Learners (11 functions), Admissions (6 functions), Billing (2 functions), Attendance (2 functions)
-- ============================================

-- ============================================
-- PART 1: LEARNERS MODULE FUNCTIONS (11 functions)
-- ============================================

-- Function 1: Get Students - Basic learner query with filters
CREATE OR REPLACE FUNCTION ai_rpc_students(
  p_user_id UUID,
  p_department_id UUID DEFAULT NULL,
  p_program_id UUID DEFAULT NULL,
  p_semester_id UUID DEFAULT NULL,
  p_section_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 10000,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_profile RECORD;
  v_institution_id UUID;
  v_total_count INTEGER;
BEGIN
  -- Get user profile
  SELECT institution_id, is_super_admin, role
  INTO v_profile
  FROM profiles
  WHERE id = p_user_id;

  -- Get institution context
  v_institution_id := COALESCE(
    (SELECT current_institution_id FROM profiles WHERE id = p_user_id),
    v_profile.institution_id
  );

  -- Build query
  WITH filtered_learners AS (
    SELECT
      lp.id,
      lp.first_name,
      lp.last_name,
      lp.roll_number,
      lp.register_number,
      lp.student_email,
      lp.college_email,
      lp.student_mobile,
      lp.lifecycle_status,
      lp.gender,
      lp.accommodation_type,
      lp.section_id,
      lp.semester_id,
      lp.program_id,
      lp.department_id,
      lp.institution_id,
      lp.student_photo_url,
      -- Related data
      d.department_name,
      p.program_name,
      s.semester_name,
      sec.section_name
    FROM learners_profiles lp
    LEFT JOIN departments d ON lp.department_id = d.id
    LEFT JOIN programs p ON lp.program_id = p.id
    LEFT JOIN semesters s ON lp.semester_id = s.id
    LEFT JOIN sections sec ON lp.section_id = sec.id
    WHERE
      (v_profile.is_super_admin = TRUE OR lp.institution_id = v_institution_id)
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
  ),
  total AS (
    SELECT COUNT(*) as count
    FROM learners_profiles lp
    WHERE
      (v_profile.is_super_admin = TRUE OR lp.institution_id = v_institution_id)
      AND (p_department_id IS NULL OR lp.department_id = p_department_id)
      AND (p_program_id IS NULL OR lp.program_id = p_program_id)
      AND (p_semester_id IS NULL OR lp.semester_id = p_semester_id)
      AND (p_section_id IS NULL OR lp.section_id = p_section_id)
      AND (p_status IS NULL OR lp.lifecycle_status::TEXT ILIKE p_status)
  )
  SELECT jsonb_build_object(
    'success', TRUE,
    'data', COALESCE(jsonb_agg(row_to_json(fl)::jsonb), '[]'::jsonb),
    'metadata', jsonb_build_object(
      'total_count', (SELECT count FROM total),
      'returned_count', (SELECT COUNT(*) FROM filtered_learners),
      'has_more', (SELECT count FROM total) > p_offset + p_limit,
      'filters_applied', jsonb_build_object(
        'department_id', p_department_id,
        'program_id', p_program_id,
        'semester_id', p_semester_id,
        'section_id', p_section_id,
        'status', p_status,
        'search', p_search
      )
    ),
    'actions_available', '[]'::jsonb
  )
  INTO v_result
  FROM filtered_learners fl;

  RETURN v_result;
END;
$$;

-- Function 2: Get Student Details - Complete details for a single learner
CREATE OR REPLACE FUNCTION ai_rpc_student_details(
  p_user_id UUID,
  p_student_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_profile RECORD;
BEGIN
  -- Get user profile
  SELECT institution_id, is_super_admin
  INTO v_profile
  FROM profiles
  WHERE id = p_user_id;

  -- Get complete learner details with all 71 fields
  WITH learner_details AS (
    SELECT
      lp.*,
      -- Related entity names
      i.name as institution_name,
      deg.degree_name,
      d.department_name,
      p.program_name,
      s.semester_name,
      sec.section_name,
      ay.academic_year_name,
      r.regulation_name,
      b.batch_name
    FROM learners_profiles lp
    LEFT JOIN institutions i ON lp.institution_id = i.id
    LEFT JOIN degrees deg ON lp.degree_id = deg.id
    LEFT JOIN departments d ON lp.department_id = d.id
    LEFT JOIN programs p ON lp.program_id = p.id
    LEFT JOIN semesters s ON lp.semester_id = s.id
    LEFT JOIN sections sec ON lp.section_id = sec.id
    LEFT JOIN academic_years ay ON lp.academic_year_id = ay.id
    LEFT JOIN regulations r ON lp.regulation_id = r.id
    LEFT JOIN batches b ON lp.batch_id = b.id
    WHERE
      lp.id = p_student_id
      AND (v_profile.is_super_admin = TRUE OR lp.institution_id = v_profile.institution_id)
  )
  SELECT jsonb_build_object(
    'success', TRUE,
    'data', row_to_json(ld)::jsonb,
    'metadata', jsonb_build_object(
      'total_count', 1,
      'returned_count', 1,
      'has_more', FALSE,
      'filters_applied', jsonb_build_object('student_id', p_student_id)
    ),
    'actions_available', jsonb_build_array(
      jsonb_build_object(
        'id', 'view_attendance',
        'label', 'View Attendance',
        'tier', 1
      ),
      jsonb_build_object(
        'id', 'view_bills',
        'label', 'View Bills',
        'tier', 1
      )
    )
  )
  INTO v_result
  FROM learner_details ld;

  RETURN COALESCE(v_result, jsonb_build_object(
    'success', FALSE,
    'data', NULL,
    'metadata', jsonb_build_object('total_count', 0, 'returned_count', 0, 'has_more', FALSE),
    'actions_available', '[]'::jsonb,
    'error', jsonb_build_object('code', 'NOT_FOUND', 'message', 'Learner not found')
  ));
END;
$$;

-- Function 3: Advanced Student Search
CREATE OR REPLACE FUNCTION ai_rpc_student_search(
  p_user_id UUID,
  p_search_query TEXT,
  p_search_fields TEXT[] DEFAULT ARRAY['name', 'roll_number', 'email', 'mobile'],
  p_status TEXT DEFAULT NULL,
  p_department_id UUID DEFAULT NULL,
  p_exact_match BOOLEAN DEFAULT FALSE,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_profile RECORD;
  v_institution_id UUID;
  v_search_pattern TEXT;
BEGIN
  -- Get user profile
  SELECT institution_id, is_super_admin
  INTO v_profile
  FROM profiles
  WHERE id = p_user_id;

  v_institution_id := v_profile.institution_id;
  v_search_pattern := CASE
    WHEN p_exact_match THEN p_search_query
    ELSE '%' || p_search_query || '%'
  END;

  WITH searched_learners AS (
    SELECT
      lp.id,
      lp.first_name || ' ' || lp.last_name as full_name,
      lp.roll_number,
      lp.register_number,
      lp.student_email,
      lp.student_mobile,
      lp.lifecycle_status,
      lp.department_id,
      d.department_name,
      lp.section_id,
      sec.section_name,
      -- Match indicator
      CASE
        WHEN 'name' = ANY(p_search_fields) AND (lp.first_name ILIKE v_search_pattern OR lp.last_name ILIKE v_search_pattern) THEN 'name'
        WHEN 'roll_number' = ANY(p_search_fields) AND lp.roll_number ILIKE v_search_pattern THEN 'roll_number'
        WHEN 'email' = ANY(p_search_fields) AND (lp.student_email ILIKE v_search_pattern OR lp.college_email ILIKE v_search_pattern) THEN 'email'
        WHEN 'mobile' = ANY(p_search_fields) AND (lp.student_mobile ILIKE v_search_pattern OR lp.father_mobile ILIKE v_search_pattern OR lp.mother_mobile ILIKE v_search_pattern) THEN 'mobile'
        WHEN 'application_id' = ANY(p_search_fields) AND lp.application_id ILIKE v_search_pattern THEN 'application_id'
        WHEN 'aadhar' = ANY(p_search_fields) AND lp.aadhar_number ILIKE v_search_pattern THEN 'aadhar'
        WHEN 'father_name' = ANY(p_search_fields) AND lp.father_name ILIKE v_search_pattern THEN 'father_name'
        WHEN 'mother_name' = ANY(p_search_fields) AND lp.mother_name ILIKE v_search_pattern THEN 'mother_name'
        ELSE 'other'
      END as matched_field
    FROM learners_profiles lp
    LEFT JOIN departments d ON lp.department_id = d.id
    LEFT JOIN sections sec ON lp.section_id = sec.id
    WHERE
      (v_profile.is_super_admin = TRUE OR lp.institution_id = v_institution_id)
      AND (p_department_id IS NULL OR lp.department_id = p_department_id)
      AND (p_status IS NULL OR lp.lifecycle_status::TEXT ILIKE p_status)
      AND (
        ('name' = ANY(p_search_fields) AND (lp.first_name ILIKE v_search_pattern OR lp.last_name ILIKE v_search_pattern)) OR
        ('roll_number' = ANY(p_search_fields) AND lp.roll_number ILIKE v_search_pattern) OR
        ('email' = ANY(p_search_fields) AND (lp.student_email ILIKE v_search_pattern OR lp.college_email ILIKE v_search_pattern)) OR
        ('mobile' = ANY(p_search_fields) AND (lp.student_mobile ILIKE v_search_pattern OR lp.father_mobile ILIKE v_search_pattern OR lp.mother_mobile ILIKE v_search_pattern)) OR
        ('application_id' = ANY(p_search_fields) AND lp.application_id ILIKE v_search_pattern) OR
        ('aadhar' = ANY(p_search_fields) AND lp.aadhar_number ILIKE v_search_pattern) OR
        ('father_name' = ANY(p_search_fields) AND lp.father_name ILIKE v_search_pattern) OR
        ('mother_name' = ANY(p_search_fields) AND lp.mother_name ILIKE v_search_pattern)
      )
    ORDER BY lp.first_name, lp.last_name
    LIMIT p_limit OFFSET p_offset
  )
  SELECT jsonb_build_object(
    'success', TRUE,
    'data', COALESCE(jsonb_agg(row_to_json(sl)::jsonb), '[]'::jsonb),
    'metadata', jsonb_build_object(
      'total_count', (SELECT COUNT(*) FROM searched_learners),
      'returned_count', (SELECT COUNT(*) FROM searched_learners),
      'has_more', FALSE,
      'filters_applied', jsonb_build_object(
        'search_query', p_search_query,
        'search_fields', p_search_fields,
        'exact_match', p_exact_match
      )
    ),
    'actions_available', '[]'::jsonb
  )
  INTO v_result
  FROM searched_learners sl;

  RETURN v_result;
END;
$$;

-- Function 4: Get Students by Department
CREATE OR REPLACE FUNCTION ai_rpc_students_by_department(
  p_user_id UUID,
  p_institution_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_profile RECORD;
  v_inst_id UUID;
BEGIN
  -- Get user profile
  SELECT institution_id, is_super_admin
  INTO v_profile
  FROM profiles
  WHERE id = p_user_id;

  v_inst_id := COALESCE(p_institution_id, v_profile.institution_id);

  WITH dept_stats AS (
    SELECT
      d.id as department_id,
      d.department_name,
      d.department_code,
      COUNT(*) as total_learners,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::TEXT = 'active') as active_count,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::TEXT = 'inactive') as inactive_count,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::TEXT = 'graduated') as graduated_count,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::TEXT = 'exited') as exited_count,
      COUNT(*) FILTER (WHERE lp.gender = 'Male') as male_count,
      COUNT(*) FILTER (WHERE lp.gender = 'Female') as female_count
    FROM departments d
    LEFT JOIN learners_profiles lp ON d.id = lp.department_id
      AND (p_status IS NULL OR lp.lifecycle_status::TEXT ILIKE p_status)
    WHERE
      (v_profile.is_super_admin = TRUE OR d.institution_id = v_inst_id)
    GROUP BY d.id, d.department_name, d.department_code
    ORDER BY d.department_name
  )
  SELECT jsonb_build_object(
    'success', TRUE,
    'data', COALESCE(jsonb_agg(row_to_json(ds)::jsonb), '[]'::jsonb),
    'metadata', jsonb_build_object(
      'total_count', (SELECT COUNT(*) FROM dept_stats),
      'returned_count', (SELECT COUNT(*) FROM dept_stats),
      'has_more', FALSE,
      'filters_applied', jsonb_build_object('institution_id', v_inst_id, 'status', p_status)
    ),
    'actions_available', '[]'::jsonb
  )
  INTO v_result
  FROM dept_stats ds;

  RETURN v_result;
END;
$$;

-- Function 5: Get Students Summary
CREATE OR REPLACE FUNCTION ai_rpc_students_summary(
  p_user_id UUID,
  p_institution_id UUID DEFAULT NULL,
  p_department_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_profile RECORD;
  v_inst_id UUID;
BEGIN
  -- Get user profile
  SELECT institution_id, is_super_admin
  INTO v_profile
  FROM profiles
  WHERE id = p_user_id;

  v_inst_id := COALESCE(p_institution_id, v_profile.institution_id);

  WITH summary_stats AS (
    SELECT
      COUNT(*) as total_learners,
      -- Status breakdown
      COUNT(*) FILTER (WHERE lifecycle_status::TEXT = 'active') as active_count,
      COUNT(*) FILTER (WHERE lifecycle_status::TEXT = 'inactive') as inactive_count,
      COUNT(*) FILTER (WHERE lifecycle_status::TEXT = 'graduated') as graduated_count,
      COUNT(*) FILTER (WHERE lifecycle_status::TEXT = 'exited') as exited_count,
      COUNT(*) FILTER (WHERE lifecycle_status::TEXT = 'enquiry') as enquiry_count,
      COUNT(*) FILTER (WHERE lifecycle_status::TEXT = 'admitted') as admitted_count,
      -- Gender breakdown
      COUNT(*) FILTER (WHERE gender = 'Male') as male_count,
      COUNT(*) FILTER (WHERE gender = 'Female') as female_count,
      -- Accommodation breakdown
      COUNT(*) FILTER (WHERE accommodation_type = 'hostel') as hostel_count,
      COUNT(*) FILTER (WHERE accommodation_type = 'dayscholar') as dayscholar_count,
      -- Academic breakdown
      COUNT(*) FILTER (WHERE first_graduate = TRUE) as first_graduate_count,
      COUNT(*) FILTER (WHERE counseling_applied = TRUE) as counseling_applied_count,
      -- Community breakdown
      COUNT(*) FILTER (WHERE community ILIKE '%BC%') as bc_count,
      COUNT(*) FILTER (WHERE community ILIKE '%MBC%') as mbc_count,
      COUNT(*) FILTER (WHERE community ILIKE '%SC%') as sc_count,
      COUNT(*) FILTER (WHERE community ILIKE '%ST%') as st_count,
      COUNT(*) FILTER (WHERE community ILIKE '%OC%') as oc_count
    FROM learners_profiles
    WHERE
      (v_profile.is_super_admin = TRUE OR institution_id = v_inst_id)
      AND (p_department_id IS NULL OR department_id = p_department_id)
  )
  SELECT jsonb_build_object(
    'success', TRUE,
    'data', row_to_json(ss)::jsonb,
    'metadata', jsonb_build_object(
      'total_count', 1,
      'returned_count', 1,
      'has_more', FALSE,
      'filters_applied', jsonb_build_object('institution_id', v_inst_id, 'department_id', p_department_id)
    ),
    'actions_available', '[]'::jsonb
  )
  INTO v_result
  FROM summary_stats ss;

  RETURN v_result;
END;
$$;

-- TO BE CONTINUED IN NEXT MESSAGE DUE TO LENGTH...
-- This file will continue with:
-- - ai_rpc_learners_by_location
-- - ai_rpc_learners_comprehensive
-- - ai_rpc_students_by_section
-- - ai_rpc_student_onboarding_status
-- - ai_rpc_promotion_candidates
-- - ai_rpc_accessible_scope
-- Plus all Admissions, Billing, and Attendance functions
