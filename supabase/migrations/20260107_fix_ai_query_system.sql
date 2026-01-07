-- ============================================
-- FIX AI QUERY SYSTEM FOR UNIFIED LEARNERS_PROFILES
-- ============================================
-- Created: 2026-01-07
-- Purpose: Fix AI Query RPC functions for new unified learners_profiles table
-- Issues Fixed:
--   1. Remove aadhar_number field references (doesn't exist in schema)
--   2. Implement missing critical RPC functions
--   3. Add lifecycle_status filtering for admissions vs students queries
-- ============================================

-- ============================================
-- SECTION 1: FIX EXISTING RPC FUNCTIONS
-- ============================================

-- Fix ai_rpc_student_search - Remove aadhar_number references
CREATE OR REPLACE FUNCTION public.ai_rpc_student_search(
  p_user_id UUID,
  p_search_query TEXT DEFAULT NULL,
  p_search_fields TEXT[] DEFAULT ARRAY['name', 'roll_number', 'email', 'mobile']::TEXT[],
  p_exact_match BOOLEAN DEFAULT FALSE,
  p_department_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile RECORD;
  v_institution_id UUID;
  v_search_pattern TEXT;
BEGIN
  -- Get user profile and institution
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
      'error', 'User profile not found',
      'metadata', jsonb_build_object('error_code', 'PROFILE_NOT_FOUND')
    );
  END IF;

  v_institution_id := v_profile.institution_id;

  -- Build search pattern
  IF p_exact_match THEN
    v_search_pattern := p_search_query;
  ELSE
    v_search_pattern := '%' || p_search_query || '%';
  END IF;

  -- Search learners with specified fields
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
      lp.department_id,
      d.department_name,
      lp.section_id,
      sec.section_name,
      -- Match indicator (FIXED: Removed aadhar references)
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
    LEFT JOIN departments d ON lp.department_id = d.id
    LEFT JOIN sections sec ON lp.section_id = sec.id
    WHERE
      (v_profile.is_super_admin = TRUE OR lp.institution_id = v_institution_id)
      AND (p_department_id IS NULL OR lp.department_id = p_department_id)
      AND (p_status IS NULL OR lp.lifecycle_status::TEXT ILIKE p_status)
      -- FIXED: Removed aadhar search condition
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
    'data', COALESCE(jsonb_agg(row_to_json(sl)::jsonb), '[]'::jsonb),
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
  FROM searched_learners;
END;
$$;

-- ============================================
-- SECTION 2: IMPLEMENT MISSING CRITICAL RPC FUNCTIONS
-- ============================================

-- 2.1 ai_rpc_hierarchy_summary
-- Purpose: Get organization hierarchy summary (institutions, departments, programs, sections)
CREATE OR REPLACE FUNCTION public.ai_rpc_hierarchy_summary(
  p_user_id UUID,
  p_institution_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile RECORD;
  v_institution_id UUID;
BEGIN
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

  -- Build hierarchy summary
  RETURN jsonb_build_object(
    'success', TRUE,
    'data', jsonb_build_object(
      'institution', (
        SELECT jsonb_build_object(
          'id', i.id,
          'name', i.institution_name,
          'code', i.institution_code,
          'type', i.institution_type
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
$$;

-- 2.2 ai_rpc_kpi_summary
-- Purpose: Get key performance indicators summary
CREATE OR REPLACE FUNCTION public.ai_rpc_kpi_summary(
  p_user_id UUID,
  p_institution_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile RECORD;
  v_institution_id UUID;
BEGIN
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

  -- Build KPI summary
  RETURN jsonb_build_object(
    'success', TRUE,
    'data', jsonb_build_object(
      'learners', jsonb_build_object(
        'total_enquiries', (
          SELECT COUNT(*) FROM learners_profiles
          WHERE institution_id = v_institution_id
          AND lifecycle_status = 'enquiry'
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
          SELECT COUNT(*) FROM staff_profiles
          WHERE institution_id = v_institution_id
          AND status = 'active'
        )
      )
    ),
    'metadata', jsonb_build_object(
      'institution_id', v_institution_id,
      'generated_at', NOW()
    )
  );
END;
$$;

-- 2.3 ai_rpc_admissions
-- Purpose: Get admissions data (lifecycle_status: enquiry, pending, approved, rejected, waitlisted)
CREATE OR REPLACE FUNCTION public.ai_rpc_admissions(
  p_user_id UUID,
  p_status TEXT DEFAULT NULL,
  p_department_id UUID DEFAULT NULL,
  p_program_id UUID DEFAULT NULL,
  p_academic_year TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile RECORD;
  v_institution_id UUID;
BEGIN
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

  v_institution_id := v_profile.institution_id;

  -- Query admissions (filter by admission lifecycle statuses)
  WITH admission_data AS (
    SELECT
      lp.id,
      lp.application_id,
      lp.first_name,
      lp.last_name,
      lp.date_of_birth,
      lp.gender,
      lp.student_email,
      lp.student_mobile,
      lp.college_email,
      lp.lifecycle_status,
      lp.entry_type,
      lp.quota,
      lp.category,
      lp.first_graduate,
      lp.counseling_applied,
      lp.scholarship_type,
      lp.accommodation_type,
      d.department_name,
      pr.program_name,
      lp.academic_year,
      lp.created_at,
      lp.updated_at
    FROM learners_profiles lp
    LEFT JOIN departments d ON lp.department_id = d.id
    LEFT JOIN programs pr ON lp.program_id = pr.id
    WHERE
      (v_profile.is_super_admin = TRUE OR lp.institution_id = v_institution_id)
      -- Filter for admission-related statuses only
      AND lp.lifecycle_status IN ('enquiry', 'pending', 'approved', 'rejected', 'waitlisted')
      AND (p_status IS NULL OR lp.lifecycle_status::TEXT = p_status)
      AND (p_department_id IS NULL OR lp.department_id = p_department_id)
      AND (p_program_id IS NULL OR lp.program_id = p_program_id)
      AND (p_academic_year IS NULL OR lp.academic_year = p_academic_year)
    ORDER BY lp.created_at DESC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT jsonb_build_object(
    'success', TRUE,
    'data', COALESCE(jsonb_agg(row_to_json(ad)::jsonb), '[]'::jsonb),
    'metadata', jsonb_build_object(
      'total_count', (SELECT COUNT(*) FROM admission_data),
      'returned_count', (SELECT COUNT(*) FROM admission_data),
      'filters_applied', jsonb_build_object(
        'status', p_status,
        'department_id', p_department_id,
        'program_id', p_program_id,
        'academic_year', p_academic_year
      )
    )
  )
  FROM admission_data;
END;
$$;

-- 2.4 ai_rpc_admission_details
-- Purpose: Get detailed admission information for a specific learner
CREATE OR REPLACE FUNCTION public.ai_rpc_admission_details(
  p_user_id UUID,
  p_learner_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile RECORD;
  v_institution_id UUID;
BEGIN
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

  v_institution_id := v_profile.institution_id;

  -- Get admission details
  RETURN jsonb_build_object(
    'success', TRUE,
    'data', (
      SELECT jsonb_build_object(
        'id', lp.id,
        'application_id', lp.application_id,
        'personal_info', jsonb_build_object(
          'first_name', lp.first_name,
          'last_name', lp.last_name,
          'date_of_birth', lp.date_of_birth,
          'gender', lp.gender,
          'religion', lp.religion,
          'community', lp.community,
          'caste', lp.caste
        ),
        'contact_info', jsonb_build_object(
          'student_email', lp.student_email,
          'student_mobile', lp.student_mobile,
          'college_email', lp.college_email,
          'father_mobile', lp.father_mobile,
          'mother_mobile', lp.mother_mobile
        ),
        'admission_info', jsonb_build_object(
          'lifecycle_status', lp.lifecycle_status,
          'entry_type', lp.entry_type,
          'quota', lp.quota,
          'category', lp.category,
          'first_graduate', lp.first_graduate,
          'counseling_applied', lp.counseling_applied,
          'scholarship_type', lp.scholarship_type
        ),
        'academic_info', jsonb_build_object(
          'department_name', d.department_name,
          'program_name', pr.program_name,
          'academic_year', lp.academic_year
        ),
        'parent_info', jsonb_build_object(
          'father_name', lp.father_name,
          'mother_name', lp.mother_name
        ),
        'address_info', jsonb_build_object(
          'permanent_address_street', lp.permanent_address_street,
          'permanent_address_district', lp.permanent_address_district,
          'permanent_address_taluk', lp.permanent_address_taluk,
          'permanent_address_state', lp.permanent_address_state,
          'permanent_address_pin_code', lp.permanent_address_pin_code
        ),
        'timestamps', jsonb_build_object(
          'created_at', lp.created_at,
          'updated_at', lp.updated_at
        )
      )
      FROM learners_profiles lp
      LEFT JOIN departments d ON lp.department_id = d.id
      LEFT JOIN programs pr ON lp.program_id = pr.id
      WHERE lp.id = p_learner_id
        AND (v_profile.is_super_admin = TRUE OR lp.institution_id = v_institution_id)
        -- Filter for admission-related statuses only
        AND lp.lifecycle_status IN ('enquiry', 'pending', 'approved', 'rejected', 'waitlisted')
    )
  );
END;
$$;

-- 2.5 ai_rpc_admission_statistics
-- Purpose: Get admission statistics and analytics
CREATE OR REPLACE FUNCTION public.ai_rpc_admission_statistics(
  p_user_id UUID,
  p_academic_year TEXT DEFAULT NULL,
  p_department_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile RECORD;
  v_institution_id UUID;
BEGIN
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

  v_institution_id := v_profile.institution_id;

  -- Build statistics
  RETURN jsonb_build_object(
    'success', TRUE,
    'data', jsonb_build_object(
      'by_status', (
        SELECT jsonb_object_agg(
          lifecycle_status::TEXT,
          count
        )
        FROM (
          SELECT
            lifecycle_status,
            COUNT(*) as count
          FROM learners_profiles
          WHERE institution_id = v_institution_id
            AND lifecycle_status IN ('enquiry', 'pending', 'approved', 'rejected', 'waitlisted')
            AND (p_academic_year IS NULL OR academic_year = p_academic_year)
            AND (p_department_id IS NULL OR department_id = p_department_id)
          GROUP BY lifecycle_status
        ) status_counts
      ),
      'by_entry_type', (
        SELECT jsonb_object_agg(
          entry_type,
          count
        )
        FROM (
          SELECT
            entry_type,
            COUNT(*) as count
          FROM learners_profiles
          WHERE institution_id = v_institution_id
            AND lifecycle_status IN ('enquiry', 'pending', 'approved', 'rejected', 'waitlisted')
            AND (p_academic_year IS NULL OR academic_year = p_academic_year)
            AND (p_department_id IS NULL OR department_id = p_department_id)
          GROUP BY entry_type
        ) entry_counts
      ),
      'by_first_graduate', (
        SELECT jsonb_build_object(
          'first_graduate', COUNT(*) FILTER (WHERE first_graduate = TRUE),
          'not_first_graduate', COUNT(*) FILTER (WHERE first_graduate = FALSE)
        )
        FROM learners_profiles
        WHERE institution_id = v_institution_id
          AND lifecycle_status IN ('enquiry', 'pending', 'approved', 'rejected', 'waitlisted')
          AND (p_academic_year IS NULL OR academic_year = p_academic_year)
          AND (p_department_id IS NULL OR department_id = p_department_id)
      ),
      'by_gender', (
        SELECT jsonb_object_agg(
          gender,
          count
        )
        FROM (
          SELECT
            gender,
            COUNT(*) as count
          FROM learners_profiles
          WHERE institution_id = v_institution_id
            AND lifecycle_status IN ('enquiry', 'pending', 'approved', 'rejected', 'waitlisted')
            AND (p_academic_year IS NULL OR academic_year = p_academic_year)
            AND (p_department_id IS NULL OR department_id = p_department_id)
          GROUP BY gender
        ) gender_counts
      )
    ),
    'metadata', jsonb_build_object(
      'institution_id', v_institution_id,
      'academic_year', p_academic_year,
      'department_id', p_department_id,
      'generated_at', NOW()
    )
  );
END;
$$;

-- 2.6 ai_rpc_admissions_by_location
-- Purpose: Get admissions grouped by location (district/state)
CREATE OR REPLACE FUNCTION public.ai_rpc_admissions_by_location(
  p_user_id UUID,
  p_group_by TEXT DEFAULT 'district', -- 'district', 'state', or 'taluk'
  p_academic_year TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile RECORD;
  v_institution_id UUID;
BEGIN
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

  v_institution_id := v_profile.institution_id;

  -- Group by specified location field
  IF p_group_by = 'district' THEN
    RETURN jsonb_build_object(
      'success', TRUE,
      'data', (
        SELECT jsonb_agg(jsonb_build_object(
          'location', permanent_address_district,
          'count', count,
          'by_status', status_counts
        ))
        FROM (
          SELECT
            permanent_address_district,
            COUNT(*) as count,
            jsonb_object_agg(
              lifecycle_status::TEXT,
              status_count
            ) as status_counts
          FROM (
            SELECT
              permanent_address_district,
              lifecycle_status,
              COUNT(*) as status_count
            FROM learners_profiles
            WHERE institution_id = v_institution_id
              AND lifecycle_status IN ('enquiry', 'pending', 'approved', 'rejected', 'waitlisted')
              AND (p_academic_year IS NULL OR academic_year = p_academic_year)
            GROUP BY permanent_address_district, lifecycle_status
          ) sub
          GROUP BY permanent_address_district
          ORDER BY count DESC
        ) location_counts
      ),
      'metadata', jsonb_build_object(
        'group_by', p_group_by,
        'academic_year', p_academic_year
      )
    );
  ELSIF p_group_by = 'state' THEN
    RETURN jsonb_build_object(
      'success', TRUE,
      'data', (
        SELECT jsonb_agg(jsonb_build_object(
          'location', permanent_address_state,
          'count', count,
          'by_status', status_counts
        ))
        FROM (
          SELECT
            permanent_address_state,
            COUNT(*) as count,
            jsonb_object_agg(
              lifecycle_status::TEXT,
              status_count
            ) as status_counts
          FROM (
            SELECT
              permanent_address_state,
              lifecycle_status,
              COUNT(*) as status_count
            FROM learners_profiles
            WHERE institution_id = v_institution_id
              AND lifecycle_status IN ('enquiry', 'pending', 'approved', 'rejected', 'waitlisted')
              AND (p_academic_year IS NULL OR academic_year = p_academic_year)
            GROUP BY permanent_address_state, lifecycle_status
          ) sub
          GROUP BY permanent_address_state
          ORDER BY count DESC
        ) location_counts
      ),
      'metadata', jsonb_build_object(
        'group_by', p_group_by,
        'academic_year', p_academic_year
      )
    );
  ELSE -- taluk
    RETURN jsonb_build_object(
      'success', TRUE,
      'data', (
        SELECT jsonb_agg(jsonb_build_object(
          'location', permanent_address_taluk,
          'count', count,
          'by_status', status_counts
        ))
        FROM (
          SELECT
            permanent_address_taluk,
            COUNT(*) as count,
            jsonb_object_agg(
              lifecycle_status::TEXT,
              status_count
            ) as status_counts
          FROM (
            SELECT
              permanent_address_taluk,
              lifecycle_status,
              COUNT(*) as status_count
            FROM learners_profiles
            WHERE institution_id = v_institution_id
              AND lifecycle_status IN ('enquiry', 'pending', 'approved', 'rejected', 'waitlisted')
              AND (p_academic_year IS NULL OR academic_year = p_academic_year)
            GROUP BY permanent_address_taluk, lifecycle_status
          ) sub
          GROUP BY permanent_address_taluk
          ORDER BY count DESC
        ) location_counts
      ),
      'metadata', jsonb_build_object(
        'group_by', p_group_by,
        'academic_year', p_academic_year
      )
    );
  END IF;
END;
$$;

-- 2.7 ai_rpc_admission_analytics
-- Purpose: Get comprehensive admission analytics and trends
CREATE OR REPLACE FUNCTION public.ai_rpc_admission_analytics(
  p_user_id UUID,
  p_academic_year TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile RECORD;
  v_institution_id UUID;
  v_total_admissions INTEGER;
  v_approved_count INTEGER;
  v_pending_count INTEGER;
  v_rejected_count INTEGER;
BEGIN
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

  v_institution_id := v_profile.institution_id;

  -- Get counts
  SELECT
    COUNT(*) FILTER (WHERE lifecycle_status IN ('enquiry', 'pending', 'approved', 'rejected', 'waitlisted')),
    COUNT(*) FILTER (WHERE lifecycle_status = 'approved'),
    COUNT(*) FILTER (WHERE lifecycle_status = 'pending'),
    COUNT(*) FILTER (WHERE lifecycle_status = 'rejected')
  INTO
    v_total_admissions,
    v_approved_count,
    v_pending_count,
    v_rejected_count
  FROM learners_profiles
  WHERE institution_id = v_institution_id
    AND (p_academic_year IS NULL OR academic_year = p_academic_year);

  -- Build comprehensive analytics
  RETURN jsonb_build_object(
    'success', TRUE,
    'data', jsonb_build_object(
      'summary', jsonb_build_object(
        'total_applications', v_total_admissions,
        'approved', v_approved_count,
        'pending', v_pending_count,
        'rejected', v_rejected_count,
        'approval_rate', CASE
          WHEN v_total_admissions > 0 THEN ROUND((v_approved_count::NUMERIC / v_total_admissions::NUMERIC) * 100, 2)
          ELSE 0
        END
      ),
      'by_department', (
        SELECT jsonb_agg(jsonb_build_object(
          'department_name', department_name,
          'total', total_count,
          'approved', approved_count,
          'pending', pending_count,
          'rejected', rejected_count
        ))
        FROM (
          SELECT
            d.department_name,
            COUNT(*) as total_count,
            COUNT(*) FILTER (WHERE lp.lifecycle_status = 'approved') as approved_count,
            COUNT(*) FILTER (WHERE lp.lifecycle_status = 'pending') as pending_count,
            COUNT(*) FILTER (WHERE lp.lifecycle_status = 'rejected') as rejected_count
          FROM learners_profiles lp
          LEFT JOIN departments d ON lp.department_id = d.id
          WHERE lp.institution_id = v_institution_id
            AND lp.lifecycle_status IN ('enquiry', 'pending', 'approved', 'rejected', 'waitlisted')
            AND (p_academic_year IS NULL OR lp.academic_year = p_academic_year)
          GROUP BY d.department_name
          ORDER BY total_count DESC
        ) dept_stats
      ),
      'by_program', (
        SELECT jsonb_agg(jsonb_build_object(
          'program_name', program_name,
          'total', total_count,
          'approved', approved_count
        ))
        FROM (
          SELECT
            pr.program_name,
            COUNT(*) as total_count,
            COUNT(*) FILTER (WHERE lp.lifecycle_status = 'approved') as approved_count
          FROM learners_profiles lp
          LEFT JOIN programs pr ON lp.program_id = pr.id
          WHERE lp.institution_id = v_institution_id
            AND lp.lifecycle_status IN ('enquiry', 'pending', 'approved', 'rejected', 'waitlisted')
            AND (p_academic_year IS NULL OR lp.academic_year = p_academic_year)
          GROUP BY pr.program_name
          ORDER BY total_count DESC
        ) program_stats
      ),
      'demographics', jsonb_build_object(
        'by_gender', (
          SELECT jsonb_object_agg(gender, count)
          FROM (
            SELECT gender, COUNT(*) as count
            FROM learners_profiles
            WHERE institution_id = v_institution_id
              AND lifecycle_status IN ('enquiry', 'pending', 'approved', 'rejected', 'waitlisted')
              AND (p_academic_year IS NULL OR academic_year = p_academic_year)
            GROUP BY gender
          ) gender_stats
        ),
        'first_graduate_percentage', (
          SELECT ROUND(
            (COUNT(*) FILTER (WHERE first_graduate = TRUE)::NUMERIC /
             NULLIF(COUNT(*)::NUMERIC, 0)) * 100,
            2
          )
          FROM learners_profiles
          WHERE institution_id = v_institution_id
            AND lifecycle_status IN ('enquiry', 'pending', 'approved', 'rejected', 'waitlisted')
            AND (p_academic_year IS NULL OR academic_year = p_academic_year)
        )
      )
    ),
    'metadata', jsonb_build_object(
      'institution_id', v_institution_id,
      'academic_year', p_academic_year,
      'generated_at', NOW()
    )
  );
END;
$$;

-- 2.8 ai_rpc_admission_referrers
-- Purpose: Get admission referrer/source analysis (if referral data exists)
CREATE OR REPLACE FUNCTION public.ai_rpc_admission_referrers(
  p_user_id UUID,
  p_academic_year TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile RECORD;
  v_institution_id UUID;
BEGIN
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

  v_institution_id := v_profile.institution_id;

  -- Note: This is a placeholder function
  -- Add referrer tracking fields to learners_profiles table if needed
  -- For now, return entry_type distribution as proxy for source
  RETURN jsonb_build_object(
    'success', TRUE,
    'data', jsonb_build_object(
      'by_entry_type', (
        SELECT jsonb_agg(jsonb_build_object(
          'entry_type', entry_type,
          'count', count,
          'percentage', ROUND((count::NUMERIC / NULLIF(total_count::NUMERIC, 0)) * 100, 2)
        ))
        FROM (
          SELECT
            entry_type,
            COUNT(*) as count,
            SUM(COUNT(*)) OVER () as total_count
          FROM learners_profiles
          WHERE institution_id = v_institution_id
            AND lifecycle_status IN ('enquiry', 'pending', 'approved', 'rejected', 'waitlisted')
            AND (p_academic_year IS NULL OR academic_year = p_academic_year)
          GROUP BY entry_type
          ORDER BY count DESC
        ) entry_stats
      ),
      'by_counseling', jsonb_build_object(
        'counseling_applied', (
          SELECT COUNT(*) FROM learners_profiles
          WHERE institution_id = v_institution_id
            AND lifecycle_status IN ('enquiry', 'pending', 'approved', 'rejected', 'waitlisted')
            AND counseling_applied = TRUE
            AND (p_academic_year IS NULL OR academic_year = p_academic_year)
        ),
        'direct_admission', (
          SELECT COUNT(*) FROM learners_profiles
          WHERE institution_id = v_institution_id
            AND lifecycle_status IN ('enquiry', 'pending', 'approved', 'rejected', 'waitlisted')
            AND counseling_applied = FALSE
            AND (p_academic_year IS NULL OR academic_year = p_academic_year)
        )
      )
    ),
    'metadata', jsonb_build_object(
      'institution_id', v_institution_id,
      'academic_year', p_academic_year,
      'generated_at', NOW(),
      'note', 'Entry type used as proxy for referrer source. Add referrer_source field to learners_profiles for detailed tracking.'
    )
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.ai_rpc_student_search TO authenticated;
GRANT EXECUTE ON FUNCTION public.ai_rpc_hierarchy_summary TO authenticated;
GRANT EXECUTE ON FUNCTION public.ai_rpc_kpi_summary TO authenticated;
GRANT EXECUTE ON FUNCTION public.ai_rpc_admissions TO authenticated;
GRANT EXECUTE ON FUNCTION public.ai_rpc_admission_details TO authenticated;
GRANT EXECUTE ON FUNCTION public.ai_rpc_admission_statistics TO authenticated;
GRANT EXECUTE ON FUNCTION public.ai_rpc_admissions_by_location TO authenticated;
GRANT EXECUTE ON FUNCTION public.ai_rpc_admission_analytics TO authenticated;
GRANT EXECUTE ON FUNCTION public.ai_rpc_admission_referrers TO authenticated;

-- ============================================
-- Migration complete
-- ============================================
-- Next steps:
-- 1. Test admission queries with lifecycle_status filtering
-- 2. Implement remaining RPC functions (admission_analytics, admissions_by_location, etc.)
-- 3. Update AI Query service documentation
-- ============================================
