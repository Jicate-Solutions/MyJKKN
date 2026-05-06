-- ============================================================================
-- 20260507100014 — Drop redundant `learners_profiles.category` column.
-- ----------------------------------------------------------------------------
-- Rationale (verified in transcript 2026-05-07):
--   - 4,924 rows analysed: only 1 row has `category` set without `community`;
--     1,139 are exact duplicates of `community`; 256 disagree but are dirty
--     (quota leakage like 'PMSS', 'STATE QUOTA', '7.5'; variant spellings of
--     SC/SCA; or generic 'GENERAL' placeholders).
--   - The fee-structure matrix uses `community_category_id` (FK derived from
--     the `community` TEXT column), not `category`. Removing `category` does
--     not affect fee resolution or any RLS policy.
--   - No FK / view / trigger / RLS policy / RPC besides ai_rpc_admissions
--     references this column (verified via pg_depend + information_schema).
--
-- Order of operations:
--   1) Audit-trail snapshot of every distinct (category, community) pair into
--      data_quality_review so the dropped data has a permanent paper trail.
--   2) DROP + CREATE ai_rpc_admissions without the p_category param and
--      without the lp.category SELECT projection.
--   3) ALTER TABLE ... DROP COLUMN category.
-- ============================================================================

-- ───────────────────── Step 1: Snapshot to data_quality_review ─────────────────────

INSERT INTO public.data_quality_review (
    table_name, column_name, observed_value, occurrence_count, review_status, review_notes
)
SELECT
    'learners_profiles',
    'category',
    UPPER(TRIM(category)),
    COUNT(*),
    'ignored',
    'Column dropped 2026-05-07 — redundant with community. ' ||
    'Paired community values for these rows: ' ||
    string_agg(DISTINCT COALESCE(NULLIF(UPPER(TRIM(community)), ''), '<empty>'), ', ' ORDER BY COALESCE(NULLIF(UPPER(TRIM(community)), ''), '<empty>'))
  FROM public.learners_profiles
 WHERE category IS NOT NULL AND TRIM(category) <> ''
 GROUP BY UPPER(TRIM(category))
ON CONFLICT (table_name, column_name, observed_value) DO UPDATE
   SET review_status    = EXCLUDED.review_status,
       review_notes     = EXCLUDED.review_notes,
       occurrence_count = EXCLUDED.occurrence_count,
       updated_at       = now();

-- ───────────────────── Step 2: Replace ai_rpc_admissions ─────────────────────
-- Cannot CREATE OR REPLACE here — parameter list changes are not allowed
-- under REPLACE. DROP then CREATE.

DROP FUNCTION IF EXISTS public.ai_rpc_admissions(
    uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, text, text,
    boolean, boolean, text, text, text, boolean, text, text, text, boolean
);

CREATE FUNCTION public.ai_rpc_admissions(
    p_user_id uuid,
    p_institution_id uuid DEFAULT NULL::uuid,
    p_department_id uuid DEFAULT NULL::uuid,
    p_program_id uuid DEFAULT NULL::uuid,
    p_degree_id uuid DEFAULT NULL::uuid,
    p_status text DEFAULT NULL::text,
    p_entry_type text DEFAULT NULL::text,
    p_district text DEFAULT NULL::text,
    p_state text DEFAULT NULL::text,
    p_gender text DEFAULT NULL::text,
    p_religion text DEFAULT NULL::text,
    p_community text DEFAULT NULL::text,
    p_counseling_applied boolean DEFAULT NULL::boolean,
    p_first_graduate boolean DEFAULT NULL::boolean,
    p_quota text DEFAULT NULL::text,
    p_accommodation_type text DEFAULT NULL::text,
    p_bus_required boolean DEFAULT NULL::boolean,
    p_search text DEFAULT NULL::text,
    p_date_from text DEFAULT NULL::text,
    p_date_to text DEFAULT NULL::text,
    p_include_stats boolean DEFAULT true
)
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
        lp.quota,
        lp.student_email,
        lp.student_mobile,
        lp.father_name,
        lp.father_mobile,
        lp.mother_name,
        lp.mother_mobile,
        lp.permanent_address_street,
        lp.permanent_address_taluk,
        lp.permanent_address_district,
        lp.permanent_address_city,
        lp.permanent_address_state,
        lp.permanent_address_pin_code,
        lp.entry_type,
        lp.accommodation_type,
        lp.bus_required,
        lp.counseling_applied,
        lp.tenth_marks,
        lp.twelfth_marks,
        lp.neet_score,
        lp.neet_cutoff,
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
        AND (p_quota              IS NULL OR lp.quota                       ILIKE p_quota)
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

-- ───────────────────── Step 3: Drop the column ─────────────────────

ALTER TABLE public.learners_profiles DROP COLUMN category;
