-- ===========================================================================
-- Hostel attendance analytics — three aggregate RPCs
-- ===========================================================================
--
-- /campus-living/analytics/attendance was a placeholder. What existed instead
-- of SQL aggregation: CampusLivingAnalytics.getAttendanceTrend pulls every raw
-- hostel_attendance row for the range into the browser with NO .limit() and
-- groups it in a JS loop, and getAttendanceDashboard fetches with hard limits
-- of 5000/5000/20000 that will silently truncate as the table grows. There is
-- no view and no aggregate function over hostel_attendance anywhere. These
-- three functions move the aggregation into Postgres.
--
-- SECURITY INVOKER, deliberately. hostel_attendance and hostel_allocations
-- carry the SAME RLS shape --
--   role_has_institution_access(institution_id) OR role_has_block_access(block_id)
-- -- so INVOKER hands the caller their real scope on both tables for free, and
-- a warden's coverage denominator automatically matches her attendance
-- numerator. A DEFINER function would have to re-implement that scoping by
-- hand and could only ever widen it.
--
-- THE ATTENDANCE FORMULA (agreed with the repository owner, 2026-09-09):
--
--     pct = (present + late_entry) / (marks - on_leave - medical)
--
-- Approved absence does not count against a learner: a learner on sanctioned
-- leave or medical leaves the denominator for those days. Whole-dataset this
-- reads 66.3%, against 61.4% if leave counted against.
--
-- WHAT THE DATA CANNOT SUPPORT. Four columns are empty on all 16,715 rows:
-- morning_status, check_in_time, late_minutes, and is_curfew_violation (true on
-- ZERO rows). No check-in-time histogram and no curfew analytics are possible,
-- and the "Curfew Violations" cards elsewhere in the module are reporting
-- missing data as good news. Nothing here reads those columns.
--
-- COVERAGE IS THE HEADLINE. 712 residents are allocated but only 469 have ever
-- been marked -- all three Boys hostels are effectively not marking. Because
-- every percentage in the app is present/MARKED, an unmarked block silently
-- improves the rate. fn_cl_attendance_dashboard therefore returns coverage
-- alongside the rate, with a coverage_visible flag so a caller who cannot read
-- hostel_allocations gets an explicit "unavailable" instead of "469 of 0".
-- ===========================================================================


-- ── Shared helper: the status → numerator/denominator mapping ─────────────
-- One definition so the dashboard, the learner list and the learner detail can
-- never drift into three different percentages.

CREATE OR REPLACE FUNCTION public.fn_cl_attendance_counts_in_pct(
  p_status public.hostel_attendance_status_enum
) RETURNS boolean
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  SET search_path TO ''
AS $$
  -- FALSE = the day leaves the denominator entirely (approved absence).
  SELECT p_status NOT IN ('on_leave', 'medical');
$$;

COMMENT ON FUNCTION public.fn_cl_attendance_counts_in_pct IS
  'Whether a status belongs in the attendance-percentage denominator. '
  'on_leave and medical are approved absence and are excluded.';

CREATE OR REPLACE FUNCTION public.fn_cl_attendance_is_present(
  p_status public.hostel_attendance_status_enum
) RETURNS boolean
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  SET search_path TO ''
AS $$
  SELECT p_status IN ('present', 'late_entry');
$$;

COMMENT ON FUNCTION public.fn_cl_attendance_is_present IS
  'Whether a status counts as present. late_entry counts as present.';


