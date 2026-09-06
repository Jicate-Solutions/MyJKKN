-- Migration: 2026-05-17
-- Phase E2 (Dynamic Admission Statuses)
-- Align 4 sibling dashboard RPCs to read the seat-filled lifecycle set from
-- the new admission_statuses metadata table (scope='learner', is_active=true,
-- is_seat_filled=true) instead of the hardcoded
-- ('admitted','active','graduated','account') literal.
--
-- Same precedent as E1 (af459ff70 / fn_get_seat_analytics).
--
-- NOTES:
--   * fn_institution_comparison ALSO surfaces an "active" learner_aggs count
--     (`lifecycle_status = 'active'`) — that is NOT the seat-filled definition
--     and is preserved verbatim.
--   * fn_geography_analytics: its `active_learners` column is misleadingly
--     named but the SQL filter was {admitted,active,graduated,account} — i.e.
--     the seat-filled set. Replaced.
--   * fn_source_analytics: `enrolled_count` filter was {admitted,active,
--     graduated,account}. Replaced (3 sites: count + ratio numerator + MAX
--     FILTER).
--   * fn_seat_analytics_daily_pivot: hardcoded {admitted,active,graduated,
--     account} in `lp_anchor` and `filled_per_day`. Replaced both.
--
-- Today only `active` flips is_seat_filled=true, so totals will shrink to
-- match Top-cards / get_seat_analytics (E1). Future seat-filled statuses can
-- be flagged in admission_statuses without touching these RPCs.

BEGIN;

