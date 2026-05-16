-- =============================================================================
-- fn_geography_analytics — AY-scoped geographic distribution
-- Date: 2026-04-28
-- =============================================================================
-- Replaces legacy get_geography_analytics(uuid, uuid):
--   - takes p_admission_year integer instead of academic_year_id UUID (which
--     was 0.05% populated for active learners in production)
--   - takes p_institution_ids uuid[] for super-admin all-access path
--   - enforces role_has_institution_access() per row
--   - normalizes state/district/taluk via INITCAP+TRIM+collapsed-whitespace
--     (collapses "TAMILNADU"/"TAMIL NADU"/"Tamil Nadu" into one bucket)
--   - uses COUNT(DISTINCT learner_id) (legacy used COUNT(*) which double-counted
--     learners with multiple profile rows)
--   - widens lifecycle filter to ('admitted','active','graduated') for parity
--     with fn_seat_analytics_daily_pivot
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_geography_analytics(
  p_institution_ids uuid[],
  p_admission_year  integer DEFAULT NULL
)
RETURNS TABLE (
  institution_id    uuid,
  institution_name  text,
  state             text,
  district          text,
  taluk             text,
  active_learners   bigint
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
  normalized AS (
    SELECT
      lp.id                                                                AS learner_id,
      lp.institution_id,
      INITCAP(NULLIF(TRIM(REGEXP_REPLACE(COALESCE(lp.permanent_address_state,    ''), '\s+', ' ', 'g')), '')) AS state_norm,
      INITCAP(NULLIF(TRIM(REGEXP_REPLACE(COALESCE(lp.permanent_address_district, ''), '\s+', ' ', 'g')), '')) AS district_norm,
      INITCAP(NULLIF(TRIM(REGEXP_REPLACE(COALESCE(lp.permanent_address_taluk,    ''), '\s+', ' ', 'g')), '')) AS taluk_norm
    FROM learners_profiles lp
    WHERE lp.institution_id IS NOT NULL
      AND lp.institution_id IN (SELECT id FROM eligible_institutions)
      AND lp.lifecycle_status::text IN ('admitted','active','graduated')
      AND lp.permanent_address_district IS NOT NULL
      AND TRIM(lp.permanent_address_district) <> ''
      AND (p_admission_year IS NULL OR lp.admission_year = p_admission_year)
  )
  SELECT
    n.institution_id,
    i.name::text                       AS institution_name,
    n.state_norm                       AS state,
    n.district_norm                    AS district,
    n.taluk_norm                       AS taluk,
    COUNT(DISTINCT n.learner_id)::bigint AS active_learners
  FROM normalized n
  JOIN institutions i ON i.id = n.institution_id
  GROUP BY n.institution_id, i.name, n.state_norm, n.district_norm, n.taluk_norm
  HAVING COUNT(DISTINCT n.learner_id) > 0
  ORDER BY i.name, n.state_norm, n.district_norm, n.taluk_norm;
$$;

COMMENT ON FUNCTION public.fn_geography_analytics(uuid[], integer) IS
  'AY-scoped geographic distribution for the Group Dashboard Geography tab. Normalizes state/district/taluk. Counts DISTINCT learners with lifecycle_status IN (admitted, active, graduated). SECURITY DEFINER + role_has_institution_access enforcement.';

GRANT EXECUTE ON FUNCTION public.fn_geography_analytics(uuid[], integer) TO authenticated, service_role;