-- ── 1. Dashboard aggregate ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_cl_attendance_dashboard(
  p_from     date,
  p_to       date,
  p_block_id uuid DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY INVOKER
  SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_kpis      jsonb;
  v_trend     jsonb;
  v_by_block  jsonb;
  v_weekday   jsonb;
  v_coverage  jsonb;
  v_cov_seen  boolean;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
    RAISE EXCEPTION 'Invalid date range' USING ERRCODE = '22007';
  END IF;

  WITH base AS (
    SELECT ha.date, ha.block_id, ha.institution_id, ha.learner_id, ha.evening_status
    FROM hostel_attendance ha
    WHERE ha.date BETWEEN p_from AND p_to
      AND (p_block_id IS NULL OR ha.block_id = p_block_id)
  )
  SELECT
    -- kpis
    jsonb_build_object(
      'marks',            count(*),
      'learners_marked',  count(DISTINCT learner_id),
      'days_covered',     count(DISTINCT date),
      'present',          count(*) FILTER (WHERE evening_status = 'present'),
      'late_entry',       count(*) FILTER (WHERE evening_status = 'late_entry'),
      'absent',           count(*) FILTER (WHERE evening_status = 'absent'),
      'on_leave',         count(*) FILTER (WHERE evening_status = 'on_leave'),
      'medical',          count(*) FILTER (WHERE evening_status = 'medical'),
      'pct_denominator',  count(*) FILTER (WHERE fn_cl_attendance_counts_in_pct(evening_status)),
      'attendance_pct',
        CASE WHEN count(*) FILTER (WHERE fn_cl_attendance_counts_in_pct(evening_status)) = 0 THEN NULL
             ELSE round(
               100.0 * count(*) FILTER (WHERE fn_cl_attendance_is_present(evening_status))
                     / count(*) FILTER (WHERE fn_cl_attendance_counts_in_pct(evening_status)), 1)
        END
    )
  INTO v_kpis
  FROM base;

  -- Daily series.
  SELECT COALESCE(jsonb_agg(t ORDER BY t->>'date'), '[]'::jsonb) INTO v_trend
  FROM (
    SELECT jsonb_build_object(
             'date',    ha.date,
             'marks',   count(*),
             'present', count(*) FILTER (WHERE fn_cl_attendance_is_present(ha.evening_status)),
             'absent',  count(*) FILTER (WHERE ha.evening_status = 'absent'),
             'on_leave',count(*) FILTER (WHERE ha.evening_status = 'on_leave'),
             'attendance_pct',
               CASE WHEN count(*) FILTER (WHERE fn_cl_attendance_counts_in_pct(ha.evening_status)) = 0 THEN NULL
                    ELSE round(
                      100.0 * count(*) FILTER (WHERE fn_cl_attendance_is_present(ha.evening_status))
                            / count(*) FILTER (WHERE fn_cl_attendance_counts_in_pct(ha.evening_status)), 1)
               END
           ) AS t
    FROM hostel_attendance ha
    WHERE ha.date BETWEEN p_from AND p_to
      AND (p_block_id IS NULL OR ha.block_id = p_block_id)
    GROUP BY ha.date
  ) s;

  -- Block x institution. Blocks genuinely span institutions here (Girls Hostel
  -- A serves six, and presence ranges 54%-82% WITHIN it), so collapsing to
  -- block alone would hide the most actionable split on the page.
  SELECT COALESCE(jsonb_agg(t ORDER BY t->>'block_name', t->>'institution_name'), '[]'::jsonb)
  INTO v_by_block
  FROM (
    SELECT jsonb_build_object(
             'block_id',         ha.block_id,
             'block_name',       hb.name,
             'hostel_type',      hb.hostel_type::text,
             'institution_id',   ha.institution_id,
             'institution_name', i.name,
             'marks',            count(*),
             'learners',         count(DISTINCT ha.learner_id),
             'present',          count(*) FILTER (WHERE fn_cl_attendance_is_present(ha.evening_status)),
             'absent',           count(*) FILTER (WHERE ha.evening_status = 'absent'),
             'attendance_pct',
               CASE WHEN count(*) FILTER (WHERE fn_cl_attendance_counts_in_pct(ha.evening_status)) = 0 THEN NULL
                    ELSE round(
                      100.0 * count(*) FILTER (WHERE fn_cl_attendance_is_present(ha.evening_status))
                            / count(*) FILTER (WHERE fn_cl_attendance_counts_in_pct(ha.evening_status)), 1)
               END
           ) AS t
    FROM hostel_attendance ha
    JOIN hostel_blocks hb ON hb.id = ha.block_id
    LEFT JOIN institutions i ON i.id = ha.institution_id
    WHERE ha.date BETWEEN p_from AND p_to
      AND (p_block_id IS NULL OR ha.block_id = p_block_id)
    GROUP BY ha.block_id, hb.name, hb.hostel_type, ha.institution_id, i.name
  ) s;

  -- Day of week (0 = Sunday). Replaces the dashed weekday-vs-weekend
  -- placeholder; it is the one placeholder the data can actually support.
  SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'dow')::int), '[]'::jsonb) INTO v_weekday
  FROM (
    SELECT jsonb_build_object(
             'dow',     EXTRACT(DOW FROM ha.date)::int,
             'marks',   count(*),
             'present', count(*) FILTER (WHERE fn_cl_attendance_is_present(ha.evening_status)),
             'attendance_pct',
               CASE WHEN count(*) FILTER (WHERE fn_cl_attendance_counts_in_pct(ha.evening_status)) = 0 THEN NULL
                    ELSE round(
                      100.0 * count(*) FILTER (WHERE fn_cl_attendance_is_present(ha.evening_status))
                            / count(*) FILTER (WHERE fn_cl_attendance_counts_in_pct(ha.evening_status)), 1)
               END
           ) AS t
    FROM hostel_attendance ha
    WHERE ha.date BETWEEN p_from AND p_to
      AND (p_block_id IS NULL OR ha.block_id = p_block_id)
    GROUP BY EXTRACT(DOW FROM ha.date)
  ) s;

  -- Coverage: allocated residents vs residents actually marked, per block.
  -- hostel_allocations is gated by campus_living.allocations.view, a DIFFERENT
  -- key from campus_living.attendance.view. If the caller cannot read it we
  -- must NOT render a ratio -- "469 of 0" is worse than saying nothing.
  SELECT EXISTS (
    SELECT 1 FROM hostel_allocations a
    WHERE a.check_out_date IS NULL
      AND (p_block_id IS NULL OR a.block_id = p_block_id)
  ) INTO v_cov_seen;

  SELECT COALESCE(jsonb_agg(t ORDER BY t->>'block_name'), '[]'::jsonb) INTO v_coverage
  FROM (
    SELECT jsonb_build_object(
             'block_id',        a.block_id,
             'block_name',      hb.name,
             'hostel_type',     hb.hostel_type::text,
             'residents',       count(DISTINCT a.learner_id),
             'ever_marked',     count(DISTINCT a.learner_id) FILTER (
                                  WHERE EXISTS (SELECT 1 FROM hostel_attendance h
                                                 WHERE h.learner_id = a.learner_id)),
             'marked_in_range', count(DISTINCT a.learner_id) FILTER (
                                  WHERE EXISTS (SELECT 1 FROM hostel_attendance h
                                                 WHERE h.learner_id = a.learner_id
                                                   AND h.date BETWEEN p_from AND p_to))
           ) AS t
    FROM hostel_allocations a
    JOIN hostel_blocks hb ON hb.id = a.block_id
    WHERE a.check_out_date IS NULL
      AND (p_block_id IS NULL OR a.block_id = p_block_id)
    GROUP BY a.block_id, hb.name, hb.hostel_type
  ) s;

  RETURN jsonb_build_object(
    'range',             jsonb_build_object('from', p_from, 'to', p_to),
    'block_id',          p_block_id,
    'kpis',              COALESCE(v_kpis, '{}'::jsonb),
    'trend',             v_trend,
    'by_block',          v_by_block,
    'weekday',           v_weekday,
    'coverage',          v_coverage,
    'coverage_visible',  COALESCE(v_cov_seen, false)
  );
