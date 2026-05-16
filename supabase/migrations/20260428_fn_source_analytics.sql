-- =============================================================================
-- fn_source_analytics — AY-scoped, institution-scoped source breakdown
-- Date: 2026-04-28
-- =============================================================================
-- Returns per (institution, source, referral_type) row:
--   - lead_count:     COUNT(admission_leads) for that source — 100% coverage
--   - enrolled_count: COUNT of those leads whose linked learner_profile is in
--                     ('admitted','active','graduated') status. Limited by the
--                     sparse al.learner_profile_id FK (~1.5% coverage today);
--                     the UI surfaces this as "limited attribution".
--   - conversion_rate: enrolled_count / lead_count
--
-- Replaces legacy get_source_analytics(uuid, uuid):
--   - takes p_admission_year integer (cohort year) instead of academic_year_id UUID
--   - removes OR lp.id IS NULL escape that bypassed the year filter
--   - adds role_has_institution_access() enforcement
--   - takes p_institution_ids uuid[] for super-admin path consistency
--
-- Pattern matches fn_seat_analytics_daily_pivot.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_source_analytics(
  p_institution_ids uuid[],
  p_admission_year  integer DEFAULT NULL
)
RETURNS TABLE (
  institution_id    uuid,
  institution_name  text,
  source            text,
  referral_type     text,
  lead_count        integer,
  enrolled_count    integer,
  conversion_rate   numeric,
  last_enrolled_at  timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH eligible_institutions AS (
    SELECT id FROM institutions
    WHERE id = ANY(p_institution_ids) AND role_has_institution_access(id)
  ),
  cohort_ay_ids AS (
    SELECT id FROM admission_years
    WHERE p_admission_year IS NOT NULL
      AND program_start_year = p_admission_year
      AND is_active = true
  ),
  scoped_leads AS (
    SELECT
      al.id,
      al.institution_id,
      al.source::text                                  AS source,
      COALESCE(NULLIF(TRIM(al.referral_type), ''), '') AS referral_type,
      al.learner_profile_id
    FROM admission_leads al
    WHERE al.institution_id IN (SELECT id FROM eligible_institutions)
      AND (
        p_admission_year IS NULL
        OR al.admission_year_id IN (SELECT id FROM cohort_ay_ids)
        OR (al.admission_year_id IS NULL
            AND EXTRACT(year FROM al.created_at)::int = p_admission_year)
      )
  ),
  per_lead_status AS (
    SELECT
      sl.id,
      sl.institution_id,
      sl.source,
      sl.referral_type,
      lp.lifecycle_status::text AS lp_status,
      lp.activated_at
    FROM scoped_leads sl
    LEFT JOIN learners_profiles lp ON lp.id = sl.learner_profile_id
    WHERE sl.learner_profile_id IS NULL
       OR p_admission_year IS NULL
       OR lp.admission_year = p_admission_year
       OR lp.admission_year IS NULL
  )
  SELECT
    pls.institution_id,
    i.name::text                                                    AS institution_name,
    pls.source,
    pls.referral_type,
    COUNT(*)::int                                                   AS lead_count,
    COUNT(*) FILTER (WHERE pls.lp_status IN ('admitted','active','graduated'))::int AS enrolled_count,
    CASE WHEN COUNT(*) = 0 THEN 0::numeric
         ELSE ROUND(
           COUNT(*) FILTER (WHERE pls.lp_status IN ('admitted','active','graduated'))::numeric
             / COUNT(*)::numeric * 100, 2)
    END                                                             AS conversion_rate,
    MAX(pls.activated_at) FILTER (WHERE pls.lp_status IN ('admitted','active','graduated'))
                                                                    AS last_enrolled_at
  FROM per_lead_status pls
  JOIN institutions i ON i.id = pls.institution_id
  GROUP BY pls.institution_id, i.name, pls.source, pls.referral_type
  ORDER BY i.name, pls.source, pls.referral_type;
$$;

COMMENT ON FUNCTION public.fn_source_analytics(uuid[], integer) IS
  'AY-scoped source breakdown for the Source Analytics tab. p_admission_year is cohort year integer. enrolled_count limited by sparse learner_profile_id FK. SECURITY DEFINER + role_has_institution_access enforcement.';

GRANT EXECUTE ON FUNCTION public.fn_source_analytics(uuid[], integer) TO authenticated, service_role;
