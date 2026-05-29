-- =============================================================================
-- fn_geography_analytics — switch to LEAD-based geography (prospect catchment)
-- Date: 2026-05-29
-- =============================================================================
-- CHANGE (product decision): the Geography tab should reflect where the LEADS
-- (prospective students) come from, not just the small admitted-or-beyond
-- learner set. admission_leads carries state/district/city on ~87% of rows
-- (16,763 of 19,245); learners_profiles at filled stage was only ~464 for AY
-- 2026, which read as "wrong / too few".
--
-- Now counts DISTINCT admission_leads by normalized state/district/city. Lead
-- dedup guarantees one row per person, so DISTINCT al.id is exact. Cohort scope
-- respects the selected year via COALESCE(profile.admission_year_id,
-- lead.admission_year_id) — a 2026-linked lead counts even when the lead's own
-- admission_year_id is NULL (true for most leads).
--
-- Column shape is UNCHANGED so the frontend type/service need no edit:
--   * `taluk` now carries the lead's CITY (leads have no taluk column); the UI
--     relabels this column to "City".
--   * `active_learners` now carries the LEAD COUNT (name kept to avoid a
--     return-shape change / DROP FUNCTION); the UI relabels the card to "Leads".
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
  taluk             text,    -- carries lead CITY (leads have no taluk)
  active_learners   bigint   -- carries LEAD COUNT (name retained for frontend stability)
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
    WHERE p_admission_year IS NOT NULL AND program_start_year = p_admission_year
  ),
  normalized AS (
    SELECT
      al.id                                                                AS lead_id,
      al.institution_id,
      INITCAP(NULLIF(TRIM(REGEXP_REPLACE(COALESCE(al.state,    ''), '\s+', ' ', 'g')), '')) AS state_norm,
      INITCAP(NULLIF(TRIM(REGEXP_REPLACE(COALESCE(al.district, ''), '\s+', ' ', 'g')), '')) AS district_norm,
      INITCAP(NULLIF(TRIM(REGEXP_REPLACE(COALESCE(al.city,     ''), '\s+', ' ', 'g')), '')) AS city_norm
    FROM admission_leads al
    LEFT JOIN learners_profiles lp ON lp.id = al.learner_profile_id
    WHERE al.institution_id IS NOT NULL
      AND al.institution_id IN (SELECT id FROM eligible_institutions)
      AND al.district IS NOT NULL
      AND TRIM(al.district) <> ''
      AND (
        p_admission_year IS NULL
        OR COALESCE(lp.admission_year_id, al.admission_year_id) IN (SELECT id FROM cohort_ay_ids)
      )
  )
  SELECT
    n.institution_id,
    i.name::text                       AS institution_name,
    n.state_norm                       AS state,
    n.district_norm                    AS district,
    n.city_norm                        AS taluk,
    COUNT(DISTINCT n.lead_id)::bigint  AS active_learners
  FROM normalized n
  JOIN institutions i ON i.id = n.institution_id
  GROUP BY n.institution_id, i.name, n.state_norm, n.district_norm, n.city_norm
  HAVING COUNT(DISTINCT n.lead_id) > 0
  ORDER BY i.name, n.state_norm, n.district_norm, n.city_norm;
$$;

GRANT EXECUTE ON FUNCTION public.fn_geography_analytics(uuid[], integer) TO authenticated, service_role;