END;
$function$;

COMMENT ON FUNCTION public.fn_cl_attendance_dashboard IS
  'Every panel of the hostel attendance analytics dashboard in one round trip. '
  'SECURITY INVOKER so RLS scopes attendance and allocations identically. '
  'coverage_visible is false when the caller cannot read hostel_allocations -- '
  'render an unavailable state, never a ratio with a zero denominator.';


-- ── 2. Per-learner list (the at-risk table) ───────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_cl_attendance_learners(
  p_from     date,
  p_to       date,
  p_block_id uuid    DEFAULT NULL,
  p_search   text    DEFAULT NULL,
  p_max_pct  numeric DEFAULT NULL,
  p_limit    integer DEFAULT 50,
  p_offset   integer DEFAULT 0
) RETURNS TABLE (
  learner_id         uuid,
  full_name          text,
  roll_number        text,
  block_id           uuid,
  block_name         text,
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
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
    RAISE EXCEPTION 'Invalid date range' USING ERRCODE = '22007';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT ha.learner_id, ha.date, ha.evening_status, ha.block_id
    FROM hostel_attendance ha
    WHERE ha.date BETWEEN p_from AND p_to
      AND (p_block_id IS NULL OR ha.block_id = p_block_id)
  ),
  -- Gaps and islands. NOTE: a "run" is consecutive MARKED days, not consecutive
  -- calendar days -- a gap in marking does not break it. The UI must say so;
  -- otherwise "28 days absent" reads as calendar time and overstates the case.
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
           -- "current" = the run that is still open at the last marked day for
           -- that learner, so a learner who came back does not keep the badge.
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
           (array_agg(b.block_id ORDER BY b.date DESC))[1] AS last_block
    FROM base b GROUP BY b.learner_id
  ),
  joined AS (
    SELECT a.learner_id,
           -- Explicit ::text on every joined string: institutions.name and
           -- friends are varchar(255), and a RETURNS TABLE column typed text
           -- rejects varchar outright with 42804 rather than coercing.
           COALESCE(p.full_name, '(unknown)')::text        AS full_name,
           lp.roll_number::text                            AS roll_number,
           a.last_block                                    AS block_id,
           hb.name::text                                   AS block_name,
           i.name::text                                    AS institution_name,
           pr.program_name::text                           AS program_name,
           hr.room_number::text                            AS room_number,
           a.marks, a.present, a.absent, a.on_leave,
           a.denom                                         AS pct_denominator,
           CASE WHEN a.denom = 0 THEN NULL
                ELSE round(100.0 * a.present / a.denom, 1) END AS attendance_pct,
           COALESCE(ra.longest_run, 0)                     AS longest_absent_run,
           COALESCE(ra.current_run, 0)                     AS current_absent_run,
           a.last_present                                  AS last_present_date
    FROM agg a
    LEFT JOIN run_agg ra ON ra.learner_id = a.learner_id
    -- LEFT joins throughout: an !inner here would silently drop any learner
    -- whose profile/allocation row is missing, which is exactly the population
    -- an at-risk list must not lose.
    LEFT JOIN profiles p           ON p.id = a.learner_id
    LEFT JOIN learners_profiles lp ON lp.id = p.learner_id
    LEFT JOIN programs pr          ON pr.id = lp.program_id
    LEFT JOIN hostel_blocks hb     ON hb.id = a.last_block
    LEFT JOIN institutions i       ON i.id = lp.institution_id
    LEFT JOIN LATERAL (
      SELECT r.room_number
      FROM hostel_allocations al
      JOIN hostel_rooms r ON r.id = al.room_id
      WHERE al.learner_id = a.learner_id AND al.check_out_date IS NULL
      LIMIT 1
    ) hr ON true
  ),
  filtered AS (
    SELECT j.* FROM joined j
    WHERE (p_search IS NULL OR p_search = ''
           OR j.full_name ILIKE '%' || p_search || '%'
           OR COALESCE(j.roll_number, '') ILIKE '%' || p_search || '%')
      AND (p_max_pct IS NULL OR j.attendance_pct IS NULL OR j.attendance_pct <= p_max_pct)
  )
  SELECT f.learner_id, f.full_name, f.roll_number, f.block_id, f.block_name,
         f.institution_name, f.program_name, f.room_number,
         f.marks, f.present, f.absent, f.on_leave, f.pct_denominator,
         f.attendance_pct, f.longest_absent_run, f.current_absent_run,
         f.last_present_date,
         count(*) OVER () AS total_count
  FROM filtered f
  ORDER BY f.attendance_pct ASC NULLS LAST, f.absent DESC, f.full_name ASC
  LIMIT v_limit OFFSET v_offset;
