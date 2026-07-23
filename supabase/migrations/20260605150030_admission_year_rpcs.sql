-- =============================================================================
-- Admission Year → institution-wide migration, Task 4: rework analytics RPCs.
--
-- Context (already applied by 20260605150020_admission_year_schema_ddl.sql):
--   admission_years is now ONE row per (institution, year). It lost the
--   columns program_id, program_end_year, sanctioned_intake; program_start_year
--   was renamed to `year`. The table admission_year_quota_seats was dropped.
--   Per-program sanctioned seats now live on programs.sanctioned_intake
--   (year-agnostic, NOT NULL). programs also has program_duration_yrs (numeric,
--   nullable) for deriving an end/passing year.
--
-- This migration rewrites every analytics function that still read those gone
-- columns. Transformation rules:
--   * ay.program_start_year            -> ay.year
--   * ay.program_end_year (passing yr) -> (ay.year + programs.program_duration_yrs)::int
--     (program reached via the row's own program FK, e.g. learners_profiles.program_id)
--   * ay.sanctioned_intake             -> programs.sanctioned_intake. Institution
--     totals = SUM over that institution's active programs.
--   * ay.program_id joins              -> program comes from the fact row's own
--     program FK (learners_profiles.program_id). admission_historical_pivot has
--     NO program_id and never did (it was program-resolved only via ay.program_id,
--     which is gone) so its grain is now institution+year; program/category-keyed
--     historical breakdowns fall back to institution+year attribution.
--
-- All parameter signatures are kept byte-identical.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- _get_historical_admitted_by_day  (rename only)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._get_historical_admitted_by_day(p_year integer, p_institution_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(day_n integer, cumulative_admitted bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH daily_totals AS (
    SELECT
      hp.admission_date,
      SUM(hp.admitted_count) AS day_count
    FROM admission_historical_pivot hp
    JOIN admission_years ay ON ay.id = hp.admission_year_id
    WHERE ay.year = p_year
      AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
    GROUP BY hp.admission_date
  )
  SELECT
    (admission_date - make_date(p_year, 4, 1))::int AS day_n,
    SUM(day_count) OVER (ORDER BY admission_date)::bigint AS cumulative_admitted
  FROM daily_totals
  ORDER BY admission_date;
$function$;


-- -----------------------------------------------------------------------------
-- fn_learner_year_of_study
--   admission_years path lost program_end_year. Derive cohort length from the
--   learner's program duration: end_year = ay.year + duration; cohort length =
--   duration + 1 (matches old program_end_year - program_start_year + 1).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_learner_year_of_study(p_learner_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    CASE
      WHEN lp.admission_year_id IS NOT NULL AND ay.year IS NOT NULL
        THEN GREATEST(1, LEAST(
               EXTRACT(year FROM CURRENT_DATE)::integer - ay.year + 1,
               COALESCE(pr.program_duration_yrs::int, 4) + 1
             ))
      WHEN lp.batch_id IS NOT NULL AND b.start_date IS NOT NULL
        THEN GREATEST(1, LEAST(
               EXTRACT(year FROM CURRENT_DATE)::integer - EXTRACT(year FROM b.start_date)::integer + 1,
               EXTRACT(year FROM b.end_date)::integer - EXTRACT(year FROM b.start_date)::integer + 1
             ))
      WHEN lp.enquiry_date IS NOT NULL
        THEN GREATEST(1, EXTRACT(year FROM CURRENT_DATE)::integer - EXTRACT(year FROM lp.enquiry_date)::integer + 1)
      ELSE NULL
    END
  FROM learners_profiles lp
  LEFT JOIN admission_years ay ON ay.id = lp.admission_year_id
  LEFT JOIN programs pr ON pr.id = lp.program_id
  LEFT JOIN batches b ON b.id = lp.batch_id
  WHERE lp.id = p_learner_id;
$function$;


-- -----------------------------------------------------------------------------
-- get_seat_analytics
--   Re-architected: rows are now driven by programs (which hold sanctioned_intake)
--   per institution, with admission_years supplying only the year context for the
--   institution. The "filled" side counts learners_profiles by their own
--   program_id + admission_year_id. Output columns + signature unchanged.
--   program_end_year -> ay.year + program_duration_yrs.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_seat_analytics(p_institution_id uuid DEFAULT NULL::uuid, p_program_start_year integer DEFAULT NULL::integer)
 RETURNS TABLE(institution_id uuid, institution_name text, degree_id uuid, degree_name text, department_id uuid, department_name text, program_id uuid, program_name text, admission_year_id uuid, admission_year_name text, program_start_year integer, program_end_year integer, total_seats integer, filled_seats bigint, reserved_seats bigint, balance_seats integer, fill_percentage numeric, last_filled_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Resolve the single institution-wide admission year per institution for the
  -- requested year (or the active year when no year is given).
  WITH years AS (
    SELECT ay.id, ay.institution_id, ay.admission_year_name, ay.year
    FROM admission_years ay
    WHERE (
            (p_program_start_year IS NULL     AND ay.is_active = true)
         OR (p_program_start_year IS NOT NULL AND ay.year = p_program_start_year)
          )
      AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
      AND role_has_institution_access(ay.institution_id)
  )
  SELECT
    i.id,
    i.name,
    d.id,
    d.degree_name,
    dept.id,
    dept.department_name,
    p.id,
    p.program_name,
    y.id,
    y.admission_year_name,
    y.year                                                       AS program_start_year,
    (y.year + COALESCE(p.program_duration_yrs, 0))::integer      AS program_end_year,
    p.sanctioned_intake::integer                                 AS total_seats,
    COUNT(lp.id) FILTER (
      WHERE lp.lifecycle_status::text IN ('admitted','active','graduated','account')
    )                                                           AS filled_seats,
    COUNT(lp.id) FILTER (
      WHERE lp.lifecycle_status::text = 'reserved'
    )                                                           AS reserved_seats,
    GREATEST(
      0,
      p.sanctioned_intake - (COUNT(lp.id) FILTER (
        WHERE lp.lifecycle_status::text IN ('admitted','active','graduated','account')
      ))::integer
    )                                                           AS balance_seats,
    CASE
      WHEN p.sanctioned_intake > 0
        THEN ROUND(
          (COUNT(lp.id) FILTER (
            WHERE lp.lifecycle_status::text IN ('admitted','active','graduated','account')
          ))::numeric / p.sanctioned_intake * 100, 1)
      ELSE 0
    END                                                         AS fill_percentage,
    MAX(lp.activated_at) FILTER (
      WHERE lp.lifecycle_status::text IN ('admitted','active','graduated','account')
    )                                                           AS last_filled_at
  FROM years y
  JOIN programs p       ON p.institution_id = y.institution_id AND COALESCE(p.is_active, true) = true
  JOIN departments dept ON dept.id = p.department_id
  JOIN degrees d        ON d.id    = p.degree_id
  JOIN institutions i   ON i.id    = y.institution_id
  LEFT JOIN learners_profiles lp
    ON  lp.admission_year_id = y.id
    AND lp.program_id        = p.id
    AND lp.lifecycle_status::text IN ('admitted','active','graduated','account','reserved')
  GROUP BY
    i.id, i.name,
    d.id, d.degree_name,
    dept.id, dept.department_name,
    p.id, p.program_name, p.sanctioned_intake, p.program_duration_yrs,
    y.id, y.admission_year_name, y.year
  ORDER BY i.name, d.degree_name, dept.department_name, p.program_name, y.year DESC;
$function$;


-- -----------------------------------------------------------------------------
-- fn_seat_analytics_daily_pivot
--   target_ays no longer carries program_id/end_year/sanctioned_intake. Intake
--   now comes from programs.sanctioned_intake per resolved program. Lateral-entry
--   detection (formerly program_end_year - program_start_year < duration) is no
--   longer derivable from admission_years (single institution-wide row, no
--   per-program span) so it is read straight off the program: lateral rows are
--   programs whose duration is shorter than the canonical program's duration.
--   Anchor/seat universe is now programs that exist for the institution + the
--   programs that appear on learners for the target year.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_seat_analytics_daily_pivot(p_institution_ids uuid[], p_admission_year integer, p_exclude_bulk_migrated boolean DEFAULT false)
 RETURNS TABLE(institution_id uuid, institution_name text, program_id uuid, program_short text, program_name text, course_short text, stream text, level text, is_lateral boolean, study_year text, group_label text, group_sort_key text, intake integer, filled integer, reserved integer, balance integer, fill_percentage numeric, daily_counts jsonb)
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
      p.institution_id,
      COALESCE(base.id, p.id) AS resolved_id,
      -- lateral when this program is a -SH variant collapsed onto a base program
      (base.id IS NOT NULL)   AS is_lateral_variant
    FROM programs p
    LEFT JOIN programs base
      ON p.program_id LIKE '%-SH'
     AND base.program_id = regexp_replace(p.program_id, '-SH$', '')
     AND base.program_id NOT LIKE '%-SH'
     AND base.id <> p.id
  ),
  -- institution-wide admission year row(s) for the requested intake year
  target_ays AS (
    SELECT ay.id, ay.institution_id
    FROM admission_years ay
    WHERE ay.year = p_admission_year
      AND ay.institution_id IN (SELECT id FROM eligible_institutions)
  ),
  -- programs offered by each eligible institution (seat universe)
  program_anchor AS (
    SELECT DISTINCT
      p.institution_id,
      pr.resolved_id AS program_id
    FROM programs p
    JOIN program_resolution pr ON pr.original_id = p.id
    WHERE p.institution_id IN (SELECT id FROM eligible_institutions)
      AND COALESCE(p.is_active, true) = true
  ),
  lp_anchor AS (
    SELECT DISTINCT lp.institution_id, pr.resolved_id AS program_id
    FROM learners_profiles lp
    JOIN programs p           ON p.id = lp.program_id
    JOIN program_resolution pr ON pr.original_id = lp.program_id
    WHERE lp.institution_id IN (SELECT id FROM eligible_institutions)
      AND lp.admission_year_id IN (SELECT id FROM target_ays)
      AND lp.lifecycle_status::text IN ('admitted','active','graduated','account','reserved')
      AND COALESCE(p.is_active, true) = true
  ),
  anchor AS (
    SELECT institution_id, program_id FROM program_anchor
    UNION
    SELECT institution_id, program_id FROM lp_anchor
  ),
  -- sanctioned intake per resolved program: sum the variants' seats onto the base
  intake_per_program AS (
    SELECT
      p.institution_id,
      pr.resolved_id AS program_id,
      bool_or(pr.is_lateral_variant) AS has_lateral_row,
      SUM(p.sanctioned_intake)::int  AS intake_total
    FROM programs p
    JOIN program_resolution pr ON pr.original_id = p.id
    WHERE p.institution_id IN (SELECT id FROM eligible_institutions)
      AND COALESCE(p.is_active, true) = true
    GROUP BY p.institution_id, pr.resolved_id
  ),
  reserved_per_program AS (
    SELECT
      lp.institution_id,
      pr.resolved_id AS program_id,
      COUNT(*)::int AS reserved_total
    FROM learners_profiles lp
    JOIN program_resolution pr ON pr.original_id = lp.program_id
    WHERE lp.institution_id IN (SELECT id FROM eligible_institutions)
      AND lp.admission_year_id IN (SELECT id FROM target_ays)
      AND lp.lifecycle_status::text = 'reserved'
      AND (NOT p_exclude_bulk_migrated OR lp.migrated_at IS NULL)
    GROUP BY lp.institution_id, pr.resolved_id
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
      AND lp.lifecycle_status::text IN ('admitted','active','graduated','account')
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
      COALESCE(rpp.reserved_total, 0)       AS reserved,
      jsonb_object_agg(fpd.admit_date::text, fpd.cnt)
        FILTER (WHERE fpd.admit_date IS NOT NULL) AS daily_counts
    FROM anchor a
    JOIN institutions i        ON i.id    = a.institution_id
    JOIN programs p            ON p.id    = a.program_id
    LEFT JOIN intake_per_program ipp ON ipp.institution_id = a.institution_id AND ipp.program_id = a.program_id
    LEFT JOIN reserved_per_program rpp ON rpp.institution_id = a.institution_id AND rpp.program_id = a.program_id
    LEFT JOIN degrees d        ON d.id    = p.degree_id
    LEFT JOIN departments dept ON dept.id = p.department_id
    LEFT JOIN filled_per_day fpd
      ON fpd.institution_id = a.institution_id AND fpd.program_id = a.program_id
    GROUP BY
      a.institution_id, i.name, i.counselling_code,
      a.program_id, p.program_id, p.program_name, d.degree_type, dept.department_code,
      ipp.has_lateral_row, ipp.intake_total, rpp.reserved_total
  )
  SELECT
    pp.institution_id,
    pp.institution_name,
    pp.program_id,
    pp.program_short,
    pp.program_name,
    pp.program_name                                           AS course_short,
    COALESCE(_admission_stream_label(pp.counselling_code), pp.institution_name) AS stream,
    UPPER(COALESCE(pp.degree_type, ''))                      AS level,
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
    pp.reserved,
    GREATEST(pp.intake_total - pp.filled, 0)                  AS balance,
    CASE WHEN pp.intake_total = 0 THEN 0::numeric
         ELSE ROUND(pp.filled::numeric / pp.intake_total * 100, 2)
    END                                                       AS fill_percentage,
    COALESCE(pp.daily_counts, '{}'::jsonb)                    AS daily_counts
  FROM per_program pp
  ORDER BY group_sort_key, course_short;
$function$;


-- -----------------------------------------------------------------------------
-- fn_institution_comparison
--   seat_totals: per-institution sanctioned now = SUM of that institution's
--   active programs' sanctioned_intake (year-agnostic). program_start_year ->
--   year in the cohort filter.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_institution_comparison(p_institution_ids uuid[], p_admission_year integer DEFAULT NULL::integer)
 RETURNS TABLE(institution_id uuid, institution_name text, total_seats integer, filled_seats integer, fill_percentage numeric, total_leads integer, enrolled_count integer, conversion_rate numeric, top_source text, top_district text, active_learners integer)
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
    WHERE p_admission_year IS NOT NULL
      AND year = p_admission_year
  ),
  -- Sanctioned seats are now year-agnostic, sourced from programs.
  seat_totals AS (
    SELECT
      p.institution_id,
      SUM(p.sanctioned_intake)::int AS total_seats
    FROM programs p
    WHERE COALESCE(p.is_active, true) = true
      AND p.institution_id IN (SELECT id FROM eligible_institutions)
    GROUP BY p.institution_id
  ),
  learner_aggs AS (
    SELECT
      lp.institution_id,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text IN ('admitted','active'))::int AS filled,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text IN ('admitted','active'))::int AS admitted_plus_active,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text = 'active')::int AS active
    FROM learners_profiles lp
    WHERE lp.institution_id IS NOT NULL
      AND lp.institution_id IN (SELECT id FROM eligible_institutions)
      AND (p_admission_year IS NULL OR lp.admission_year_id IN (SELECT id FROM cohort_ay_ids))
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
      AND lp.lifecycle_status::text IN ('admitted','active')
      AND lp.permanent_address_district IS NOT NULL
      AND TRIM(lp.permanent_address_district) <> ''
      AND (p_admission_year IS NULL OR lp.admission_year_id IN (SELECT id FROM cohort_ay_ids))
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
    COALESCE(la.admitted_plus_active, 0)                        AS enrolled_count,
    CASE WHEN COALESCE(lda.total, 0) = 0 THEN 0::numeric
         ELSE ROUND(COALESCE(la.admitted_plus_active, 0)::numeric / lda.total * 100, 2)
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


-- -----------------------------------------------------------------------------
-- fn_group_dashboard_overview (3-arg)
--   ay_scope no longer carries program_id/sanctioned_intake. Seat totals now come
--   from programs.sanctioned_intake per institution (year-agnostic). The ay_scope
--   CTE is retained only to scope lead/learner cohorts by admission_year_id.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_group_dashboard_overview(p_institution_ids uuid[], p_admission_year_id uuid DEFAULT NULL::uuid, p_program_start_year integer DEFAULT NULL::integer)
 RETURNS TABLE(institution_id uuid, institution_name text, total_leads bigint, active_crm_leads bigint, lost_leads bigint, applied_learners bigint, active_learners bigint, rejected_learners bigint, total_seats bigint, filled_seats bigint, enrolled_leads bigint, seat_filled_learners bigint, fill_percentage numeric, enquiry_count bigint, enquiry_submitted_count bigint, account_count bigint, reserved_count bigint, admitted_count bigint, rejected_lifecycle_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH ay_scope AS (
    SELECT ay.id, ay.institution_id, ay.year
    FROM admission_years ay
    WHERE ay.institution_id = ANY(p_institution_ids)
      AND (
            (p_admission_year_id IS NOT NULL AND ay.id = p_admission_year_id)
         OR (p_admission_year_id IS NULL AND p_program_start_year IS NOT NULL
             AND ay.year = p_program_start_year)
         OR (p_admission_year_id IS NULL AND p_program_start_year IS NULL
             AND ay.is_active = true)
          )
  ),
  lead_counts AS (
    SELECT
      al.institution_id,
      COUNT(*)                                                                           AS total,
      COUNT(*) FILTER (WHERE COALESCE(al.is_active, true) AND NOT COALESCE(al.is_lost, false)) AS active_crm,
      COUNT(*) FILTER (WHERE COALESCE(al.is_lost, false) OR al.funnel_stage::text IN ('lost','not_reachable')) AS lost,
      COUNT(*) FILTER (WHERE al.funnel_stage::text = 'application_started')              AS applied,
      COUNT(*) FILTER (WHERE al.funnel_stage::text = 'enrolled')                          AS active,
      COUNT(*) FILTER (WHERE al.funnel_stage::text = 'declined')                          AS rejected,
      COUNT(*) FILTER (WHERE al.funnel_stage::text = 'enrolled')                          AS filled
    FROM admission_leads al
    WHERE al.institution_id = ANY(p_institution_ids)
      AND (
            (p_admission_year_id IS NOT NULL
             AND al.admission_year_id = p_admission_year_id)
         OR (p_admission_year_id IS NULL AND p_program_start_year IS NOT NULL
             AND ( al.admission_year_id IN (SELECT id FROM ay_scope)
                OR (al.admission_year_id IS NULL
                    AND EXTRACT(year FROM al.created_at)::int = p_program_start_year) ))
         OR (p_admission_year_id IS NULL AND p_program_start_year IS NULL)
          )
    GROUP BY al.institution_id
  ),
  seat_filled_codes AS (
    SELECT code FROM admission_statuses
    WHERE scope = 'learner' AND is_active = true AND is_seat_filled = true
  ),
  learner_lifecycle_counts AS (
    SELECT
      lp.institution_id,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text IN (SELECT code FROM seat_filled_codes))  AS seat_filled,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text = 'enquiry')                              AS lc_enquiry,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text = 'enquiry_submitted')                    AS lc_enquiry_submitted,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text = 'account')                              AS lc_account,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text = 'reserved')                             AS lc_reserved,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text IN ('admitted', 'active'))                AS lc_admitted_plus_active,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text = 'rejected')                             AS lc_rejected
    FROM learners_profiles lp
    WHERE lp.institution_id = ANY(p_institution_ids)
      AND (
            (p_admission_year_id IS NOT NULL
             AND lp.admission_year_id = p_admission_year_id)
         OR (p_admission_year_id IS NULL AND p_program_start_year IS NOT NULL
             AND lp.admission_year_id IN (SELECT id FROM ay_scope))
         OR (p_admission_year_id IS NULL AND p_program_start_year IS NULL)
          )
    GROUP BY lp.institution_id
  ),
  -- Sanctioned seats are now year-agnostic, sourced from programs.
  seat_totals AS (
    SELECT p.institution_id, SUM(p.sanctioned_intake)::bigint AS total_seats
    FROM programs p
    WHERE COALESCE(p.is_active, true) = true
      AND p.institution_id = ANY(p_institution_ids)
    GROUP BY p.institution_id
  )
  SELECT
    i.id,
    i.name::text,
    COALESCE(lc.total,                              0)::bigint,
    COALESCE(lc.active_crm,                         0)::bigint,
    COALESCE(lc.lost,                               0)::bigint,
    COALESCE(lc.applied,                            0)::bigint,
    COALESCE(lc.active,                             0)::bigint,
    COALESCE(lc.rejected,                           0)::bigint,
    COALESCE(st.total_seats,                        0)::bigint,
    COALESCE(lc.filled,                             0)::bigint,
    COALESCE(lc.filled,                             0)::bigint,
    COALESCE(lrn.seat_filled,                       0)::bigint,
    CASE WHEN COALESCE(st.total_seats, 0) = 0 THEN 0::numeric
         ELSE ROUND(COALESCE(lc.filled, 0)::numeric / st.total_seats * 100, 1)
    END,
    COALESCE(lrn.lc_enquiry,                        0)::bigint,
    COALESCE(lrn.lc_enquiry_submitted,              0)::bigint,
    COALESCE(lrn.lc_account,                        0)::bigint,
    COALESCE(lrn.lc_reserved,                       0)::bigint,
    COALESCE(lrn.lc_admitted_plus_active,           0)::bigint,
    COALESCE(lrn.lc_rejected,                       0)::bigint
  FROM institutions i
  LEFT JOIN lead_counts             lc  ON lc.institution_id  = i.id
  LEFT JOIN learner_lifecycle_counts lrn ON lrn.institution_id = i.id
  LEFT JOIN seat_totals             st  ON st.institution_id  = i.id
  WHERE i.id = ANY(p_institution_ids)
    AND role_has_institution_access(i.id)
  ORDER BY i.name;
