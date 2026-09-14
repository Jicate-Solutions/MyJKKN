-- ===========================================================================
-- fn_cl_attendance_learners — advanced filters + sorting
-- ===========================================================================
--
-- The learner table on /campus-living/analytics/attendance moves to the shared
-- DataTable, which drives paging, sorting and search server-side. The original
-- signature only understood search + a single max-percentage ceiling and had a
-- fixed ORDER BY, so it could not answer "who is on an ongoing absence run",
-- "which learners sit between 40% and 60%", or any sort the user clicks.
--
-- ARGUMENTS CHANGED, SO THIS DROPS FIRST. `CREATE OR REPLACE FUNCTION` with a
-- different argument list does NOT replace anything -- it creates a SECOND
-- overload, and PostgREST then refuses every call to the name as ambiguous.
-- That has broken this codebase before (no HR month could be closed for a day).
-- DROP + CREATE is the only safe route when the signature moves.
--
-- A DROP also takes the function's ACL with it, and re-creating silently
-- re-grants EXECUTE to PUBLIC (= anon). The REVOKE/GRANT block at the bottom is
-- therefore mandatory, not tidiness.
--
-- SORTING IS WHITELISTED, NOT INTERPOLATED. p_sort_by never reaches SQL text;
-- it selects a precomputed sort key via CASE, so there is no injection surface
-- and no dynamic SQL to review.
-- ===========================================================================

DROP FUNCTION IF EXISTS public.fn_cl_attendance_learners(date, date, uuid, text, numeric, integer, integer);