END;
$function$;

COMMENT ON FUNCTION public.fn_cl_attendance_learners IS
  'Paginated per-learner attendance rollup with absence streaks, ordered worst '
  'first. Runs are consecutive MARKED days, not calendar days.';


-- ── 3. Single-learner detail ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_cl_attendance_learner_detail(
  p_learner_id uuid,
  p_from       date,
  p_to         date
) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY INVOKER
  SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_profile jsonb;
  v_summary jsonb;
  v_days    jsonb;
  v_marks   jsonb;
  v_longest int;
  v_current int;
BEGIN
  IF p_learner_id IS NULL THEN
    RAISE EXCEPTION 'learner id is required' USING ERRCODE = '22004';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
    RAISE EXCEPTION 'Invalid date range' USING ERRCODE = '22007';
  END IF;

  -- Identity, gated on the caller being able to see at least ONE attendance row
  -- for this learner (RLS-filtered, any date -- not just the selected range, so
  -- a legitimately empty range still renders the header).
  --
  -- Without this gate the RPC is a UUID -> name oracle: a warden scoped to the
  -- Girls blocks passed a Boys learner's id got zero attendance but a full name
  -- back, because profiles RLS is deliberately broad. Attendance data was never
  -- exposed; the identity should not be either.
  IF NOT EXISTS (SELECT 1 FROM hostel_attendance ha WHERE ha.learner_id = p_learner_id) THEN
    RETURN jsonb_build_object(
      'range',   jsonb_build_object('from', p_from, 'to', p_to),
      'profile', NULL,
      'summary', '{}'::jsonb,
      'days',    '[]'::jsonb,
      'marks',   '[]'::jsonb
    );
  END IF;

  SELECT jsonb_build_object(
           'learner_id',       p.id,
           'full_name',        p.full_name,
           'email',            p.email,
           'roll_number',      lp.roll_number,
           'program_name',     pr.program_name,
           'institution_name', i.name,
           'block_name',       hb.name,
           'room_number',      alloc.room_number
         )
  INTO v_profile
  FROM profiles p
  LEFT JOIN learners_profiles lp ON lp.id = p.learner_id
  LEFT JOIN programs pr          ON pr.id = lp.program_id
  LEFT JOIN institutions i       ON i.id = lp.institution_id
  LEFT JOIN LATERAL (
    SELECT al.block_id, r.room_number
    FROM hostel_allocations al
    LEFT JOIN hostel_rooms r ON r.id = al.room_id
    WHERE al.learner_id = p.id AND al.check_out_date IS NULL
    LIMIT 1
  ) alloc ON true
  LEFT JOIN hostel_blocks hb ON hb.id = alloc.block_id
  WHERE p.id = p_learner_id;

  WITH base AS (
    SELECT ha.date, ha.evening_status
    FROM hostel_attendance ha
    WHERE ha.learner_id = p_learner_id AND ha.date BETWEEN p_from AND p_to
  ),
  islands AS (
    SELECT b.date, b.evening_status,
           row_number() OVER (ORDER BY b.date)
             - row_number() OVER (PARTITION BY (b.evening_status = 'absent') ORDER BY b.date) AS grp
    FROM base b
  ),
  runs AS (
    SELECT count(*)::int AS run_len, max(i.date) AS run_end
    FROM islands i WHERE i.evening_status = 'absent' GROUP BY i.grp
  )
  SELECT max(r.run_len),
         max(r.run_len) FILTER (WHERE r.run_end = (SELECT max(date) FROM base))
  INTO v_longest, v_current
  FROM runs r;

  SELECT jsonb_build_object(
           'marks',            count(*),
           'present',          count(*) FILTER (WHERE fn_cl_attendance_is_present(evening_status)),
           'absent',           count(*) FILTER (WHERE evening_status = 'absent'),
           'on_leave',         count(*) FILTER (WHERE evening_status = 'on_leave'),
           'medical',          count(*) FILTER (WHERE evening_status = 'medical'),
           'late_entry',       count(*) FILTER (WHERE evening_status = 'late_entry'),
           'pct_denominator',  count(*) FILTER (WHERE fn_cl_attendance_counts_in_pct(evening_status)),
           'attendance_pct',
             CASE WHEN count(*) FILTER (WHERE fn_cl_attendance_counts_in_pct(evening_status)) = 0 THEN NULL
                  ELSE round(
                    100.0 * count(*) FILTER (WHERE fn_cl_attendance_is_present(evening_status))
                          / count(*) FILTER (WHERE fn_cl_attendance_counts_in_pct(evening_status)), 1)
             END,
           'first_marked',      min(date),
           'last_marked',       max(date),
           'last_present_date', max(date) FILTER (WHERE fn_cl_attendance_is_present(evening_status)),
           'longest_absent_run', COALESCE(v_longest, 0),
           'current_absent_run', COALESCE(v_current, 0)
         )
  INTO v_summary
  FROM hostel_attendance
  WHERE learner_id = p_learner_id AND date BETWEEN p_from AND p_to;

  -- Day series for the heatmap. Only MARKED days are returned; the UI paints
  -- everything else as an unmarked gap. Emitting absent for a day nobody marked
  -- would invent 243 absences per unmarked learner.
  SELECT COALESCE(jsonb_agg(jsonb_build_object('date', ha.date, 'status', ha.evening_status::text)
                            ORDER BY ha.date), '[]'::jsonb)
  INTO v_days
  FROM hostel_attendance ha
  WHERE ha.learner_id = p_learner_id AND ha.date BETWEEN p_from AND p_to;

  SELECT COALESCE(jsonb_agg(t ORDER BY t->>'date' DESC), '[]'::jsonb) INTO v_marks
  FROM (
    SELECT jsonb_build_object(
             'id',             ha.id,
             'date',           ha.date,
             'status',         ha.evening_status::text,
             'marking_method', ha.marking_method::text,
             'remarks',        ha.remarks,
             'block_name',     hb.name,
             'marked_by_name', mp.full_name,
             'created_at',     ha.created_at
           ) AS t
    FROM hostel_attendance ha
    LEFT JOIN hostel_blocks hb ON hb.id = ha.block_id
    LEFT JOIN profiles mp      ON mp.id = ha.marked_by
    WHERE ha.learner_id = p_learner_id AND ha.date BETWEEN p_from AND p_to
  ) s;

  RETURN jsonb_build_object(
    'range',   jsonb_build_object('from', p_from, 'to', p_to),
    'profile', v_profile,
    'summary', COALESCE(v_summary, '{}'::jsonb),
    'days',    v_days,
    'marks',   v_marks
  );
END;
$function$;

COMMENT ON FUNCTION public.fn_cl_attendance_learner_detail IS
  'One learner''s hostel attendance: identity, summary with streaks, day series '
  'for the heatmap (marked days only), and the full mark log with marker names.';


-- ── Grants ────────────────────────────────────────────────────────────────
-- CREATE OR REPLACE on a function silently leaves EXECUTE granted to PUBLIC
-- (= anon). Revoke first, then grant deliberately. RLS inside does the scoping.

REVOKE ALL ON FUNCTION public.fn_cl_attendance_counts_in_pct(public.hostel_attendance_status_enum) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_cl_attendance_is_present(public.hostel_attendance_status_enum) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_cl_attendance_dashboard(date, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_cl_attendance_learners(date, date, uuid, text, numeric, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_cl_attendance_learner_detail(uuid, date, date) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.fn_cl_attendance_counts_in_pct(public.hostel_attendance_status_enum) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_cl_attendance_is_present(public.hostel_attendance_status_enum) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_cl_attendance_dashboard(date, date, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_cl_attendance_learners(date, date, uuid, text, numeric, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_cl_attendance_learner_detail(uuid, date, date) TO authenticated, service_role;