$function$;


-- -----------------------------------------------------------------------------
-- fn_group_dashboard_overview (5-arg, with date window) — same seat re-source.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_group_dashboard_overview(p_institution_ids uuid[], p_admission_year_id uuid DEFAULT NULL::uuid, p_program_start_year integer DEFAULT NULL::integer, p_from_date date DEFAULT NULL::date, p_to_date date DEFAULT NULL::date)
 RETURNS TABLE(institution_id uuid, institution_name text, total_leads bigint, active_crm_leads bigint, lost_leads bigint, applied_learners bigint, active_learners bigint, rejected_learners bigint, total_seats bigint, filled_seats bigint, enrolled_leads bigint, seat_filled_learners bigint, fill_percentage numeric, enquiry_count bigint, enquiry_submitted_count bigint, account_count bigint, reserved_count bigint, admitted_count bigint, rejected_lifecycle_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH ay_scope AS (
    SELECT ay.id, ay.institution_id, ay.year
    FROM admission_years ay
    WHERE ay.institution_id = ANY(p_institution_ids)
      AND (
            (p_admission_year_id IS NOT NULL AND ay.id = p_admission_year_id)
         OR (p_admission_year_id IS NULL AND p_program_start_year IS NOT NULL
             AND ay.year = p_program_start_year)
         OR (p_admission_year_id IS NULL AND p_program_start_year IS NULL
             AND ay.is_active = true)
          )
  ),
  date_window AS (
    SELECT
      (p_from_date AT TIME ZONE 'Asia/Kolkata')       AS from_utc,
      ((p_to_date + 1) AT TIME ZONE 'Asia/Kolkata')   AS to_utc_exclusive
  ),
  lead_counts AS (
    SELECT
      al.institution_id,
      COUNT(*)                                                                           AS total,
      COUNT(*) FILTER (WHERE COALESCE(al.is_active, true) AND NOT COALESCE(al.is_lost, false)) AS active_crm,
      COUNT(*) FILTER (WHERE COALESCE(al.is_lost, false) OR al.funnel_stage::text IN ('lost','not_reachable')) AS lost,
      COUNT(*) FILTER (WHERE al.funnel_stage::text = 'application_started')              AS applied,
      COUNT(*) FILTER (WHERE al.funnel_stage::text = 'enrolled')                          AS active,
      COUNT(*) FILTER (WHERE al.funnel_stage::text = 'declined')                          AS rejected,
      COUNT(*) FILTER (WHERE al.funnel_stage::text = 'enrolled')                          AS filled
    FROM admission_leads al
    CROSS JOIN date_window dw
    WHERE al.institution_id = ANY(p_institution_ids)
      AND (
            (p_admission_year_id IS NOT NULL
             AND al.admission_year_id = p_admission_year_id)
         OR (p_admission_year_id IS NULL AND p_program_start_year IS NOT NULL
             AND ( al.admission_year_id IN (SELECT id FROM ay_scope)
                OR (al.admission_year_id IS NULL
                    AND EXTRACT(year FROM al.created_at)::int = p_program_start_year) ))
         OR (p_admission_year_id IS NULL AND p_program_start_year IS NULL)
          )
      AND (p_from_date IS NULL OR al.created_at >= dw.from_utc)
      AND (p_to_date IS NULL OR al.created_at <  dw.to_utc_exclusive)
    GROUP BY al.institution_id
  ),
  seat_filled_codes AS (
    SELECT code FROM admission_statuses
    WHERE scope = 'learner' AND is_active = true AND is_seat_filled = true
  ),
  learner_lifecycle_counts AS (
    SELECT
      lp.institution_id,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text IN (SELECT code FROM seat_filled_codes))  AS seat_filled,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text = 'enquiry')                              AS lc_enquiry,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text = 'enquiry_submitted')                    AS lc_enquiry_submitted,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text = 'account')                              AS lc_account,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text = 'reserved')                             AS lc_reserved,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text IN ('admitted', 'active'))                AS lc_admitted_plus_active,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text = 'rejected')                             AS lc_rejected
    FROM learners_profiles lp
    CROSS JOIN date_window dw
    WHERE lp.institution_id = ANY(p_institution_ids)
      AND (
            (p_admission_year_id IS NOT NULL
             AND lp.admission_year_id = p_admission_year_id)
         OR (p_admission_year_id IS NULL AND p_program_start_year IS NOT NULL
             AND lp.admission_year_id IN (SELECT id FROM ay_scope))
         OR (p_admission_year_id IS NULL AND p_program_start_year IS NULL)
          )
      AND (p_from_date IS NULL OR lp.created_at >= dw.from_utc)
      AND (p_to_date IS NULL OR lp.created_at <  dw.to_utc_exclusive)
    GROUP BY lp.institution_id
  ),
  seat_totals AS (
    SELECT p.institution_id, SUM(p.sanctioned_intake)::bigint AS total_seats
    FROM programs p
    WHERE COALESCE(p.is_active, true) = true
      AND p.institution_id = ANY(p_institution_ids)
    GROUP BY p.institution_id
  )
  SELECT
    i.id,
    i.name::text,
    COALESCE(lc.total,                              0)::bigint,
    COALESCE(lc.active_crm,                         0)::bigint,
    COALESCE(lc.lost,                               0)::bigint,
    COALESCE(lc.applied,                            0)::bigint,
    COALESCE(lc.active,                             0)::bigint,
    COALESCE(lc.rejected,                           0)::bigint,
    COALESCE(st.total_seats,                        0)::bigint,
    COALESCE(lc.filled,                             0)::bigint,
    COALESCE(lc.filled,                             0)::bigint,
    COALESCE(lrn.seat_filled,                       0)::bigint,
    CASE WHEN COALESCE(st.total_seats, 0) = 0 THEN 0::numeric
         ELSE ROUND(COALESCE(lc.filled, 0)::numeric / st.total_seats * 100, 1)
    END,
    COALESCE(lrn.lc_enquiry,                        0)::bigint,
    COALESCE(lrn.lc_enquiry_submitted,              0)::bigint,
    COALESCE(lrn.lc_account,                        0)::bigint,
    COALESCE(lrn.lc_reserved,                       0)::bigint,
    COALESCE(lrn.lc_admitted_plus_active,           0)::bigint,
    COALESCE(lrn.lc_rejected,                       0)::bigint
  FROM institutions i
  LEFT JOIN lead_counts             lc  ON lc.institution_id  = i.id
  LEFT JOIN learner_lifecycle_counts lrn ON lrn.institution_id = i.id
  LEFT JOIN seat_totals             st  ON st.institution_id  = i.id
  WHERE i.id = ANY(p_institution_ids)
    AND role_has_institution_access(i.id)
  ORDER BY i.name;
