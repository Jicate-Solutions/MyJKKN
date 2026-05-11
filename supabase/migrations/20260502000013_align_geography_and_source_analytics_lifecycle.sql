-- Migration: 2026-05-02
-- Phase C-10: Align Geography and Source Analytics tabs with the dashboard-
-- wide "filled" lifecycle set so all tabs report consistent cohort counts.
--
-- Before this migration:
--   * Top cards / Seat Analytics / Comparison "filled" = admitted+active+
--     graduated+account → 183 for 2026.
--   * Geography "active_learners" = admitted+active+graduated → 13 for 2026.
--   * Source Analytics "enrolled_count" = admitted+active+graduated → 8 for
--     2026 (further reduced by sparse al.learner_profile_id link).
--
-- After: all four tabs use {admitted,active,graduated,account} so the same
-- cohort produces the same headline number everywhere.
--
-- Note: Source Analytics enrolled_count remains constrained by which leads
-- have al.learner_profile_id populated (~1.5% coverage) — this migration only
-- changes the lifecycle filter, not the FK coverage.

-- =============================================================================
-- fn_geography_analytics
-- =============================================================================
DROP FUNCTION IF EXISTS public.fn_geography_analytics(uuid[], integer);

CREATE OR REPLACE FUNCTION public.fn_geography_analytics(
  p_institution_ids uuid[],
  p_admission_year  integer DEFAULT NULL
)
RETURNS TABLE(
  institution_id   uuid,
  institution_name text,
  state            text,
  district         text,
  taluk            text,
  active_learners  bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $function$
  WITH eligible_institutions AS (
    SELECT id FROM institutions
    WHERE id = ANY(p_institution_ids) AND role_has_institution_access(id)
  ),
  cohort_ay_ids AS (
    SELECT id FROM admission_years
    WHERE p_admission_year IS NOT NULL AND program_start_year = p_admission_year
  ),
  normalized AS (
    SELECT
      lp.id AS learner_id,
      lp.institution_id,
      INITCAP(NULLIF(TRIM(REGEXP_REPLACE(COALESCE(lp.permanent_address_state,    ''), '\s+', ' ', 'g')), '')) AS state_norm,
      INITCAP(NULLIF(TRIM(REGEXP_REPLACE(COALESCE(lp.permanent_address_district, ''), '\s+', ' ', 'g')), '')) AS district_norm,
      INITCAP(NULLIF(TRIM(REGEXP_REPLACE(COALESCE(lp.permanent_address_taluk,    ''), '\s+', ' ', 'g')), '')) AS taluk_norm
    FROM learners_profiles lp
    WHERE lp.institution_id IS NOT NULL
      AND lp.institution_id IN (SELECT id FROM eligible_institutions)
      AND lp.lifecycle_status::text IN ('admitted','active','graduated','account')
      AND lp.permanent_address_district IS NOT NULL
      AND TRIM(lp.permanent_address_district) <> ''
      AND (p_admission_year IS NULL OR lp.admission_year_id IN (SELECT id FROM cohort_ay_ids))
  )
  SELECT
    n.institution_id, i.name::text, n.state_norm, n.district_norm, n.taluk_norm,
    COUNT(DISTINCT n.learner_id)::bigint
  FROM normalized n JOIN institutions i ON i.id = n.institution_id
  GROUP BY n.institution_id, i.name, n.state_norm, n.district_norm, n.taluk_norm
  HAVING COUNT(DISTINCT n.learner_id) > 0
  ORDER BY i.name, n.state_norm, n.district_norm, n.taluk_norm;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_geography_analytics(uuid[], integer) TO authenticated;

-- =============================================================================
-- fn_source_analytics
-- =============================================================================
DROP FUNCTION IF EXISTS public.fn_source_analytics(uuid[], integer);

CREATE OR REPLACE FUNCTION public.fn_source_analytics(
  p_institution_ids uuid[],
  p_admission_year  integer DEFAULT NULL
)
RETURNS TABLE(
  institution_id    uuid, institution_name text,
  source text, referral_type text,
  lead_count integer, enrolled_count integer, conversion_rate numeric,
  last_enrolled_at  timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $function$
  WITH eligible_institutions AS (
    SELECT id FROM institutions
    WHERE id = ANY(p_institution_ids) AND role_has_institution_access(id)
  ),
  cohort_ay_ids AS (
    SELECT id FROM admission_years
    WHERE p_admission_year IS NOT NULL AND program_start_year = p_admission_year
  ),
  scoped_leads AS (
    SELECT al.id, al.institution_id, al.source::text AS source,
           COALESCE(NULLIF(TRIM(al.referral_type), ''), '') AS referral_type,
           al.learner_profile_id
    FROM admission_leads al
    WHERE al.institution_id IN (SELECT id FROM eligible_institutions)
      AND (p_admission_year IS NULL OR al.admission_year_id IN (SELECT id FROM cohort_ay_ids))
  ),
  per_lead_status AS (
    SELECT sl.id, sl.institution_id, sl.source, sl.referral_type,
           lp.lifecycle_status::text AS lp_status, lp.activated_at
    FROM scoped_leads sl
    LEFT JOIN learners_profiles lp ON lp.id = sl.learner_profile_id
    WHERE sl.learner_profile_id IS NULL
       OR p_admission_year IS NULL
       OR lp.admission_year_id IN (SELECT id FROM cohort_ay_ids)
       OR lp.admission_year_id IS NULL
  )
  SELECT pls.institution_id, i.name::text, pls.source, pls.referral_type,
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE pls.lp_status IN ('admitted','active','graduated','account'))::int,
    CASE WHEN COUNT(*) = 0 THEN 0::numeric
         ELSE ROUND(COUNT(*) FILTER (WHERE pls.lp_status IN ('admitted','active','graduated','account'))::numeric
                    / COUNT(*)::numeric * 100, 2) END,
    MAX(pls.activated_at) FILTER (WHERE pls.lp_status IN ('admitted','active','graduated','account'))
  FROM per_lead_status pls JOIN institutions i ON i.id = pls.institution_id
  GROUP BY pls.institution_id, i.name, pls.source, pls.referral_type
  ORDER BY i.name, pls.source, pls.referral_type;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_source_analytics(uuid[], integer) TO authenticated;