-- =============================================================================
-- 1. fn_seat_analytics_daily_pivot
-- =============================================================================
CREATE OR REPLACE FUNCTION public.fn_seat_analytics_daily_pivot(
  p_institution_ids        uuid[],
  p_admission_year         integer,
  p_exclude_bulk_migrated  boolean DEFAULT false
)
RETURNS TABLE(
  institution_id   uuid,
  institution_name text,
  program_id       uuid,
  program_short    text,
  program_name     text,
  course_short     text,
  stream           text,
  level            text,
  is_lateral       boolean,
  study_year       text,
  group_label      text,
  group_sort_key   text,
  intake           integer,
  filled           integer,
  balance          integer,
  fill_percentage  numeric,
  daily_counts     jsonb
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH eligible_institutions AS (
    SELECT id FROM institutions
    WHERE id = ANY(p_institution_ids) AND role_has_institution_access(id)
  ),
  program_resolution AS (
    SELECT
      p.id AS original_id,
      COALESCE(base.id, p.id) AS resolved_id
    FROM programs p
    LEFT JOIN programs base
      ON p.program_id LIKE '%-SH'
     AND base.program_id = regexp_replace(p.program_id, '-SH$', '')
     AND base.program_id NOT LIKE '%-SH'
     AND base.id <> p.id
  ),
  target_ays AS (
    SELECT
      ay.id, ay.institution_id, ay.program_id,
      ay.program_start_year, ay.program_end_year, ay.sanctioned_intake
    FROM admission_years ay
    WHERE ay.program_start_year = p_admission_year
      AND ay.institution_id IN (SELECT id FROM eligible_institutions)
  ),
  ay_anchor AS (
    SELECT DISTINCT ay.institution_id, pr.resolved_id AS program_id
    FROM target_ays ay
    JOIN programs p           ON p.id = ay.program_id
    JOIN program_resolution pr ON pr.original_id = ay.program_id
    WHERE COALESCE(p.is_active, true) = true
  ),
  lp_anchor AS (
    SELECT DISTINCT lp.institution_id, pr.resolved_id AS program_id
    FROM learners_profiles lp
    JOIN programs p           ON p.id = lp.program_id
    JOIN program_resolution pr ON pr.original_id = lp.program_id
    WHERE lp.institution_id IN (SELECT id FROM eligible_institutions)
      AND lp.admission_year_id IN (SELECT id FROM target_ays)
      AND lp.lifecycle_status::text IN (
        SELECT code FROM public.admission_statuses
        WHERE scope = 'learner' AND is_active = true AND is_seat_filled = true
      )
      AND COALESCE(p.is_active, true) = true
  ),
  anchor AS (
    SELECT institution_id, program_id FROM ay_anchor
    UNION
    SELECT institution_id, program_id FROM lp_anchor
  ),
  intake_per_program AS (
    SELECT
      ay.institution_id,
      pr.resolved_id AS program_id,
      bool_or(
        (ay.program_end_year - ay.program_start_year)
          < COALESCE(p.program_duration_yrs::int, 4)
      ) AS has_lateral_row,
      SUM(ay.sanctioned_intake)::int AS intake_total
    FROM target_ays ay
    JOIN programs p           ON p.id = ay.program_id
    JOIN program_resolution pr ON pr.original_id = ay.program_id
    GROUP BY ay.institution_id, pr.resolved_id
  ),
  filled_per_day AS (
    SELECT
      lp.institution_id,
      pr.resolved_id AS program_id,
      (COALESCE(lp.activated_at, lp.created_at) AT TIME ZONE 'Asia/Kolkata')::date AS admit_date,
      COUNT(*)::int AS cnt
    FROM learners_profiles lp
    JOIN program_resolution pr ON pr.original_id = lp.program_id
    WHERE lp.institution_id IN (SELECT id FROM eligible_institutions)
      AND lp.admission_year_id IN (SELECT id FROM target_ays)
      AND lp.lifecycle_status::text IN (
        SELECT code FROM public.admission_statuses
        WHERE scope = 'learner' AND is_active = true AND is_seat_filled = true
      )
      AND (NOT p_exclude_bulk_migrated OR lp.migrated_at IS NULL)
    GROUP BY lp.institution_id, pr.resolved_id,
             (COALESCE(lp.activated_at, lp.created_at) AT TIME ZONE 'Asia/Kolkata')::date
  ),
  per_program AS (
    SELECT
      a.institution_id,
      i.name           AS institution_name,
      i.counselling_code,
      a.program_id,
      p.program_id     AS program_short,
      p.program_name,
      d.degree_type,
      dept.department_code,
      COALESCE(ipp.has_lateral_row, false) AS has_lateral_row,
      COALESCE(ipp.intake_total, 0)         AS intake_total,
      COALESCE(SUM(fpd.cnt), 0)::int        AS filled,
      jsonb_object_agg(fpd.admit_date::text, fpd.cnt)
        FILTER (WHERE fpd.admit_date IS NOT NULL) AS daily_counts
    FROM anchor a
    JOIN institutions i        ON i.id    = a.institution_id
    JOIN programs p            ON p.id    = a.program_id
    LEFT JOIN intake_per_program ipp ON ipp.institution_id = a.institution_id AND ipp.program_id = a.program_id
    LEFT JOIN degrees d        ON d.id    = p.degree_id
    LEFT JOIN departments dept ON dept.id = p.department_id
    LEFT JOIN filled_per_day fpd
      ON fpd.institution_id = a.institution_id AND fpd.program_id = a.program_id
    GROUP BY
      a.institution_id, i.name, i.counselling_code,
      a.program_id, p.program_id, p.program_name, d.degree_type, dept.department_code,
      ipp.has_lateral_row, ipp.intake_total
  )
  SELECT
    pp.institution_id,
    pp.institution_name,
    pp.program_id,
    pp.program_short,
    pp.program_name,
    pp.program_name                                           AS course_short,
    COALESCE(_admission_stream_label(pp.counselling_code), pp.institution_name) AS stream,
    UPPER(COALESCE(pp.degree_type, ''))                       AS level,
    pp.has_lateral_row                                        AS is_lateral,
    CASE WHEN pp.has_lateral_row THEN 'II YEAR' ELSE 'I YEAR' END AS study_year,
    CASE
      WHEN pp.has_lateral_row THEN
        COALESCE(_admission_stream_label(pp.counselling_code), pp.institution_name)
        || ' - LATERAL ENTRY - II YEAR'
      ELSE
        UPPER(COALESCE(pp.degree_type, '')) || ' '
        || COALESCE(_admission_stream_label(pp.counselling_code), pp.institution_name)
        || ' - I YEAR'
    END                                                       AS group_label,
    COALESCE(pp.counselling_code, 'ZZZ') || '.'
      || UPPER(COALESCE(pp.degree_type, 'z')) || '.'
      || CASE WHEN pp.has_lateral_row THEN '1' ELSE '0' END   AS group_sort_key,
    pp.intake_total                                           AS intake,
    pp.filled,
    GREATEST(pp.intake_total - pp.filled, 0)                  AS balance,
    CASE WHEN pp.intake_total = 0 THEN 0::numeric
         ELSE ROUND(pp.filled::numeric / pp.intake_total * 100, 2)
    END                                                       AS fill_percentage,
    COALESCE(pp.daily_counts, '{}'::jsonb)                    AS daily_counts
  FROM per_program pp
  ORDER BY group_sort_key, course_short;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_seat_analytics_daily_pivot(uuid[], integer, boolean) TO authenticated;

-- =============================================================================
-- 2. fn_institution_comparison
--    `filled_seats` switches to admission_statuses subquery.
--    `active_learners` / `enrolled_count` (= COUNT WHERE status='active')
--    preserved verbatim — those are not the seat-filled definition.
--    `district_ranks` filter also switched (it represents the same seat-filled
--    cohort used for top-district ranking).
-- =============================================================================
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
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH eligible_institutions AS (
    SELECT id FROM institutions
    WHERE id = ANY(p_institution_ids) AND role_has_institution_access(id)
  ),
  cohort_ay_ids AS (
    SELECT id FROM admission_years
    WHERE p_admission_year IS NOT NULL AND program_start_year = p_admission_year
  ),
  seat_totals AS (
    SELECT ay.institution_id, SUM(ay.sanctioned_intake)::int AS total_seats
    FROM admission_years ay
    WHERE ay.institution_id IN (SELECT id FROM eligible_institutions)
      AND (
        (p_admission_year IS NULL AND ay.is_active = true)
        OR (p_admission_year IS NOT NULL AND ay.program_start_year = p_admission_year)
      )
    GROUP BY ay.institution_id
  ),
  learner_aggs AS (
    SELECT lp.institution_id,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text IN (
        SELECT code FROM public.admission_statuses
        WHERE scope = 'learner' AND is_active = true AND is_seat_filled = true
      ))::int AS filled,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text = 'active')::int AS active
    FROM learners_profiles lp
    WHERE lp.institution_id IS NOT NULL
      AND lp.institution_id IN (SELECT id FROM eligible_institutions)
      AND (p_admission_year IS NULL OR lp.admission_year_id IN (SELECT id FROM cohort_ay_ids))
    GROUP BY lp.institution_id
  ),
  lead_aggs AS (
    SELECT al.institution_id, COUNT(*)::int AS total
    FROM admission_leads al
    WHERE al.institution_id IN (SELECT id FROM eligible_institutions)
      AND (p_admission_year IS NULL OR al.admission_year_id IN (SELECT id FROM cohort_ay_ids))
    GROUP BY al.institution_id
  ),
  source_ranks AS (
    SELECT al.institution_id, al.source::text AS source, COUNT(*) AS cnt,
      ROW_NUMBER() OVER (PARTITION BY al.institution_id ORDER BY COUNT(*) DESC) AS rk
    FROM admission_leads al
    WHERE al.institution_id IN (SELECT id FROM eligible_institutions)
      AND al.source IS NOT NULL
      AND (p_admission_year IS NULL OR al.admission_year_id IN (SELECT id FROM cohort_ay_ids))
    GROUP BY al.institution_id, al.source
  ),
  district_ranks AS (
    SELECT lp.institution_id,
      INITCAP(TRIM(REGEXP_REPLACE(lp.permanent_address_district, '\s+', ' ', 'g'))) AS district,
      COUNT(*) AS cnt,
      ROW_NUMBER() OVER (PARTITION BY lp.institution_id ORDER BY COUNT(*) DESC) AS rk
    FROM learners_profiles lp
    WHERE lp.institution_id IS NOT NULL
      AND lp.institution_id IN (SELECT id FROM eligible_institutions)
      AND lp.lifecycle_status::text IN (
        SELECT code FROM public.admission_statuses
        WHERE scope = 'learner' AND is_active = true AND is_seat_filled = true
      )
      AND lp.permanent_address_district IS NOT NULL
      AND TRIM(lp.permanent_address_district) <> ''
      AND (p_admission_year IS NULL OR lp.admission_year_id IN (SELECT id FROM cohort_ay_ids))
    GROUP BY lp.institution_id, INITCAP(TRIM(REGEXP_REPLACE(lp.permanent_address_district, '\s+', ' ', 'g')))
  )
  SELECT
    i.id                                              AS institution_id,
    i.name::text                                      AS institution_name,
    COALESCE(st.total_seats, 0)                       AS total_seats,
    COALESCE(la.filled, 0)                            AS filled_seats,
    CASE WHEN COALESCE(st.total_seats, 0) = 0 THEN 0::numeric
         ELSE ROUND(COALESCE(la.filled, 0)::numeric / st.total_seats * 100, 2) END
                                                       AS fill_percentage,
    COALESCE(lda.total, 0)                            AS total_leads,
    COALESCE(la.active, 0)                            AS enrolled_count,
    CASE WHEN COALESCE(lda.total, 0) = 0 THEN 0::numeric
         ELSE ROUND(COALESCE(la.active, 0)::numeric / lda.total * 100, 2) END
                                                       AS conversion_rate,
    sr.source                                         AS top_source,
    dr.district                                       AS top_district,
    COALESCE(la.active, 0)                            AS active_learners
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
-- 3. fn_geography_analytics
--    The output column is named `active_learners` but the filter was
--    {admitted,active,graduated,account} — i.e. the seat-filled set per the
--    2026-05-02 Phase C-10 alignment. Replaced.
-- =============================================================================
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
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
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
      AND lp.lifecycle_status::text IN (
        SELECT code FROM public.admission_statuses
        WHERE scope = 'learner' AND is_active = true AND is_seat_filled = true
      )
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
-- 4. fn_source_analytics
--    `enrolled_count` filter (3 sites: COUNT, ratio numerator, MAX activated_at)
--    replaced with admission_statuses subquery.
-- =============================================================================
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
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH eligible_institutions AS (
    SELECT id FROM institutions
    WHERE id = ANY(p_institution_ids) AND role_has_institution_access(id)
  ),
  cohort_ay_ids AS (
    SELECT id FROM admission_years
    WHERE p_admission_year IS NOT NULL AND program_start_year = p_admission_year
  ),
  seat_filled_codes AS (
    SELECT code FROM public.admission_statuses
    WHERE scope = 'learner' AND is_active = true AND is_seat_filled = true
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
    COUNT(*) FILTER (WHERE pls.lp_status IN (SELECT code FROM seat_filled_codes))::int,
    CASE WHEN COUNT(*) = 0 THEN 0::numeric
         ELSE ROUND(COUNT(*) FILTER (WHERE pls.lp_status IN (SELECT code FROM seat_filled_codes))::numeric
                    / COUNT(*)::numeric * 100, 2) END,
    MAX(pls.activated_at) FILTER (WHERE pls.lp_status IN (SELECT code FROM seat_filled_codes))
  FROM per_lead_status pls JOIN institutions i ON i.id = pls.institution_id
  GROUP BY pls.institution_id, i.name, pls.source, pls.referral_type
  ORDER BY i.name, pls.source, pls.referral_type;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_source_analytics(uuid[], integer) TO authenticated;

COMMIT;