$function$;


-- -----------------------------------------------------------------------------
-- fn_aicte_annual_export
--   year_of_admission = ay.year. year_of_passing = ay.year + program duration
--   (programs already joined as pg via learners_profiles.program_id).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_aicte_annual_export(p_year integer)
 RETURNS SETOF cdc_aicte_annual_row
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    NULLIF(TRIM(COALESCE(lp.first_name, '') || ' ' || COALESCE(lp.last_name, '')), '')::text AS student_name,
    lp.register_number::text                                                          AS enrollment_number,
    lp.gender::text                                                                   AS gender,
    cc.name::text                                                                     AS category,
    CASE
      WHEN cc.code IN ('sc')                       THEN 'SC'
      WHEN cc.code IN ('st')                       THEN 'ST'
      WHEN cc.code IN ('bc','bcm','mbc','bc_cc')   THEN 'OBC'
      WHEN cc.code IN ('oc','not_applicable')      THEN 'GEN'
      WHEN cc.code IN ('sca','dnc','dnt')          THEN 'OBC'
      ELSE NULL
    END::text                                                                         AS social_category,
    pg.program_name::text                                                             AS program,
    d.department_name::text                                                           AS branch,
    ay.year::integer                                                                  AS year_of_admission,
    (ay.year + COALESCE(pg.program_duration_yrs, 0))::integer                         AS year_of_passing,
    r.name::text                                                                      AS company_name,
    s.display_name::text                                                              AS sector,
    p.offered_at::date                                                                AS offer_date,
    p.package_inr_total::numeric                                                      AS package_inr,
    p.job_location::text                                                              AS location,
    COALESCE(r.is_internal, false)::boolean                                           AS is_internal_placement
  FROM cdc_placements p
  LEFT JOIN learners_profiles lp           ON lp.id = p.learner_id
  LEFT JOIN programs pg                    ON pg.id = lp.program_id
  LEFT JOIN departments d                  ON d.id = pg.department_id
  LEFT JOIN cdc_recruiters r               ON r.id = p.recruiter_id
  LEFT JOIN cdc_industry_sectors s         ON s.id = r.industry_sector_id
  LEFT JOIN community_categories cc        ON cc.id = lp.community_category_id
  LEFT JOIN admission_years ay             ON ay.id = lp.admission_year_id
  WHERE p.status = 'accepted'
  ORDER BY p.accepted_at DESC;
