-- Migration: 2026-05-02
-- Phase C-3: Align fn_seat_analytics_daily_pivot with get_seat_analytics so
-- the Daily Pivot tab and Summary tab show the same Filled / Balance / Fill%
-- numbers per program.
--
-- Three changes:
--   1. FK-based join: switch lp.admission_year integer = p_admission_year to
--      lp.admission_year_id IN (target admission_years rows). Phase A 2026-05-02
--      backfilled FKs for every linkable learner.
--   2. Lifecycle set: add 'account' to ('admitted','active','graduated') so it
--      matches the Summary tab.
--   3. Drop the ay.is_active = true filter — historical cohorts catalogued by
--      Phase A as is_active=false must remain queryable when a year is supplied.

DROP FUNCTION IF EXISTS public.fn_seat_analytics_daily_pivot(uuid[], integer, boolean);

CREATE OR REPLACE FUNCTION public.fn_seat_analytics_daily_pivot(
  p_institution_ids       uuid[],
  p_admission_year        integer,
  p_exclude_bulk_migrated boolean DEFAULT false
)
RETURNS TABLE(
  institution_id    uuid,
  institution_name  text,
  program_id        uuid,
  program_short     text,
  program_name      text,
  course_short      text,
  stream            text,
  level             text,
  is_lateral        boolean,
  study_year        text,
  group_label       text,
  group_sort_key    text,
  intake            integer,
  filled            integer,
  balance           integer,
  fill_percentage   numeric,
  daily_counts      jsonb
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
    -- All admission_years rows for the requested cohort year, regardless of
    -- is_active. Historical cohorts (Phase A 2026-05-02) are inactive but must
    -- remain queryable.
    SELECT
      ay.id,
      ay.institution_id,
      ay.program_id,
      ay.program_start_year,
      ay.program_end_year,
      ay.sanctioned_intake
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
      AND lp.lifecycle_status::text IN ('admitted','active','graduated','account')
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
    GREATEST(pp.intake_total - pp.filled, 0)                  AS balance,
    CASE WHEN pp.intake_total = 0 THEN 0::numeric
         ELSE ROUND(pp.filled::numeric / pp.intake_total * 100, 2)
    END                                                       AS fill_percentage,
    COALESCE(pp.daily_counts, '{}'::jsonb)                    AS daily_counts
  FROM per_program pp
  ORDER BY group_sort_key, course_short;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_seat_analytics_daily_pivot(uuid[], integer, boolean) TO authenticated;
