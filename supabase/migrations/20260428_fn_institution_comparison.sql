-- =============================================================================
-- fn_institution_comparison — single-RPC institution ranking
-- Date: 2026-04-28
-- =============================================================================
-- Replaces the client-side 3-way fan-out in
-- GroupDashboardService.getInstitutionComparison() that combined
-- get_seat_analytics + get_source_analytics + get_geography_analytics with
-- mismatched lifecycle_status semantics.
--
-- Returns one row per institution in scope with funnel-correct semantics
-- matching fn_seat_analytics_daily_pivot + fn_group_dashboard_overview.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_institution_comparison(
  p_institution_ids uuid[],
  p_admission_year  integer DEFAULT NULL
)
RETURNS TABLE (
  institution_id    uuid,
  institution_name  text,
  total_seats       integer,
  filled_seats      integer,
  fill_percentage   numeric,
  total_leads       integer,
  enrolled_count    integer,
  conversion_rate   numeric,
  top_source        text,
  top_district      text,
  active_learners   integer
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
  seat_totals AS (
    SELECT
      ay.institution_id,
      SUM(ay.sanctioned_intake)::int AS total_seats
    FROM admission_years ay
    WHERE ay.is_active = true
      AND ay.institution_id IN (SELECT id FROM eligible_institutions)
      AND (p_admission_year IS NULL OR ay.program_start_year = p_admission_year)
    GROUP BY ay.institution_id
  ),
  learner_aggs AS (
    SELECT
      lp.institution_id,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text IN ('admitted','active','graduated'))::int AS filled,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text = 'active')::int AS active
    FROM learners_profiles lp
    WHERE lp.institution_id IS NOT NULL
      AND lp.institution_id IN (SELECT id FROM eligible_institutions)
      AND (p_admission_year IS NULL OR lp.admission_year = p_admission_year)
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
        OR (al.admission_year_id IS NULL
            AND EXTRACT(year FROM al.created_at)::int = p_admission_year)
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
        OR (al.admission_year_id IS NULL
            AND EXTRACT(year FROM al.created_at)::int = p_admission_year)
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
      AND lp.lifecycle_status::text IN ('admitted','active','graduated')
      AND lp.permanent_address_district IS NOT NULL
      AND TRIM(lp.permanent_address_district) <> ''
      AND (p_admission_year IS NULL OR lp.admission_year = p_admission_year)
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
$$;

COMMENT ON FUNCTION public.fn_institution_comparison(uuid[], integer) IS
  'Single-RPC institution ranking for the Comparison tab. Replaces a 3-way client-side fan-out. p_admission_year integer for cohort scoping. SECURITY DEFINER + role_has_institution_access enforcement.';

GRANT EXECUTE ON FUNCTION public.fn_institution_comparison(uuid[], integer) TO authenticated, service_role;
