-- =============================================================================
-- fn_source_analytics — fix Admitted Matrix undercount (cohort via profile AY)
-- Date: 2026-05-29
-- =============================================================================
-- BUG: The Source Analytics tab's "Admitted Matrix: Institution × Source" was
-- undercounting admitted learners. The RPC decided cohort membership from the
-- LEAD's admission_year_id (scoped_leads filter), but that column is NULL/stale
-- on ~94% of leads (18,069 of 19,239). The cohort truth lives on the PROFILE's
-- admission_year_id (stamped at admission, not back-propagated to the lead).
--
-- Result for AY 2026: matrix showed 4 admitted, ground truth (profile-anchored)
-- is 9 source-attributable admits (a 10th is a direct-admit with no lead row, so
-- it legitimately has no source and stays out of a *source* breakdown).
--
-- FIX: scope cohort membership by COALESCE(profile.admission_year_id,
-- lead.admission_year_id) — prefer the profile's AY (source of truth once
-- admitted), fall back to the lead's AY (for not-yet-admitted inflow). This
-- merges the old scoped_leads + per_lead_status CTEs into one, since the AY
-- decision now needs the profile join. enrolled/admitted lifecycle set and all
-- output columns are preserved verbatim from the live definition.
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
  admitted_count    integer,
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
  ),
  per_lead_status AS (
    SELECT
      al.id,
      al.institution_id,
      al.source::text                                  AS source,
      COALESCE(NULLIF(TRIM(al.referral_type), ''), '') AS referral_type,
      lp.lifecycle_status::text                        AS lp_status,
      lp.activated_at
    FROM admission_leads al
    LEFT JOIN learners_profiles lp ON lp.id = al.learner_profile_id
    WHERE al.institution_id IN (SELECT id FROM eligible_institutions)
      AND (
        p_admission_year IS NULL
        -- Cohort membership: profile AY wins (truth once admitted), lead AY is
        -- the fallback for leads not yet linked to a profile.
        OR COALESCE(lp.admission_year_id, al.admission_year_id) IN (SELECT id FROM cohort_ay_ids)
      )
  )
  SELECT
    pls.institution_id,
    i.name::text                                                    AS institution_name,
    pls.source,
    pls.referral_type,
    COUNT(*)::int                                                   AS lead_count,
    COUNT(*) FILTER (WHERE pls.lp_status IN ('admitted','active'))::int AS enrolled_count,
    COUNT(*) FILTER (WHERE pls.lp_status IN ('admitted','active'))::int AS admitted_count,
    CASE WHEN COUNT(*) = 0 THEN 0::numeric
         ELSE ROUND(
           COUNT(*) FILTER (WHERE pls.lp_status IN ('admitted','active'))::numeric
             / COUNT(*)::numeric * 100, 2)
    END                                                             AS conversion_rate,
    MAX(pls.activated_at) FILTER (WHERE pls.lp_status IN ('admitted','active'))
                                                                    AS last_enrolled_at
  FROM per_lead_status pls
  JOIN institutions i ON i.id = pls.institution_id
  GROUP BY pls.institution_id, i.name, pls.source, pls.referral_type
  ORDER BY i.name, pls.source, pls.referral_type;
$$;

GRANT EXECUTE ON FUNCTION public.fn_source_analytics(uuid[], integer) TO authenticated, service_role;