$function$;


-- -----------------------------------------------------------------------------
-- fn_naac_5_2_1_export — same year_of_admission/year_of_passing re-source.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_naac_5_2_1_export(p_cycle text)
 RETURNS SETOF cdc_naac_5_2_1_row
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    NULLIF(TRIM(COALESCE(lp.first_name, '') || ' ' || COALESCE(lp.last_name, '')), '')::text AS student_name,
    lp.register_number::text                                                          AS register_number,
    lp.gender::text                                                                   AS gender,
    cc.name::text                                                                     AS category,
    NULL::text                                                                        AS parent_income_range,
    lp.permanent_address_district::text                                               AS district,
    lp.permanent_address_state::text                                                  AS state,
    pg.program_name::text                                                             AS program,
    ay.year::integer                                                                  AS year_of_admission,
    (ay.year + COALESCE(pg.program_duration_yrs, 0))::integer                         AS year_of_passing,
    NULL::numeric                                                                     AS cgpa,
    r.name::text                                                                      AS company_name,
    s.display_name::text                                                              AS sector,
    p.offered_at::date                                                                AS offer_date,
    p.joining_date::date                                                              AS joining_date,
    p.job_role::text                                                                  AS role_designation,
    p.package_lpa::numeric                                                            AS package_lpa,
    'INR'::text                                                                       AS package_currency,
    (ao.id IS NOT NULL)::boolean                                                      AS is_higher_studies,
    ao.institution_name::text                                                         AS higher_studies_institute,
    NULLIF(TRIM(COALESCE(ao.course_name, '') ||
                CASE WHEN ao.specialization IS NOT NULL AND ao.specialization <> ''
                     THEN ' - ' || ao.specialization
                     ELSE '' END), '')::text                                          AS higher_studies_program
  FROM cdc_placements p
  LEFT JOIN learners_profiles lp           ON lp.id = p.learner_id
  LEFT JOIN programs pg                    ON pg.id = lp.program_id
  LEFT JOIN cdc_recruiters r               ON r.id = p.recruiter_id
  LEFT JOIN cdc_industry_sectors s         ON s.id = r.industry_sector_id
  LEFT JOIN community_categories cc        ON cc.id = lp.community_category_id
  LEFT JOIN admission_years ay             ON ay.id = lp.admission_year_id
  LEFT JOIN alumni_outcomes ao             ON ao.learner_id = lp.id
                                          AND ao.outcome_type = 'higher_studies'
  WHERE p.status = 'accepted'
  ORDER BY p.accepted_at DESC;
$function$;


-- -----------------------------------------------------------------------------
-- fn_geography_analytics — cohort filter program_start_year -> year.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_geography_analytics(p_institution_ids uuid[], p_admission_year integer DEFAULT NULL::integer)
 RETURNS TABLE(institution_id uuid, institution_name text, state text, district text, taluk text, active_learners bigint)
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
    WHERE p_admission_year IS NOT NULL AND year = p_admission_year
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
$function$;


-- -----------------------------------------------------------------------------
-- fn_source_analytics — cohort filter program_start_year -> year.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_source_analytics(p_institution_ids uuid[], p_admission_year integer DEFAULT NULL::integer)
 RETURNS TABLE(institution_id uuid, institution_name text, source text, referral_type text, lead_count integer, enrolled_count integer, admitted_count integer, conversion_rate numeric, last_enrolled_at timestamp with time zone)
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
    WHERE p_admission_year IS NOT NULL
      AND year = p_admission_year
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
$function$;


