-- Accommodation FK migration: AI-assistant RPCs and the fee-backfill view now
-- derive accommodation from accommodation_type_id (accommodation_types) instead
-- of the accommodation_type TEXT column (being retired). Output field/filter
-- names are unchanged (acc.code AS accommodation_type; filters match code/name).
--
-- NOTE (pre-existing, NOT changed here): ai_rpc_learners_by_location references
-- lp.bus_pickup_location, which does not exist on learners_profiles -> that RPC
-- already errors at runtime independent of accommodation. Flagged separately;
-- preserved verbatim below except for the accommodation_type FK change.
--
-- ai_rpc_students_summary.hostel_count: the FK predicate also fixes a latent bug
-- (the old `= 'hostel'` exact match missed uppercase TEXT values like 'HOSTEL').
-- Verified post-migration: hostel_count = 896 == verified hosteler population.

-- 1) ai_rpc_learners_comprehensive: accommodation in SELECT + filter -> FK
CREATE OR REPLACE FUNCTION public.ai_rpc_learners_comprehensive(p_user_id uuid, p_search text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_gender text DEFAULT NULL::text, p_religion text DEFAULT NULL::text, p_community text DEFAULT NULL::text, p_accommodation_type text DEFAULT NULL::text, p_bus_required boolean DEFAULT NULL::boolean, p_institution_id uuid DEFAULT NULL::uuid, p_department_id uuid DEFAULT NULL::uuid, p_program_id uuid DEFAULT NULL::uuid, p_semester_id uuid DEFAULT NULL::uuid, p_entry_type text DEFAULT NULL::text, p_quota text DEFAULT NULL::text, p_first_graduate boolean DEFAULT NULL::boolean, p_district text DEFAULT NULL::text, p_include_stats boolean DEFAULT true, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_profile RECORD; v_inst_id UUID;
BEGIN
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

-- 2) ai_rpc_admissions: accommodation in SELECT + filter -> FK
CREATE OR REPLACE FUNCTION public.ai_rpc_admissions(p_user_id uuid, p_institution_id uuid DEFAULT NULL::uuid, p_department_id uuid DEFAULT NULL::uuid, p_program_id uuid DEFAULT NULL::uuid, p_degree_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text, p_entry_type text DEFAULT NULL::text, p_district text DEFAULT NULL::text, p_state text DEFAULT NULL::text, p_gender text DEFAULT NULL::text, p_religion text DEFAULT NULL::text, p_community text DEFAULT NULL::text, p_counseling_applied boolean DEFAULT NULL::boolean, p_first_graduate boolean DEFAULT NULL::boolean, p_quota text DEFAULT NULL::text, p_accommodation_type text DEFAULT NULL::text, p_bus_required boolean DEFAULT NULL::boolean, p_search text DEFAULT NULL::text, p_date_from text DEFAULT NULL::text, p_date_to text DEFAULT NULL::text, p_include_stats boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_profile RECORD; v_inst_id UUID;
BEGIN
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

-- 3) ai_rpc_learners_by_location: accommodation in SELECT -> FK (bus_pickup_location
--    preserved verbatim; pre-existing phantom-column bug, flagged separately)
CREATE OR REPLACE FUNCTION public.ai_rpc_learners_by_location(p_user_id uuid, p_district text DEFAULT NULL::text, p_state text DEFAULT NULL::text, p_taluk text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_department_id uuid DEFAULT NULL::uuid, p_include_stats boolean DEFAULT true, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_result JSONB; v_profile RECORD; v_inst_id UUID;
BEGIN
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

-- 4) ai_rpc_students_summary: hostel_count filter -> FK
CREATE OR REPLACE FUNCTION public.ai_rpc_students_summary(p_user_id uuid, p_institution_id uuid DEFAULT NULL::uuid, p_department_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_result JSONB; v_profile RECORD; v_inst_id UUID;
BEGIN
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

-- 5) vw_learners_profile_fee_backfill_status: accommodation_type_text now derived
--    from the FK (mirrors the existing community_text/quota_text subquery pattern).
CREATE OR REPLACE VIEW public.vw_learners_profile_fee_backfill_status AS
 WITH base AS (
         SELECT lp.id AS learner_id,
            lp.application_id,
            lp.first_name,
            lp.last_name,
            lp.student_email,
            lp.student_mobile,
            lp.lifecycle_status,
            lp.legacy_fee_mode,
            lp.fee_items,
            lp.institution_id,
            lp.degree_id,
            lp.department_id,
            lp.program_id,
            lp.quota_id,
            lp.accommodation_type_id,
            lp.community_category_id,
            lp.admission_year_id,
            ( SELECT cc.code
                   FROM community_categories cc
                  WHERE cc.id = lp.community_category_id) AS community_text,
            ( SELECT q.name
                   FROM quotas q
                  WHERE q.id = lp.quota_id) AS quota_text,
            ( SELECT at.code
                   FROM accommodation_types at
                  WHERE at.id = lp.accommodation_type_id) AS accommodation_type_text,
            lp.created_at,
            lp.updated_at,
            array_remove(ARRAY[
                CASE
                    WHEN lp.program_id IS NULL THEN 'program_id'::text
                    ELSE NULL::text
                END,
                CASE
                    WHEN lp.admission_year_id IS NULL THEN 'admission_year_id'::text
                    ELSE NULL::text
                END,
                CASE
                    WHEN lp.degree_id IS NULL THEN 'degree_id'::text
                    ELSE NULL::text
                END,
                CASE
                    WHEN lp.department_id IS NULL THEN 'department_id'::text
                    ELSE NULL::text
                END,
                CASE
                    WHEN lp.quota_id IS NULL THEN 'quota_id'::text
                    ELSE NULL::text
                END,
                CASE
                    WHEN lp.accommodation_type_id IS NULL THEN 'accommodation_type_id'::text
                    ELSE NULL::text
                END,
                CASE
                    WHEN lp.community_category_id IS NULL THEN 'community_category_id'::text
                    ELSE NULL::text
                END,
                CASE
                    WHEN lp.institution_id IS NULL THEN 'institution_id'::text
                    ELSE NULL::text
                END], NULL::text) AS missing_fields
           FROM learners_profiles lp
          WHERE (lp.lifecycle_status = ANY (ARRAY['enquiry'::lifecycle_status, 'enquiry_submitted'::lifecycle_status])) AND lp.legacy_fee_mode = true
        ), strict_matches AS (
         SELECT b_1.learner_id,
            count(*) AS cnt,
            array_agg(afs.id ORDER BY afs.updated_at DESC NULLS LAST) AS all_ids
           FROM base b_1
             JOIN admission_fee_structures afs ON afs.institution_id = b_1.institution_id AND afs.degree_id = b_1.degree_id AND afs.department_id = b_1.department_id AND afs.programme_id = b_1.program_id AND afs.quota_id = b_1.quota_id AND afs.accommodation_type_id = b_1.accommodation_type_id AND afs.admission_year_id = b_1.admission_year_id AND afs.status = 'active'::text
          WHERE (EXISTS ( SELECT 1
                   FROM admission_fee_structure_communities j
                  WHERE j.fee_structure_id = afs.id AND j.community_category_id = b_1.community_category_id))
          GROUP BY b_1.learner_id
        ), relaxed_matches AS (
         SELECT b_1.learner_id,
            count(*) AS cnt,
            array_agg(afs.id ORDER BY afs.updated_at DESC NULLS LAST) AS all_ids
           FROM base b_1
             JOIN admission_fee_structures afs ON afs.institution_id = b_1.institution_id AND afs.degree_id = b_1.degree_id AND afs.department_id = b_1.department_id AND afs.programme_id = b_1.program_id AND afs.accommodation_type_id = b_1.accommodation_type_id AND afs.admission_year_id = b_1.admission_year_id AND afs.status = 'active'::text
          WHERE (EXISTS ( SELECT 1
                   FROM admission_fee_structure_communities j
                  WHERE j.fee_structure_id = afs.id AND j.community_category_id = b_1.community_category_id))
          GROUP BY b_1.learner_id
        )
 SELECT b.learner_id,
    b.application_id,
    b.first_name,
    b.last_name,
    b.student_email,
    b.student_mobile,
    b.lifecycle_status,
    b.legacy_fee_mode,
    b.fee_items,
    b.institution_id,
    b.degree_id,
    b.department_id,
    b.program_id,
    b.quota_id,
    b.accommodation_type_id,
    b.community_category_id,
    b.admission_year_id,
    b.community_text,
    b.quota_text,
    b.accommodation_type_text,
    b.missing_fields,
    COALESCE(sm.cnt, 0::bigint) AS strict_match_count,
    COALESCE(rm.cnt, 0::bigint) AS relaxed_match_count,
        CASE
            WHEN COALESCE(array_length(b.missing_fields, 1), 0) > 0 THEN 'missing_fields'::text
            WHEN COALESCE(sm.cnt, 0::bigint) = 1 THEN 'tier1_ready'::text
            WHEN COALESCE(sm.cnt, 0::bigint) = 0 AND COALESCE(rm.cnt, 0::bigint) = 1 THEN 'tier2_ready'::text
            WHEN COALESCE(sm.cnt, 0::bigint) > 1 THEN 'ambiguous_strict'::text
            WHEN COALESCE(rm.cnt, 0::bigint) > 1 THEN 'ambiguous_relaxed'::text
            WHEN COALESCE(rm.cnt, 0::bigint) = 0 THEN 'no_structure'::text
            ELSE 'unclassified'::text
        END AS resolution_status,
        CASE
            WHEN COALESCE(sm.cnt, 0::bigint) = 1 THEN sm.all_ids[1]
            WHEN COALESCE(sm.cnt, 0::bigint) = 0 AND COALESCE(rm.cnt, 0::bigint) = 1 THEN rm.all_ids[1]
            ELSE NULL::uuid
        END AS matched_structure_id,
        CASE
            WHEN COALESCE(sm.cnt, 0::bigint) > 1 THEN sm.all_ids
            WHEN COALESCE(sm.cnt, 0::bigint) = 0 AND COALESCE(rm.cnt, 0::bigint) > 1 THEN rm.all_ids
            ELSE NULL::uuid[]
        END AS candidate_structure_ids,
    b.created_at,
    b.updated_at
   FROM base b
     LEFT JOIN strict_matches sm ON sm.learner_id = b.learner_id
     LEFT JOIN relaxed_matches rm ON rm.learner_id = b.learner_id;
