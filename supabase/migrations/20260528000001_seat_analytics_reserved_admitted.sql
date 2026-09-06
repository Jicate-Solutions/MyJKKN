-- Migration: 2026-05-28
-- Seat Analytics (Group Dashboard) — surface Reserved + Admitted counts.
--
-- Business change, applies to the Seat Analytics tab → BOTH sub-tabs
-- (Summary and Daily Pivot):
--   * "Filled" now means a seat that has been TAKEN — i.e. lifecycle_status in
--     ('admitted','active','graduated','account') ("admitted or beyond").
--   * "Reserved" (lifecycle_status = 'reserved') is surfaced as its OWN count.
--     It is a tentative hold, NOT a taken seat, so it does NOT reduce Balance.
--   * Balance = intake − filled (admitted-or-beyond). Fill% = filled / intake.
--
-- Why not reuse admission_statuses.is_seat_filled?
--   That flag means "fee-paid / active" (only 'active' carries it today) and is
--   shared by fn_geography_analytics and fn_group_dashboard_overview's
--   "Seat Filled" drop-off KPI. Repurposing it would silently change those
--   surfaces. The admitted-or-beyond set is therefore defined locally in the two
--   seat RPCs, mirroring how fn_group_dashboard_overview already hardcodes
--   ('admitted','active') for its Admitted KPI.
--
-- Both functions gain a new return column (reserved_seats / reserved), which
-- changes the return type — so each is DROPped before CREATE
-- (CREATE OR REPLACE cannot change a function's return shape).

-- ── 1. get_seat_analytics — Summary sub-tab ──────────────────────────────────
DROP FUNCTION IF EXISTS public.get_seat_analytics(uuid, integer);

CREATE FUNCTION public.get_seat_analytics(
  p_institution_id     uuid    DEFAULT NULL,
  p_program_start_year integer DEFAULT NULL
)
RETURNS TABLE (
  institution_id      uuid,
  institution_name    text,
  degree_id           uuid,
  degree_name         text,
  department_id       uuid,
  department_name     text,
  program_id          uuid,
  program_name        text,
  admission_year_id   uuid,
  admission_year_name text,
  program_start_year  integer,
  program_end_year    integer,
  total_seats         integer,
  filled_seats        bigint,
  reserved_seats      bigint,
  balance_seats       integer,
  fill_percentage     numeric,
  last_filled_at      timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    i.id,
    i.name,
    d.id,
    d.degree_name,
    dept.id,
    dept.department_name,
    p.id,
    p.program_name,
    ay.id,
    ay.admission_year_name,
    ay.program_start_year,
    ay.program_end_year,
    ay.sanctioned_intake::integer AS total_seats,
    -- Filled = "admitted or beyond" (a seat that has been taken).
    COUNT(lp.id) FILTER (
      WHERE lp.lifecycle_status::text IN ('admitted','active','graduated','account')
    )                                                           AS filled_seats,
    -- Reserved = tentative holds; informational only, does not reduce balance.
    COUNT(lp.id) FILTER (
      WHERE lp.lifecycle_status::text = 'reserved'
    )                                                           AS reserved_seats,
    GREATEST(
      0,
      ay.sanctioned_intake - (COUNT(lp.id) FILTER (
        WHERE lp.lifecycle_status::text IN ('admitted','active','graduated','account')
      ))::integer
    )                                                           AS balance_seats,
    CASE
      WHEN ay.sanctioned_intake > 0
        THEN ROUND(
          (COUNT(lp.id) FILTER (
            WHERE lp.lifecycle_status::text IN ('admitted','active','graduated','account')
          ))::numeric / ay.sanctioned_intake * 100, 1)
      ELSE 0
    END                                                         AS fill_percentage,
    MAX(lp.activated_at) FILTER (
      WHERE lp.lifecycle_status::text IN ('admitted','active','graduated','account')
    )                                                           AS last_filled_at
  FROM admission_years ay
  JOIN programs p       ON p.id    = ay.program_id
  JOIN departments dept ON dept.id = p.department_id
  JOIN degrees d        ON d.id    = p.degree_id
  JOIN institutions i   ON i.id    = ay.institution_id
  LEFT JOIN learners_profiles lp
    ON  lp.admission_year_id = ay.id
    AND lp.lifecycle_status::text IN ('admitted','active','graduated','account','reserved')
  WHERE
    (
      (p_program_start_year IS NULL     AND ay.is_active = true)
      OR (p_program_start_year IS NOT NULL AND ay.program_start_year = p_program_start_year)
    )
    AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
    AND role_has_institution_access(ay.institution_id)
  GROUP BY
    i.id, i.name,
    d.id, d.degree_name,
    dept.id, dept.department_name,
    p.id, p.program_name,
    ay.id, ay.admission_year_name, ay.program_start_year, ay.program_end_year, ay.sanctioned_intake
  ORDER BY i.name, d.degree_name, dept.department_name, p.program_name, ay.program_start_year DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_seat_analytics(uuid, integer) TO authenticated;

-- ── 2. fn_seat_analytics_daily_pivot — Daily Pivot sub-tab ───────────────────
DROP FUNCTION IF EXISTS public.fn_seat_analytics_daily_pivot(uuid[], integer, boolean);

CREATE FUNCTION public.fn_seat_analytics_daily_pivot(
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
  reserved          integer,
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
  -- Filled = "admitted or beyond".
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
  -- Programs that have reserved learners but possibly no filled rows must still
  -- show up so their Reserved count is visible.
  reserved_anchor AS (
    SELECT DISTINCT lp.institution_id, pr.resolved_id AS program_id
    FROM learners_profiles lp
    JOIN programs p           ON p.id = lp.program_id
    JOIN program_resolution pr ON pr.original_id = lp.program_id
    WHERE lp.institution_id IN (SELECT id FROM eligible_institutions)
      AND lp.admission_year_id IN (SELECT id FROM target_ays)
      AND lp.lifecycle_status::text = 'reserved'
      AND COALESCE(p.is_active, true) = true
  ),
  anchor AS (
    SELECT institution_id, program_id FROM ay_anchor
    UNION
    SELECT institution_id, program_id FROM lp_anchor
    UNION
    SELECT institution_id, program_id FROM reserved_anchor
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
  -- Point-in-time count of reserved learners per resolved program.
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
    -- Use the full programs.program_name as the user-facing course label.
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

COMMENT ON FUNCTION public.fn_seat_analytics_daily_pivot(uuid[], integer, boolean) IS
  'Daily admission pivot for Seat Analytics tab. Filled = admitted/active/graduated/account; Reserved surfaced separately. -SH programs merged into base. Date: COALESCE(activated_at, created_at) AT TIME ZONE IST. SECURITY DEFINER + role_has_institution_access.';

GRANT EXECUTE ON FUNCTION public.fn_seat_analytics_daily_pivot(uuid[], integer, boolean) TO authenticated, service_role;
