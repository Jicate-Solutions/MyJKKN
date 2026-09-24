-- BUG-004351 — the daily pivot merged first-year and lateral-entry seats into one row.
--
-- fn_seat_analytics_daily_pivot keyed every CTE on program_resolution.resolved_id,
-- which maps a `-SH` lateral program onto its base program. So CSE (intake 6) and
-- CSE-SH (intake 60) collapsed into a single row of 66 seats whose admitted count
-- was both cohorts summed, and bool_or(is_lateral_variant) then labelled that row
-- '… - LATERAL ENTRY - II YEAR'. The grid groups by group_label, so Engineering had
-- no first-year block at all.
--
-- Fix: carry is_lateral_variant through as part of the grouping key everywhere
-- resolved_id is used, and label each row from its own variant flag instead of
-- bool_or. resolved_id still drives the display join, so the two rows share a
-- course name and differ only by entry type — which is what the report asks for.
--
-- Signature and column list are unchanged, so no client change is needed.

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
      -- lateral when this program is a -SH variant sitting on top of a base program
      (base.id IS NOT NULL)   AS is_lateral_variant
    FROM programs p
    LEFT JOIN programs base
      ON p.program_id LIKE '%-SH'
     AND base.program_id = regexp_replace(p.program_id, '-SH$', '')
     AND base.program_id NOT LIKE '%-SH'
     AND base.institution_id = p.institution_id
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
      pr.resolved_id        AS program_id,
      pr.is_lateral_variant AS is_lateral_variant
    FROM programs p
    JOIN program_resolution pr ON pr.original_id = p.id
    WHERE p.institution_id IN (SELECT id FROM eligible_institutions)
      AND COALESCE(p.is_active, true) = true
  ),
  lp_anchor AS (
    SELECT DISTINCT
      lp.institution_id,
      pr.resolved_id        AS program_id,
      pr.is_lateral_variant AS is_lateral_variant
    FROM learners_profiles lp
    JOIN programs p            ON p.id = lp.program_id
    JOIN program_resolution pr ON pr.original_id = lp.program_id
    WHERE lp.institution_id IN (SELECT id FROM eligible_institutions)
      AND lp.admission_year_id IN (SELECT id FROM target_ays)
      AND lp.lifecycle_status::text IN ('admitted','active','graduated','account','reserved')
      AND COALESCE(p.is_active, true) = true
  ),
  anchor AS (
    SELECT institution_id, program_id, is_lateral_variant FROM program_anchor
    UNION
    SELECT institution_id, program_id, is_lateral_variant FROM lp_anchor
  ),
  -- sanctioned intake per (resolved program, entry type) — no longer summed across variants
  intake_per_program AS (
    SELECT
      p.institution_id,
      pr.resolved_id        AS program_id,
      pr.is_lateral_variant AS is_lateral_variant,
      SUM(p.sanctioned_intake)::int AS intake_total
    FROM programs p
    JOIN program_resolution pr ON pr.original_id = p.id
    WHERE p.institution_id IN (SELECT id FROM eligible_institutions)
      AND COALESCE(p.is_active, true) = true
    GROUP BY p.institution_id, pr.resolved_id, pr.is_lateral_variant
  ),
  reserved_per_program AS (
    SELECT
      lp.institution_id,
      pr.resolved_id        AS program_id,
      pr.is_lateral_variant AS is_lateral_variant,
      COUNT(*)::int AS reserved_total
    FROM learners_profiles lp
    JOIN program_resolution pr ON pr.original_id = lp.program_id
    WHERE lp.institution_id IN (SELECT id FROM eligible_institutions)
      AND lp.admission_year_id IN (SELECT id FROM target_ays)
      AND lp.lifecycle_status::text = 'reserved'
      AND (NOT p_exclude_bulk_migrated OR lp.migrated_at IS NULL)
    GROUP BY lp.institution_id, pr.resolved_id, pr.is_lateral_variant
  ),
  filled_per_day AS (
    SELECT
      lp.institution_id,
      pr.resolved_id        AS program_id,
      pr.is_lateral_variant AS is_lateral_variant,
      (COALESCE(lp.activated_at, lp.created_at) AT TIME ZONE 'Asia/Kolkata')::date AS admit_date,
      COUNT(*)::int AS cnt
    FROM learners_profiles lp
    JOIN program_resolution pr ON pr.original_id = lp.program_id
    WHERE lp.institution_id IN (SELECT id FROM eligible_institutions)
      AND lp.admission_year_id IN (SELECT id FROM target_ays)
      AND lp.lifecycle_status::text IN ('admitted','active','graduated','account')
      AND (NOT p_exclude_bulk_migrated OR lp.migrated_at IS NULL)
    GROUP BY lp.institution_id, pr.resolved_id, pr.is_lateral_variant,
             (COALESCE(lp.activated_at, lp.created_at) AT TIME ZONE 'Asia/Kolkata')::date
  ),
  per_program AS (
    SELECT
      a.institution_id,
      i.name           AS institution_name,
      i.counselling_code,
      a.program_id,
      a.is_lateral_variant,
      p.program_id     AS program_short,
      p.program_name,
      d.degree_type,
      dept.department_code,
      COALESCE(ipp.intake_total, 0)         AS intake_total,
      COALESCE(SUM(fpd.cnt), 0)::int        AS filled,
      COALESCE(rpp.reserved_total, 0)       AS reserved,
      jsonb_object_agg(fpd.admit_date::text, fpd.cnt)
        FILTER (WHERE fpd.admit_date IS NOT NULL) AS daily_counts
    FROM anchor a
    JOIN institutions i        ON i.id    = a.institution_id
    JOIN programs p            ON p.id    = a.program_id
    LEFT JOIN intake_per_program ipp
      ON ipp.institution_id = a.institution_id
     AND ipp.program_id = a.program_id
     AND ipp.is_lateral_variant = a.is_lateral_variant
    LEFT JOIN reserved_per_program rpp
      ON rpp.institution_id = a.institution_id
     AND rpp.program_id = a.program_id
     AND rpp.is_lateral_variant = a.is_lateral_variant
    LEFT JOIN degrees d        ON d.id    = p.degree_id
    LEFT JOIN departments dept ON dept.id = p.department_id
    LEFT JOIN filled_per_day fpd
      ON fpd.institution_id = a.institution_id
     AND fpd.program_id = a.program_id
     AND fpd.is_lateral_variant = a.is_lateral_variant
    GROUP BY
      a.institution_id, i.name, i.counselling_code,
      a.program_id, a.is_lateral_variant,
      p.program_id, p.program_name, d.degree_type, dept.department_code,
      ipp.intake_total, rpp.reserved_total
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
    pp.is_lateral_variant                                     AS is_lateral,
    CASE WHEN pp.is_lateral_variant THEN 'II YEAR' ELSE 'I YEAR' END AS study_year,
    CASE
      WHEN pp.is_lateral_variant THEN
        COALESCE(_admission_stream_label(pp.counselling_code), pp.institution_name)
        || ' - LATERAL ENTRY - II YEAR'
      ELSE
        UPPER(COALESCE(pp.degree_type, '')) || ' '
        || COALESCE(_admission_stream_label(pp.counselling_code), pp.institution_name)
        || ' - I YEAR'
    END                                                       AS group_label,
    COALESCE(pp.counselling_code, 'ZZZ') || '.'
      || UPPER(COALESCE(pp.degree_type, 'z')) || '.'
      || CASE WHEN pp.is_lateral_variant THEN '1' ELSE '0' END AS group_sort_key,
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

REVOKE EXECUTE ON FUNCTION public.fn_seat_analytics_daily_pivot(uuid[], integer, boolean) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_seat_analytics_daily_pivot(uuid[], integer, boolean) TO authenticated;