-- -----------------------------------------------------------------------------
-- fn_yoy_admission_trajectory
--   program_resolution joins now hang off the fact row's own program FK:
--   organic via learners_profiles.program_id. admission_historical_pivot has no
--   program — its rows are attributed at institution+year grain, so the
--   "common courses" (≥2-year) filter is computed from the program-resolvable
--   sources (organic any year + historical's institution+year membership). To
--   preserve the year-cumulative output shape, historical prior years contribute
--   their full institution+year daily totals; the common-courses filter keeps an
--   institution's historical contribution only when that institution has at least
--   one program present in ≥2 of the 3 windowed years (organic or pivot).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_yoy_admission_trajectory(p_institution_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(out_year integer, out_day_n integer, out_cumulative_admitted bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_year int;
  v_years int[];
  v_lifecycle text[];
  v_min_year_count int := 2;
BEGIN
  v_lifecycle := public._yoy_admitted_lifecycle_set();

  SELECT MAX(ay.year) INTO v_current_year
  FROM admission_years ay
  WHERE ay.is_active = true;

  IF v_current_year IS NULL THEN
    RETURN;
  END IF;

  v_years := ARRAY[v_current_year - 2, v_current_year - 1, v_current_year];

  RETURN QUERY
  WITH
  program_resolution AS (
    SELECT
      p.id AS raw_id,
      p.institution_id,
      COALESCE(base.id, p.id) AS canonical_id
    FROM programs p
    LEFT JOIN programs base
      ON base.institution_id = p.institution_id
     AND base.program_id = REPLACE(p.program_id, '-SH', '')
     AND p.program_id LIKE '%-SH'
     AND base.program_id NOT LIKE '%-SH'
  ),
  -- Program-resolvable course inventory (organic only — historical has no program)
  organic_year_courses AS (
    SELECT DISTINCT
      ay.institution_id,
      pr.canonical_id AS program_id,
      ay.year AS yr
    FROM learners_profiles lp
    JOIN admission_years ay ON ay.id = lp.admission_year_id
    JOIN program_resolution pr ON pr.raw_id = lp.program_id
    WHERE ay.year = ANY(v_years)
      AND lp.lifecycle_status::text = ANY(v_lifecycle)
      AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
  ),
  common_courses AS (
    SELECT institution_id, program_id
    FROM organic_year_courses
    GROUP BY institution_id, program_id
    HAVING COUNT(DISTINCT yr) >= v_min_year_count
  ),
  -- Institutions that have at least one multi-year (common) course — used to gate
  -- the program-less historical contribution at institution grain.
  common_institutions AS (
    SELECT DISTINCT institution_id FROM common_courses
  ),
  organic_current AS (
    SELECT
      ay.year AS yr,
      (COALESCE(lp.activated_at, lp.created_at)::date
        - make_date(ay.year, 4, 1))::int AS day_n,
      COUNT(*)::bigint AS daily_count
    FROM learners_profiles lp
    JOIN admission_years ay ON ay.id = lp.admission_year_id
    JOIN program_resolution pr ON pr.raw_id = lp.program_id
    JOIN common_courses cc
      ON cc.institution_id = ay.institution_id
     AND cc.program_id = pr.canonical_id
    WHERE ay.year = v_current_year
      AND lp.lifecycle_status::text = ANY(v_lifecycle)
      AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
      AND COALESCE(lp.activated_at, lp.created_at) IS NOT NULL
    GROUP BY ay.year, day_n
  ),
  historical_prior AS (
    SELECT
      ay.year AS yr,
      (hp.admission_date - make_date(ay.year, 4, 1))::int AS day_n,
      SUM(hp.admitted_count)::bigint AS daily_count
    FROM admission_historical_pivot hp
    JOIN admission_years ay ON ay.id = hp.admission_year_id
    JOIN common_institutions ci ON ci.institution_id = ay.institution_id
    WHERE ay.year = ANY(v_years)
      AND ay.year < v_current_year
      AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
    GROUP BY ay.year, day_n
  ),
  organic_prior_fallback AS (
    -- Organic for prior years ONLY for (institution, year) tuples with no
    -- historical_pivot data, gated to common courses.
    SELECT
      ay.year AS yr,
      (COALESCE(lp.activated_at, lp.created_at)::date
        - make_date(ay.year, 4, 1))::int AS day_n,
      COUNT(*)::bigint AS daily_count
    FROM learners_profiles lp
    JOIN admission_years ay ON ay.id = lp.admission_year_id
    JOIN program_resolution pr ON pr.raw_id = lp.program_id
    JOIN common_courses cc
      ON cc.institution_id = ay.institution_id
     AND cc.program_id = pr.canonical_id
    WHERE ay.year = ANY(v_years)
      AND ay.year < v_current_year
      AND lp.lifecycle_status::text = ANY(v_lifecycle)
      AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
      AND COALESCE(lp.activated_at, lp.created_at) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM admission_historical_pivot hp2
        JOIN admission_years ay2 ON ay2.id = hp2.admission_year_id
        WHERE ay2.institution_id = ay.institution_id
          AND ay2.year = ay.year
      )
    GROUP BY ay.year, day_n
  ),
  combined_daily AS (
    SELECT * FROM organic_current
    UNION ALL
    SELECT * FROM historical_prior
    UNION ALL
    SELECT * FROM organic_prior_fallback
  ),
  daily_per_year AS (
    SELECT
      cd.yr,
      cd.day_n,
      SUM(cd.daily_count)::bigint AS daily
    FROM combined_daily cd
    GROUP BY cd.yr, cd.day_n
  )
  SELECT
    dpy.yr,
    dpy.day_n,
    SUM(dpy.daily) OVER (
      PARTITION BY dpy.yr
      ORDER BY dpy.day_n
    )::bigint AS cumulative
  FROM daily_per_year dpy
  ORDER BY dpy.yr, dpy.day_n;
END;
$function$;


-- -----------------------------------------------------------------------------
-- fn_yoy_drill_at_day
--   Organic counts resolve program via learners_profiles.program_id (full
--   program grain preserved). Historical pivot has no program, so its
--   by_program drill cannot be attributed to a program; the program drill is now
--   organic-only, while the institution drill includes historical. The
--   organic-overrides-historical NOT EXISTS is now keyed at institution+year.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_yoy_drill_at_day(p_year integer, p_day_n integer, p_institution_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(out_kind text, out_name text, out_cumulative bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lifecycle text[];
  v_cutoff_date date;
BEGIN
  v_lifecycle := public._yoy_admitted_lifecycle_set();
  v_cutoff_date := make_date(p_year, 4, 1) + p_day_n;

  RETURN QUERY
  WITH
  program_resolution AS (
    SELECT
      p.id AS raw_id,
      p.institution_id,
      COALESCE(base.id, p.id) AS canonical_id
    FROM programs p
    LEFT JOIN programs base
      ON base.institution_id = p.institution_id
     AND base.program_id = REPLACE(p.program_id, '-SH', '')
     AND p.program_id LIKE '%-SH'
     AND base.program_id NOT LIKE '%-SH'
  ),
  organic_counts AS (
    SELECT
      ay.institution_id,
      pr.canonical_id AS program_id,
      COUNT(*)::bigint AS cnt
    FROM learners_profiles lp
    JOIN admission_years ay ON ay.id = lp.admission_year_id
    JOIN program_resolution pr ON pr.raw_id = lp.program_id
    WHERE ay.year = p_year
      AND lp.lifecycle_status::text = ANY(v_lifecycle)
      AND COALESCE(lp.activated_at, lp.created_at)::date <= v_cutoff_date
      AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
    GROUP BY ay.institution_id, pr.canonical_id
  ),
  -- Historical pivot: institution+year grain only (no program). Used for the
  -- institution drill where no organic data exists for that institution+year.
  historical_counts AS (
    SELECT
      ay.institution_id,
      SUM(hp.admitted_count)::bigint AS cnt
    FROM admission_historical_pivot hp
    JOIN admission_years ay ON ay.id = hp.admission_year_id
    WHERE ay.year = p_year
      AND hp.admission_date <= v_cutoff_date
      AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
      AND NOT EXISTS (
        SELECT 1
        FROM learners_profiles lp2
        JOIN admission_years ay2 ON ay2.id = lp2.admission_year_id
        WHERE ay2.institution_id = ay.institution_id
          AND ay2.year = ay.year
          AND lp2.lifecycle_status::text = ANY(v_lifecycle)
      )
    GROUP BY ay.institution_id
  ),
  combined_inst AS (
    SELECT institution_id, cnt FROM organic_counts
    UNION ALL
    SELECT institution_id, cnt FROM historical_counts
  ),
  by_institution AS (
    SELECT
      'institution'::text AS kind,
      i.name::text AS name,
      SUM(c.cnt)::bigint AS cumulative
    FROM combined_inst c
    JOIN institutions i ON i.id = c.institution_id
    GROUP BY i.name
    ORDER BY SUM(c.cnt) DESC
    LIMIT 5
  ),
  by_program AS (
    SELECT
      'program'::text AS kind,
      (i.name || ' / ' || p.program_name)::text AS name,
      SUM(c.cnt)::bigint AS cumulative
    FROM organic_counts c
    JOIN programs p ON p.id = c.program_id
    JOIN institutions i ON i.id = c.institution_id
    GROUP BY i.name, p.program_name
    ORDER BY SUM(c.cnt) DESC
    LIMIT 5
  ),
  combined_drill AS (
    SELECT kind, name, cumulative FROM by_institution
    UNION ALL
    SELECT kind, name, cumulative FROM by_program
  )
  SELECT cd.kind, cd.name, cd.cumulative
  FROM combined_drill cd
  ORDER BY cd.kind, cd.cumulative DESC;
END;
$function$;


-- -----------------------------------------------------------------------------
-- fn_yoy_deposits_leaking
--   per_program now resolves program from the learner's own program_id, joining
--   programs directly. admission_years supplies only the year filter (ay.year).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_yoy_deposits_leaking(p_institution_id uuid DEFAULT NULL::uuid, p_top_n integer DEFAULT 5)
 RETURNS TABLE(out_program_id uuid, out_program_name text, out_institution_name text, out_reserved_count integer, out_admitted_count integer, out_stale_14d_count integer, out_avg_stale_days integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_year int;
BEGIN
  SELECT MAX(ay.year) INTO v_current_year
  FROM admission_years ay WHERE ay.is_active = true;
  IF v_current_year IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH per_program AS (
    SELECT
      p.id AS program_id,
      p.program_name,
      i.name AS institution_name,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text = 'reserved') AS reserved,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text IN ('admitted','active','graduated')) AS admitted,
      COUNT(*) FILTER (
        WHERE lp.lifecycle_status::text = 'reserved'
          AND lp.updated_at < NOW() - INTERVAL '14 days'
      ) AS stale_14d,
      AVG(EXTRACT(EPOCH FROM (NOW() - lp.updated_at)) / 86400.0)
        FILTER (WHERE lp.lifecycle_status::text = 'reserved') AS avg_stale_days_numeric
    FROM learners_profiles lp
    JOIN admission_years ay ON ay.id = lp.admission_year_id
    JOIN programs p ON p.id = lp.program_id
    JOIN institutions i ON i.id = lp.institution_id
    WHERE ay.year = v_current_year
      AND public._yoy_admission_institution(i.name)
      AND (p_institution_id IS NULL OR lp.institution_id = p_institution_id)
    GROUP BY p.id, p.program_name, i.name
    HAVING COUNT(*) FILTER (WHERE lp.lifecycle_status::text = 'reserved') > 0
  )
  SELECT
    pp.program_id AS out_program_id,
    pp.program_name::text AS out_program_name,
    pp.institution_name::text AS out_institution_name,
    pp.reserved::int AS out_reserved_count,
    pp.admitted::int AS out_admitted_count,
    pp.stale_14d::int AS out_stale_14d_count,
    COALESCE(pp.avg_stale_days_numeric, 0)::int AS out_avg_stale_days
  FROM per_program pp
  ORDER BY pp.stale_14d DESC, pp.reserved DESC
  LIMIT p_top_n;
END;
$function$;


-- -----------------------------------------------------------------------------
-- fn_yoy_excluded_courses
--   Course inventory is now program-resolvable from organic only (historical has
--   no program). The "single year only" exclusion now reflects programs that
--   appear in learners for only one of the windowed years.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_yoy_excluded_courses(p_institution_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(out_institution_id uuid, out_institution_name text, out_program_id uuid, out_program_name text, out_years_with_data integer[], out_exclusion_reason text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_year int;
  v_years int[];
  v_lifecycle text[];
  v_min_year_count int := 2;
BEGIN
  v_lifecycle := public._yoy_admitted_lifecycle_set();

  SELECT MAX(ay.year) INTO v_current_year
  FROM admission_years ay
  WHERE ay.is_active = true;
  IF v_current_year IS NULL THEN RETURN; END IF;

  v_years := ARRAY[v_current_year - 2, v_current_year - 1, v_current_year];

  RETURN QUERY
  WITH
  program_resolution AS (
    SELECT
      p.id AS raw_id,
      p.institution_id,
      COALESCE(base.id, p.id) AS canonical_id
    FROM programs p
    LEFT JOIN programs base
      ON base.institution_id = p.institution_id
     AND base.program_id = REPLACE(p.program_id, '-SH', '')
     AND p.program_id LIKE '%-SH'
     AND base.program_id NOT LIKE '%-SH'
  ),
  organic_year_courses AS (
    SELECT DISTINCT
      ay.institution_id,
      pr.canonical_id AS program_id,
      ay.year AS yr
    FROM learners_profiles lp
    JOIN admission_years ay ON ay.id = lp.admission_year_id
    JOIN program_resolution pr ON pr.raw_id = lp.program_id
    WHERE ay.year = ANY(v_years)
      AND lp.lifecycle_status::text = ANY(v_lifecycle)
      AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
  ),
  course_year_set AS (
    SELECT
      ayc.institution_id,
      ayc.program_id,
      ARRAY_AGG(DISTINCT ayc.yr ORDER BY ayc.yr) AS years_with_data
    FROM organic_year_courses ayc
    GROUP BY ayc.institution_id, ayc.program_id
  )
  SELECT
    cys.institution_id,
    i.name::text AS institution_name,
    cys.program_id,
    p.program_name::text AS program_name,
    cys.years_with_data,
    CASE
      WHEN ARRAY_LENGTH(cys.years_with_data, 1) = 1 THEN 'single_year_only'::text
      ELSE 'unknown_reason'::text
    END AS exclusion_reason
  FROM course_year_set cys
  JOIN institutions i ON i.id = cys.institution_id
  JOIN programs p ON p.id = cys.program_id
  WHERE ARRAY_LENGTH(cys.years_with_data, 1) < v_min_year_count
  ORDER BY i.name, p.program_name;
END;
$function$;


-- -----------------------------------------------------------------------------
-- fn_yoy_institution_health_signals
--   sanctioned_intake re-sourced from programs (institution sum of active
--   programs). All ay.program_start_year -> ay.year. Institution-grain joins
--   for current/reserved/prior are unchanged.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_yoy_institution_health_signals(p_institution_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(out_institution_id uuid, out_institution_name text, out_sanctioned_intake integer, out_current_admitted integer, out_prior_year_admitted_same_day integer, out_prior_year_final integer, out_fill_pct_current numeric, out_fill_pct_prior_same_day numeric, out_reserved_count integer, out_stale_reserved_count integer, out_signal text, out_pace_delta_pct numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lifecycle text[];
  v_current_year int;
  v_prior_year int;
  v_today_day_n int;
BEGIN
  v_lifecycle := public._yoy_admitted_lifecycle_set();
  SELECT MAX(ay.year) INTO v_current_year
  FROM admission_years ay WHERE ay.is_active = true;
  IF v_current_year IS NULL THEN RETURN; END IF;
  v_prior_year := v_current_year - 1;
  v_today_day_n := CURRENT_DATE - make_date(v_current_year, 4, 1);

  RETURN QUERY
  WITH
  -- Sanctioned seats per institution from programs (year-agnostic).
  intake_per_inst AS (
    SELECT p.institution_id, SUM(p.sanctioned_intake)::int AS intake
    FROM programs p
    WHERE COALESCE(p.is_active, true) = true
    GROUP BY p.institution_id
  ),
  current_admitted_per_inst AS (
    SELECT ay.institution_id, COUNT(lp.id)::int AS admitted
    FROM learners_profiles lp
    JOIN admission_years ay ON ay.id = lp.admission_year_id
    WHERE ay.year = v_current_year
      AND lp.lifecycle_status::text = ANY(v_lifecycle)
    GROUP BY ay.institution_id
  ),
  reserved_per_inst AS (
    SELECT ay.institution_id,
           COUNT(*) FILTER (WHERE lp.lifecycle_status::text = 'reserved')::int AS reserved,
           COUNT(*) FILTER (
             WHERE lp.lifecycle_status::text = 'reserved'
               AND lp.updated_at < NOW() - INTERVAL '10 days'
           )::int AS stale_reserved
    FROM learners_profiles lp
    JOIN admission_years ay ON ay.id = lp.admission_year_id
    WHERE ay.year = v_current_year
    GROUP BY ay.institution_id
  ),
  prior_at_same_day AS (
    SELECT ay.institution_id,
           SUM(hp.admitted_count)::int AS cumulative_at_today_dayn
    FROM admission_historical_pivot hp
    JOIN admission_years ay ON ay.id = hp.admission_year_id
    WHERE ay.year = v_prior_year
      AND hp.admission_date <= make_date(v_prior_year, 4, 1) + v_today_day_n
    GROUP BY ay.institution_id
  ),
  prior_final AS (
    SELECT ay.institution_id, SUM(hp.admitted_count)::int AS total
    FROM admission_historical_pivot hp
    JOIN admission_years ay ON ay.id = hp.admission_year_id
    WHERE ay.year = v_prior_year
    GROUP BY ay.institution_id
  )
  SELECT
    i.id AS out_institution_id,
    i.name::text AS out_institution_name,
    COALESCE(ipi.intake, 0) AS out_sanctioned_intake,
    COALESCE(cap.admitted, 0) AS out_current_admitted,
    COALESCE(pasd.cumulative_at_today_dayn, 0) AS out_prior_year_admitted_same_day,
    COALESCE(pf.total, 0) AS out_prior_year_final,
    CASE
      WHEN COALESCE(ipi.intake, 0) > 0
      THEN ROUND((COALESCE(cap.admitted, 0)::numeric / ipi.intake) * 100, 1)
      ELSE NULL
    END AS out_fill_pct_current,
    CASE
      WHEN COALESCE(ipi.intake, 0) > 0
      THEN ROUND((COALESCE(pasd.cumulative_at_today_dayn, 0)::numeric / ipi.intake) * 100, 1)
      ELSE NULL
    END AS out_fill_pct_prior_same_day,
    COALESCE(rpi.reserved, 0) AS out_reserved_count,
    COALESCE(rpi.stale_reserved, 0) AS out_stale_reserved_count,
    CASE
      WHEN COALESCE(ipi.intake, 0) = 0 THEN 'NA'
      WHEN (COALESCE(cap.admitted, 0)::numeric / NULLIF(ipi.intake, 0)) * 100 <
           (COALESCE(pasd.cumulative_at_today_dayn, 0)::numeric / NULLIF(ipi.intake, 0)) * 100 - 15
           OR COALESCE(rpi.stale_reserved, 0) > 20
        THEN 'RED'
      WHEN (COALESCE(cap.admitted, 0)::numeric / NULLIF(ipi.intake, 0)) * 100 <
           (COALESCE(pasd.cumulative_at_today_dayn, 0)::numeric / NULLIF(ipi.intake, 0)) * 100 - 5
           OR COALESCE(rpi.stale_reserved, 0) > 10
        THEN 'AMBER'
      ELSE 'GREEN'
    END AS out_signal,
    CASE
      WHEN COALESCE(ipi.intake, 0) > 0
      THEN ROUND(
        ((COALESCE(cap.admitted, 0)::numeric / ipi.intake) * 100) -
        ((COALESCE(pasd.cumulative_at_today_dayn, 0)::numeric / ipi.intake) * 100),
        1)
      ELSE NULL
    END AS out_pace_delta_pct
  FROM institutions i
  LEFT JOIN intake_per_inst ipi ON ipi.institution_id = i.id
  LEFT JOIN current_admitted_per_inst cap ON cap.institution_id = i.id
  LEFT JOIN reserved_per_inst rpi ON rpi.institution_id = i.id
  LEFT JOIN prior_at_same_day pasd ON pasd.institution_id = i.id
  LEFT JOIN prior_final pf ON pf.institution_id = i.id
  WHERE public._yoy_admission_institution(i.name)
    AND (p_institution_id IS NULL OR i.id = p_institution_id)
  ORDER BY
    CASE
      WHEN COALESCE(ipi.intake, 0) = 0 THEN 4
      WHEN (COALESCE(cap.admitted, 0)::numeric / NULLIF(ipi.intake, 0)) * 100 <
           (COALESCE(pasd.cumulative_at_today_dayn, 0)::numeric / NULLIF(ipi.intake, 0)) * 100 - 15
           OR COALESCE(rpi.stale_reserved, 0) > 20 THEN 1
      WHEN (COALESCE(cap.admitted, 0)::numeric / NULLIF(ipi.intake, 0)) * 100 <
           (COALESCE(pasd.cumulative_at_today_dayn, 0)::numeric / NULLIF(ipi.intake, 0)) * 100 - 5
           OR COALESCE(rpi.stale_reserved, 0) > 10 THEN 2
      ELSE 3
    END,
    i.name;
END;
$function$;


-- -----------------------------------------------------------------------------
-- fn_yoy_per_category_trajectory
--   Category requires program_name, so categorisation is organic-only (program
--   via learners_profiles.program_id). Historical pivot has no program/category;
--   prior-year history can only be supplied where organic data exists (used as
--   the organic-current/prior path). Pure-historical prior years without organic
--   rows therefore cannot be categorised and are not emitted. The pivot is still
--   consulted only to decide organic-prior fallback eligibility (institution+year).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_yoy_per_category_trajectory(p_institution_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(out_category text, out_year integer, out_day_n integer, out_cumulative_admitted bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lifecycle text[];
  v_current_year int;
  v_years int[];
BEGIN
  v_lifecycle := public._yoy_admitted_lifecycle_set();
  SELECT MAX(ay.year) INTO v_current_year
  FROM admission_years ay WHERE ay.is_active = true;
  IF v_current_year IS NULL THEN RETURN; END IF;
  v_years := ARRAY[v_current_year - 2, v_current_year - 1, v_current_year];

  RETURN QUERY
  WITH
  program_resolution AS (
    SELECT p.id AS raw_id, p.institution_id, p.program_name,
           COALESCE(base.id, p.id) AS canonical_id
    FROM programs p
    LEFT JOIN programs base
      ON base.institution_id = p.institution_id
     AND base.program_id = REPLACE(p.program_id, '-SH', '')
     AND p.program_id LIKE '%-SH'
     AND base.program_id NOT LIKE '%-SH'
  ),
  organic_current_raw AS (
    SELECT
      public._yoy_program_category(i.name, pr.program_name) AS category,
      ay.year AS yr,
      (COALESCE(lp.activated_at, lp.created_at)::date
        - make_date(ay.year, 4, 1))::int AS day_n
    FROM learners_profiles lp
    JOIN admission_years ay ON ay.id = lp.admission_year_id
    JOIN program_resolution pr ON pr.raw_id = lp.program_id
    JOIN institutions i ON i.id = ay.institution_id
    WHERE ay.year = v_current_year
      AND lp.lifecycle_status::text = ANY(v_lifecycle)
      AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
      AND COALESCE(lp.activated_at, lp.created_at) IS NOT NULL
  ),
  organic_current AS (
    SELECT category, yr, day_n, COUNT(*)::bigint AS daily_count
    FROM organic_current_raw
    GROUP BY category, yr, day_n
  ),
  organic_prior_raw AS (
    -- Prior years are now organic-only (historical pivot has no program/category).
    SELECT
      public._yoy_program_category(i.name, pr.program_name) AS category,
      ay.year AS yr,
      (COALESCE(lp.activated_at, lp.created_at)::date
        - make_date(ay.year, 4, 1))::int AS day_n
    FROM learners_profiles lp
    JOIN admission_years ay ON ay.id = lp.admission_year_id
    JOIN program_resolution pr ON pr.raw_id = lp.program_id
    JOIN institutions i ON i.id = ay.institution_id
    WHERE ay.year = ANY(v_years)
      AND ay.year < v_current_year
      AND lp.lifecycle_status::text = ANY(v_lifecycle)
      AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
      AND COALESCE(lp.activated_at, lp.created_at) IS NOT NULL
  ),
  organic_prior AS (
    SELECT category, yr, day_n, COUNT(*)::bigint AS daily_count
    FROM organic_prior_raw
    GROUP BY category, yr, day_n
  ),
  combined AS (
    SELECT * FROM organic_current
    UNION ALL
    SELECT * FROM organic_prior
  ),
  daily_per_cat_year AS (
    SELECT category, yr, day_n, SUM(daily_count)::bigint AS daily
    FROM combined GROUP BY category, yr, day_n
  )
  SELECT
    dcy.category,
    dcy.yr,
    dcy.day_n,
    SUM(dcy.daily) OVER (PARTITION BY dcy.category, dcy.yr ORDER BY dcy.day_n)::bigint
  FROM daily_per_cat_year dcy
  ORDER BY dcy.category, dcy.yr, dcy.day_n;
END;
$function$;


-- -----------------------------------------------------------------------------
-- fn_yoy_per_institution_trajectory
--   Output is institution+day_n: program resolution was never needed for the
--   output, only as a (now-broken) join on ay.program_id. Organic resolves
--   institution from learners_profiles.admission_year_id -> ay.institution_id;
--   historical from the pivot's ay.institution_id. Both at institution+year grain.
--   organic-prior fallback NOT EXISTS keyed on institution+year.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_yoy_per_institution_trajectory(p_year integer, p_institution_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(out_institution_id uuid, out_institution_name text, out_day_n integer, out_cumulative_admitted bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lifecycle text[];
  v_current_year int;
BEGIN
  v_lifecycle := public._yoy_admitted_lifecycle_set();
  SELECT MAX(ay.year) INTO v_current_year
  FROM admission_years ay WHERE ay.is_active = true;

  RETURN QUERY
  WITH
  organic_current AS (
    SELECT
      ay.institution_id,
      (COALESCE(lp.activated_at, lp.created_at)::date
        - make_date(ay.year, 4, 1))::int AS day_n,
      COUNT(*)::bigint AS daily_count
    FROM learners_profiles lp
    JOIN admission_years ay ON ay.id = lp.admission_year_id
    WHERE ay.year = p_year
      AND p_year = v_current_year
      AND lp.lifecycle_status::text = ANY(v_lifecycle)
      AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
      AND COALESCE(lp.activated_at, lp.created_at) IS NOT NULL
    GROUP BY ay.institution_id, day_n
  ),
  historical_prior AS (
    SELECT
      ay.institution_id,
      (hp.admission_date - make_date(ay.year, 4, 1))::int AS day_n,
      SUM(hp.admitted_count)::bigint AS daily_count
    FROM admission_historical_pivot hp
    JOIN admission_years ay ON ay.id = hp.admission_year_id
    WHERE ay.year = p_year
      AND p_year < v_current_year
      AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
    GROUP BY ay.institution_id, day_n
  ),
  organic_prior_fallback AS (
    SELECT
      ay.institution_id,
      (COALESCE(lp.activated_at, lp.created_at)::date
        - make_date(ay.year, 4, 1))::int AS day_n,
      COUNT(*)::bigint AS daily_count
    FROM learners_profiles lp
    JOIN admission_years ay ON ay.id = lp.admission_year_id
    WHERE ay.year = p_year
      AND p_year < v_current_year
      AND lp.lifecycle_status::text = ANY(v_lifecycle)
      AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
      AND COALESCE(lp.activated_at, lp.created_at) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM admission_historical_pivot hp2
        JOIN admission_years ay2 ON ay2.id = hp2.admission_year_id
        WHERE ay2.institution_id = ay.institution_id
          AND ay2.year = ay.year
      )
    GROUP BY ay.institution_id, day_n
  ),
  combined AS (
    SELECT * FROM organic_current
    UNION ALL
    SELECT * FROM historical_prior
    UNION ALL
    SELECT * FROM organic_prior_fallback
  ),
  daily_per_inst AS (
    SELECT institution_id, day_n, SUM(daily_count)::bigint AS daily
    FROM combined GROUP BY institution_id, day_n
  )
  SELECT
    dpi.institution_id,
    i.name::text,
    dpi.day_n,
    SUM(dpi.daily) OVER (PARTITION BY dpi.institution_id ORDER BY dpi.day_n)::bigint
  FROM daily_per_inst dpi
  JOIN institutions i ON i.id = dpi.institution_id
  ORDER BY i.name, dpi.day_n;
END;
$function$;


-- -----------------------------------------------------------------------------
-- fn_yoy_counselor_accountability_grid — MAX(ay.program_start_year) -> ay.year.
--   (v_current_year is computed but the body only uses lead funnel data; the
--    rename keeps the guard intact.)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_yoy_counselor_accountability_grid(p_institution_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(out_institution_id uuid, out_institution_name text, out_counselor_id uuid, out_counselor_name text, out_stale_reserved_count integer, out_total_reserved_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_year int;
BEGIN
  SELECT MAX(ay.year) INTO v_current_year
  FROM admission_years ay WHERE ay.is_active = true;
  IF v_current_year IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH stale_leads AS (
    SELECT
      al.institution_id,
      COALESCE(al.assigned_counselor_id, al.counselor_id) AS counselor_id,
      COUNT(*) FILTER (WHERE COALESCE(al.last_activity_at, al.created_at) < NOW() - INTERVAL '10 days') AS stale_cnt,
      COUNT(*) AS total_cnt
    FROM admission_leads al
    JOIN institutions i_filter ON i_filter.id = al.institution_id
    WHERE al.is_active = true
      AND al.funnel_stage::text IN ('reserved','admitted')
      AND public._yoy_admission_institution(i_filter.name)
      AND (p_institution_id IS NULL OR al.institution_id = p_institution_id)
    GROUP BY al.institution_id, COALESCE(al.assigned_counselor_id, al.counselor_id)
  )
  SELECT
    i.id AS out_institution_id,
    i.name::text AS out_institution_name,
    sl.counselor_id AS out_counselor_id,
    COALESCE(c.name, 'Unassigned')::text AS out_counselor_name,
    sl.stale_cnt::int AS out_stale_reserved_count,
    sl.total_cnt::int AS out_total_reserved_count
  FROM stale_leads sl
  JOIN institutions i ON i.id = sl.institution_id
  LEFT JOIN admission_counselors c ON c.id = sl.counselor_id
  WHERE sl.stale_cnt > 0
  ORDER BY sl.stale_cnt DESC;
END;
$function$;


-- -----------------------------------------------------------------------------
-- fn_yoy_days_to_catchup_per_institution — all ay.program_start_year -> ay.year.
--   (Institution-grain joins only; no program/seat dependency.)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_yoy_days_to_catchup_per_institution(p_institution_id uuid DEFAULT NULL::uuid, p_window_end_month integer DEFAULT 8, p_window_end_day integer DEFAULT 31)
 RETURNS TABLE(out_institution_id uuid, out_institution_name text, out_current_admitted integer, out_prior_final integer, out_gap integer, out_daily_pace_last_7d numeric, out_days_to_catchup integer, out_days_remaining integer, out_signal text, out_projected_final integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lifecycle text[];
  v_current_year int;
  v_prior_year int;
  v_window_end_date date;
  v_days_remaining int;
BEGIN
  v_lifecycle := public._yoy_admitted_lifecycle_set();

  SELECT MAX(ay.year) INTO v_current_year
  FROM admission_years ay WHERE ay.is_active = true;
  IF v_current_year IS NULL THEN RETURN; END IF;
  v_prior_year := v_current_year - 1;

  v_window_end_date := make_date(v_current_year, p_window_end_month, p_window_end_day);
  v_days_remaining := GREATEST(v_window_end_date - CURRENT_DATE, 0);

  RETURN QUERY
  WITH
  current_admitted_per_inst AS (
    SELECT ay.institution_id, COUNT(lp.id)::int AS admitted
    FROM learners_profiles lp
    JOIN admission_years ay ON ay.id = lp.admission_year_id
    WHERE ay.year = v_current_year
      AND lp.lifecycle_status::text = ANY(v_lifecycle)
    GROUP BY ay.institution_id
  ),
  prior_final AS (
    SELECT ay.institution_id, SUM(hp.admitted_count)::int AS total
    FROM admission_historical_pivot hp
    JOIN admission_years ay ON ay.id = hp.admission_year_id
    WHERE ay.year = v_prior_year
    GROUP BY ay.institution_id
  ),
  pace_per_inst AS (
    SELECT ay.institution_id,
           COUNT(*)::int AS incremental_last_7d
    FROM learners_profiles lp
    JOIN admission_years ay ON ay.id = lp.admission_year_id
    WHERE ay.year = v_current_year
      AND lp.lifecycle_status::text = ANY(v_lifecycle)
      AND COALESCE(lp.activated_at, lp.created_at) >= (CURRENT_DATE - INTERVAL '7 days')
      AND COALESCE(lp.activated_at, lp.created_at) <= (CURRENT_DATE + INTERVAL '1 day')
    GROUP BY ay.institution_id
  )
  SELECT
    i.id AS out_institution_id,
    i.name::text AS out_institution_name,
    COALESCE(cap.admitted, 0) AS out_current_admitted,
    COALESCE(pf.total, 0) AS out_prior_final,
    (COALESCE(pf.total, 0) - COALESCE(cap.admitted, 0)) AS out_gap,
    GREATEST(COALESCE(ppi.incremental_last_7d, 0)::numeric / 7.0, 0.1)
      AS out_daily_pace_last_7d,
    CASE
      WHEN COALESCE(pf.total, 0) - COALESCE(cap.admitted, 0) <= 0 THEN NULL::int
      ELSE CEIL(
        (COALESCE(pf.total, 0) - COALESCE(cap.admitted, 0))::numeric
        / GREATEST(COALESCE(ppi.incremental_last_7d, 0)::numeric / 7.0, 0.1)
      )::int
    END AS out_days_to_catchup,
    v_days_remaining AS out_days_remaining,
    CASE
      WHEN COALESCE(pf.total, 0) = 0 THEN 'NA'
      WHEN COALESCE(pf.total, 0) - COALESCE(cap.admitted, 0) <= 0 THEN 'GREEN'
      WHEN CEIL(
             (COALESCE(pf.total, 0) - COALESCE(cap.admitted, 0))::numeric
             / GREATEST(COALESCE(ppi.incremental_last_7d, 0)::numeric / 7.0, 0.1)
           ) <= v_days_remaining * 0.7
        THEN 'GREEN'
      WHEN CEIL(
             (COALESCE(pf.total, 0) - COALESCE(cap.admitted, 0))::numeric
             / GREATEST(COALESCE(ppi.incremental_last_7d, 0)::numeric / 7.0, 0.1)
           ) <= v_days_remaining
        THEN 'AMBER'
      ELSE 'RED'
    END AS out_signal,
    (
      COALESCE(cap.admitted, 0)
      + ROUND(
          GREATEST(COALESCE(ppi.incremental_last_7d, 0)::numeric / 7.0, 0.1)
          * v_days_remaining
        )
    )::int AS out_projected_final
  FROM institutions i
  LEFT JOIN current_admitted_per_inst cap ON cap.institution_id = i.id
  LEFT JOIN prior_final pf ON pf.institution_id = i.id
  LEFT JOIN pace_per_inst ppi ON ppi.institution_id = i.id
  WHERE public._yoy_admission_institution(i.name)
    AND (p_institution_id IS NULL OR i.id = p_institution_id)
  ORDER BY
    CASE
      WHEN COALESCE(pf.total, 0) = 0 THEN 4
      WHEN COALESCE(pf.total, 0) - COALESCE(cap.admitted, 0) <= 0 THEN 3
      WHEN CEIL(
             (COALESCE(pf.total, 0) - COALESCE(cap.admitted, 0))::numeric
             / GREATEST(COALESCE(ppi.incremental_last_7d, 0)::numeric / 7.0, 0.1)
           ) <= v_days_remaining * 0.7
        THEN 3
      WHEN CEIL(
             (COALESCE(pf.total, 0) - COALESCE(cap.admitted, 0))::numeric
             / GREATEST(COALESCE(ppi.incremental_last_7d, 0)::numeric / 7.0, 0.1)
           ) <= v_days_remaining
        THEN 2
      ELSE 1
    END,
    (COALESCE(pf.total, 0) - COALESCE(cap.admitted, 0)) DESC,
    i.name;
END;
$function$;