CREATE FUNCTION public.fn_cl_attendance_learners(
  p_from           date,
  p_to             date,
  p_block_id       uuid    DEFAULT NULL,
  p_search         text    DEFAULT NULL,
  p_min_pct        numeric DEFAULT NULL,
  p_max_pct        numeric DEFAULT NULL,
  p_institution_id uuid    DEFAULT NULL,
  p_min_absent_run integer DEFAULT NULL,
  p_only_ongoing   boolean DEFAULT false,
  p_status         text    DEFAULT NULL,
  p_sort_by        text    DEFAULT 'attendance_pct',
  p_sort_order     text    DEFAULT 'asc',
  p_limit          integer DEFAULT 50,
  p_offset         integer DEFAULT 0
) RETURNS TABLE (
  learner_id         uuid,
  full_name          text,
  roll_number        text,
  block_id           uuid,
  block_name         text,
  institution_id     uuid,
  institution_name   text,
  program_name       text,
  room_number        text,
  marks              integer,
  present            integer,
  absent             integer,
  on_leave           integer,
  pct_denominator    integer,
  attendance_pct     numeric,
  longest_absent_run integer,
  current_absent_run integer,
  last_present_date  date,
  total_count        bigint
)
  LANGUAGE plpgsql STABLE SECURITY INVOKER
  SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_limit  integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_dir    text    := CASE WHEN lower(COALESCE(p_sort_order, 'asc')) = 'desc' THEN 'desc' ELSE 'asc' END;
  v_sort   text    := COALESCE(NULLIF(p_sort_by, ''), 'attendance_pct');
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
    RAISE EXCEPTION 'Invalid date range' USING ERRCODE = '22007';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT ha.learner_id, ha.date, ha.evening_status, ha.block_id, ha.institution_id
    FROM hostel_attendance ha
    WHERE ha.date BETWEEN p_from AND p_to
      AND (p_block_id IS NULL OR ha.block_id = p_block_id)
      AND (p_institution_id IS NULL OR ha.institution_id = p_institution_id)
  ),
  -- Gaps and islands. A "run" is consecutive MARKED days, not consecutive
  -- calendar days — a gap in marking does not break it.
  islands AS (
    SELECT b.learner_id, b.date, b.evening_status,
           row_number() OVER (PARTITION BY b.learner_id ORDER BY b.date)
             - row_number() OVER (PARTITION BY b.learner_id, (b.evening_status = 'absent') ORDER BY b.date)
             AS grp
    FROM base b
  ),
  runs AS (
    SELECT i.learner_id, count(*)::int AS run_len, max(i.date) AS run_end
    FROM islands i
    WHERE i.evening_status = 'absent'
    GROUP BY i.learner_id, i.grp
  ),
  run_agg AS (
    SELECT r.learner_id,
           max(r.run_len) AS longest_run,
           max(r.run_len) FILTER (
             WHERE r.run_end = (SELECT max(b2.date) FROM base b2 WHERE b2.learner_id = r.learner_id)
           ) AS current_run
    FROM runs r GROUP BY r.learner_id
  ),
  agg AS (
    SELECT b.learner_id,
           count(*)::int AS marks,
           count(*) FILTER (WHERE fn_cl_attendance_is_present(b.evening_status))::int AS present,
           count(*) FILTER (WHERE b.evening_status = 'absent')::int   AS absent,
           count(*) FILTER (WHERE b.evening_status = 'on_leave')::int AS on_leave,
           count(*) FILTER (WHERE fn_cl_attendance_counts_in_pct(b.evening_status))::int AS denom,
           max(b.date) FILTER (WHERE fn_cl_attendance_is_present(b.evening_status)) AS last_present,
           (array_agg(b.block_id ORDER BY b.date DESC))[1]       AS last_block,
           (array_agg(b.institution_id ORDER BY b.date DESC))[1] AS last_institution,
           -- Status presence flags, for the "has any day of X" filter.
           bool_or(b.evening_status = 'absent')     AS any_absent,
           bool_or(b.evening_status = 'on_leave')   AS any_leave,
           bool_or(b.evening_status = 'medical')    AS any_medical,
           bool_or(b.evening_status = 'late_entry') AS any_late
    FROM base b GROUP BY b.learner_id
  ),
  joined AS (
    SELECT a.learner_id,
           -- Explicit ::text: institutions.name and friends are varchar(255),
           -- and a RETURNS TABLE column typed text rejects varchar with 42804.
           COALESCE(p.full_name, '(unknown)')::text        AS full_name,
           lp.roll_number::text                            AS roll_number,
           a.last_block                                    AS block_id,
           hb.name::text                                   AS block_name,
           a.last_institution                              AS institution_id,
           i.name::text                                    AS institution_name,
           pr.program_name::text                           AS program_name,
           hr.room_number::text                            AS room_number,
           a.marks, a.present, a.absent, a.on_leave,
           a.denom                                         AS pct_denominator,
           CASE WHEN a.denom = 0 THEN NULL
                ELSE round(100.0 * a.present / a.denom, 1) END AS attendance_pct,
           COALESCE(ra.longest_run, 0)                     AS longest_absent_run,
           COALESCE(ra.current_run, 0)                     AS current_absent_run,
           a.last_present                                  AS last_present_date,
           a.any_absent, a.any_leave, a.any_medical, a.any_late
    FROM agg a
    LEFT JOIN run_agg ra ON ra.learner_id = a.learner_id
    -- LEFT joins throughout: an inner join would silently drop a learner whose
    -- profile or allocation row is missing — exactly the population an at-risk
    -- list must not lose.
    LEFT JOIN profiles p           ON p.id = a.learner_id
    LEFT JOIN learners_profiles lp ON lp.id = p.learner_id
    LEFT JOIN programs pr          ON pr.id = lp.program_id
    LEFT JOIN hostel_blocks hb     ON hb.id = a.last_block
    LEFT JOIN institutions i       ON i.id = a.last_institution
    LEFT JOIN LATERAL (
      SELECT r.room_number
      FROM hostel_allocations al
      JOIN hostel_rooms r ON r.id = al.room_id
      WHERE al.learner_id = a.learner_id AND al.check_out_date IS NULL
      LIMIT 1
    ) hr ON true
  ),
  filtered AS (
    SELECT j.*,
           -- Precomputed sort keys. p_sort_by picks one via CASE and never
           -- reaches SQL text, so there is no injection surface.
           CASE v_sort
             WHEN 'attendance_pct'     THEN j.attendance_pct
             WHEN 'marks'              THEN j.marks::numeric
             WHEN 'present'            THEN j.present::numeric
             WHEN 'absent'             THEN j.absent::numeric
             WHEN 'on_leave'           THEN j.on_leave::numeric
             WHEN 'longest_absent_run' THEN j.longest_absent_run::numeric
             WHEN 'current_absent_run' THEN j.current_absent_run::numeric
             ELSE NULL
           END AS sort_num,
           CASE v_sort
             WHEN 'full_name'         THEN lower(j.full_name)
             WHEN 'roll_number'       THEN lower(COALESCE(j.roll_number, ''))
             WHEN 'block_name'        THEN lower(COALESCE(j.block_name, ''))
             WHEN 'institution_name'  THEN lower(COALESCE(j.institution_name, ''))
             WHEN 'room_number'       THEN lower(COALESCE(j.room_number, ''))
             WHEN 'last_present_date' THEN to_char(j.last_present_date, 'YYYY-MM-DD')
             ELSE NULL
           END AS sort_txt
    FROM joined j
    WHERE (p_search IS NULL OR p_search = ''
           OR j.full_name ILIKE '%' || p_search || '%'
           OR COALESCE(j.roll_number, '') ILIKE '%' || p_search || '%'
           OR COALESCE(j.room_number, '') ILIKE '%' || p_search || '%')
      -- A learner with no counted days has a NULL percentage. Keep them out of
      -- a percentage band rather than letting NULL pass every comparison.
      AND (p_min_pct IS NULL OR (j.attendance_pct IS NOT NULL AND j.attendance_pct >= p_min_pct))
      AND (p_max_pct IS NULL OR (j.attendance_pct IS NOT NULL AND j.attendance_pct <= p_max_pct))
      AND (p_min_absent_run IS NULL OR j.longest_absent_run >= p_min_absent_run)
      AND (NOT COALESCE(p_only_ongoing, false) OR j.current_absent_run > 0)
      AND (p_status IS NULL OR p_status = '' OR CASE p_status
             WHEN 'absent'     THEN j.any_absent
             WHEN 'on_leave'   THEN j.any_leave
             WHEN 'medical'    THEN j.any_medical
             WHEN 'late_entry' THEN j.any_late
             ELSE true
           END)
  )
  SELECT f.learner_id, f.full_name, f.roll_number, f.block_id, f.block_name,
         f.institution_id, f.institution_name, f.program_name, f.room_number,
         f.marks, f.present, f.absent, f.on_leave, f.pct_denominator,
         f.attendance_pct, f.longest_absent_run, f.current_absent_run,
         f.last_present_date,
         count(*) OVER () AS total_count
  FROM filtered f
  ORDER BY
    CASE WHEN v_dir = 'asc'  THEN f.sort_num END ASC  NULLS LAST,
    CASE WHEN v_dir = 'desc' THEN f.sort_num END DESC NULLS LAST,
    CASE WHEN v_dir = 'asc'  THEN f.sort_txt END ASC  NULLS LAST,
    CASE WHEN v_dir = 'desc' THEN f.sort_txt END DESC NULLS LAST,
    -- Stable tiebreaker: without it, two learners on the same percentage can
    -- swap places between pages and appear twice or not at all.
    f.full_name ASC, f.learner_id ASC
  LIMIT v_limit OFFSET v_offset;
END;
$function$;

COMMENT ON FUNCTION public.fn_cl_attendance_learners IS
  'Paginated per-learner attendance rollup with absence streaks, server-side '
  'search, percentage band, institution/block/status filters and whitelisted '
  'sorting. Runs are consecutive MARKED days, not calendar days.';

-- The DROP above discarded the ACL, and CREATE re-grants EXECUTE to PUBLIC.
REVOKE ALL ON FUNCTION public.fn_cl_attendance_learners(
  date, date, uuid, text, numeric, numeric, uuid, integer, boolean, text, text, text, integer, integer
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.fn_cl_attendance_learners(
  date, date, uuid, text, numeric, numeric, uuid, integer, boolean, text, text, text, integer, integer
) TO authenticated, service_role;
