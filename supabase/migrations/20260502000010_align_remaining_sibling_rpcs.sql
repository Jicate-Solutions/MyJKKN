-- Migration: 2026-05-02
-- Phase C-7: Align remaining group-dashboard sibling RPCs to use FK only
-- (drop OR-fallback on lp.admission_year integer) and let historical cohorts
-- be queried by explicit year. Phase A 2026-05-02 backfilled FKs so the
-- integer fallback is no longer needed.
--
-- Per-RPC notes:
--   * fn_geography_analytics — counts "active learners" by geography. Lifecycle
--     set unchanged (no 'account'); pre-enrollment applicants shouldn't appear
--     on a geographic distribution map.
--   * fn_institution_comparison — exposes both "filled" (seats) and
--     "active_learners". Add 'account' to filled (matches Summary tab); leave
--     active untouched.
--   * fn_source_analytics — counts "enrolled_count" by source. These are
--     post-enrollment outcomes; 'account' (pre-admission) does not belong here.

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
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH eligible_institutions AS (
    SELECT id FROM institutions
    WHERE id = ANY(p_institution_ids) AND role_has_institution_access(id)
  ),
  cohort_ay_ids AS (
    SELECT id FROM admission_years
    WHERE p_admission_year IS NOT NULL
      AND program_start_year = p_admission_year
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
      AND (
        p_admission_year IS NULL
        OR lp.admission_year_id IN (SELECT id FROM cohort_ay_ids)
      )
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
$function$;

GRANT EXECUTE ON FUNCTION public.fn_geography_analytics(uuid[], integer) TO authenticated;

-- =============================================================================
-- fn_institution_comparison
-- =============================================================================
DROP FUNCTION IF EXISTS public.fn_institution_comparison(uuid[], integer);

CREATE OR REPLACE FUNCTION public.fn_institution_comparison(
  p_institution_ids uuid[],
  p_admission_year  integer DEFAULT NULL
)
RETURNS TABLE(
  institution_id   uuid,
  institution_name text,
  total_seats      integer,
  filled_seats     integer,
  fill_percentage  numeric,
  total_leads      integer,
  enrolled_count   integer,
  conversion_rate  numeric,
  top_source       text,
  top_district     text,
  active_learners  integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH eligible_institutions AS (
    SELECT id FROM institutions
    WHERE id = ANY(p_institution_ids) AND role_has_institution_access(id)
  ),
  cohort_ay_ids AS (
    -- Historical cohorts catalogued by Phase A 2026-05-02 are is_active=false
    -- but must remain queryable.
    SELECT id FROM admission_years
    WHERE p_admission_year IS NOT NULL
      AND program_start_year = p_admission_year
  ),
  seat_totals AS (
    SELECT
      ay.institution_id,
      SUM(ay.sanctioned_intake)::int AS total_seats
    FROM admission_years ay
    WHERE ay.institution_id IN (SELECT id FROM eligible_institutions)
      AND (
        (p_admission_year IS NULL AND ay.is_active = true)
        OR (p_admission_year IS NOT NULL AND ay.program_start_year = p_admission_year)
      )
    GROUP BY ay.institution_id
  ),
  learner_aggs AS (
    SELECT
      lp.institution_id,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text IN ('admitted','active','graduated','account'))::int AS filled,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text = 'active')::int AS active
    FROM learners_profiles lp
    WHERE lp.institution_id IS NOT NULL
      AND lp.institution_id IN (SELECT id FROM eligible_institutions)
      AND (
        p_admission_year IS NULL
        OR lp.admission_year_id IN (SELECT id FROM cohort_ay_ids)
      )
    GROUP BY lp.institution_id
  ),
  lead_aggs AS (
    SELECT
      al.institution_id,
      COUNT(*)::int AS total
    FROM admission_leads al
    WHERE al.institution_id IN (SELECT id FROM eligible_institutions)
      AND (
        p_admission_year IS NULL
        OR al.admission_year_id IN (SELECT id FROM cohort_ay_ids)
      )
    GROUP BY al.institution_id
  ),
  source_ranks AS (
    SELECT
      al.institution_id,
      al.source::text AS source,
      COUNT(*)        AS cnt,
      ROW_NUMBER() OVER (PARTITION BY al.institution_id ORDER BY COUNT(*) DESC) AS rk
    FROM admission_leads al
    WHERE al.institution_id IN (SELECT id FROM eligible_institutions)
      AND al.source IS NOT NULL
      AND (
        p_admission_year IS NULL
        OR al.admission_year_id IN (SELECT id FROM cohort_ay_ids)
      )
    GROUP BY al.institution_id, al.source
  ),
  district_ranks AS (
    SELECT
      lp.institution_id,
      INITCAP(TRIM(REGEXP_REPLACE(lp.permanent_address_district, '\s+', ' ', 'g'))) AS district,
      COUNT(*) AS cnt,
      ROW_NUMBER() OVER (
        PARTITION BY lp.institution_id
        ORDER BY COUNT(*) DESC
      ) AS rk
    FROM learners_profiles lp
    WHERE lp.institution_id IS NOT NULL
      AND lp.institution_id IN (SELECT id FROM eligible_institutions)
      AND lp.lifecycle_status::text IN ('admitted','active','graduated','account')
      AND lp.permanent_address_district IS NOT NULL
      AND TRIM(lp.permanent_address_district) <> ''
      AND (
        p_admission_year IS NULL
        OR lp.admission_year_id IN (SELECT id FROM cohort_ay_ids)
      )
    GROUP BY lp.institution_id, INITCAP(TRIM(REGEXP_REPLACE(lp.permanent_address_district, '\s+', ' ', 'g')))
  )
  SELECT
    i.id                                                        AS institution_id,
    i.name::text                                                AS institution_name,
    COALESCE(st.total_seats, 0)                                 AS total_seats,
    COALESCE(la.filled, 0)                                      AS filled_seats,
    CASE WHEN COALESCE(st.total_seats, 0) = 0 THEN 0::numeric
         ELSE ROUND(COALESCE(la.filled, 0)::numeric / st.total_seats * 100, 2)
    END                                                         AS fill_percentage,
    COALESCE(lda.total, 0)                                      AS total_leads,
    COALESCE(la.active, 0)                                      AS enrolled_count,
    CASE WHEN COALESCE(lda.total, 0) = 0 THEN 0::numeric
         ELSE ROUND(COALESCE(la.active, 0)::numeric / lda.total * 100, 2)
    END                                                         AS conversion_rate,
    sr.source                                                   AS top_source,
    dr.district                                                 AS top_district,
    COALESCE(la.active, 0)                                      AS active_learners
  FROM institutions i
  LEFT JOIN seat_totals    st  ON st.institution_id  = i.id
  LEFT JOIN learner_aggs   la  ON la.institution_id  = i.id
  LEFT JOIN lead_aggs      lda ON lda.institution_id = i.id
  LEFT JOIN source_ranks   sr  ON sr.institution_id  = i.id AND sr.rk = 1
  LEFT JOIN district_ranks dr  ON dr.institution_id  = i.id AND dr.rk = 1
  WHERE i.id IN (SELECT id FROM eligible_institutions)
  ORDER BY fill_percentage DESC, i.name;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_institution_comparison(uuid[], integer) TO authenticated;

-- =============================================================================
-- fn_source_analytics
-- =============================================================================
DROP FUNCTION IF EXISTS public.fn_source_analytics(uuid[], integer);

CREATE OR REPLACE FUNCTION public.fn_source_analytics(
  p_institution_ids uuid[],
  p_admission_year  integer DEFAULT NULL
)
RETURNS TABLE(
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
AS $function$
  WITH eligible_institutions AS (
    SELECT id FROM institutions
    WHERE id = ANY(p_institution_ids) AND role_has_institution_access(id)
  ),
  cohort_ay_ids AS (
    SELECT id FROM admission_years
    WHERE p_admission_year IS NOT NULL
      AND program_start_year = p_admission_year
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
       OR lp.admission_year_id IN (SELECT id FROM cohort_ay_ids)
       OR lp.admission_year_id IS NULL
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
$function$;

GRANT EXECUTE ON FUNCTION public.fn_source_analytics(uuid[], integer) TO authenticated;
