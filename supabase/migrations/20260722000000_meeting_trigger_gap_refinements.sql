-- ============================================================================
-- Auto-meeting engine — data-gap trigger refinements (Director interview 2026-06-27)
-- ============================================================================
-- Three decisions from the edge-case interview:
--   (1) CANONICAL holiday source. The PR3 RPC re-queried institution_leaves raw;
--       the canonical "is this an approved college holiday?" function is
--       is_institution_holiday(institution, date) — the SAME one get_cycle_for_date
--       (the timetable working-day engine) uses. Compose it, don't duplicate it,
--       so a future recurring-weekly-off extension to is_institution_holiday is
--       inherited here automatically.
--   (2) NEAR-EMPTY days. Fire not only on ZERO marks but when the day's mark
--       VOLUME falls below p_min_pct (default 25) of the college's own recent
--       normal — judged per-college so big and small colleges compare to
--       themselves.
--   (3) Per-college ALERT OWNER. A column so a college with no Principal can
--       route its gap alert to one named person instead of all super-admins.
--
-- Rules stay INACTIVE. Nothing fires until the Director activates a rule.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Mark-count for a college-day (same JSONB shape as fn_college_day_attendance_rate)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_college_day_mark_count(
  p_institution_id uuid,
  p_date           date
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int
  FROM public.student_attendance sa
  CROSS JOIN LATERAL jsonb_each(sa.attendance_data) AS sess(key, value)
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(sess.value->'students') = 'array'
         THEN sess.value->'students'
         ELSE '[]'::jsonb END
  ) AS elem
  WHERE sa.institution_id = p_institution_id
    AND sa.attendance_date = p_date;
$$;

COMMENT ON FUNCTION public.fn_college_day_mark_count(uuid, date) IS
  'Auto-meeting engine: number of attendance marks recorded for a college on a day (mark-level, same JSONB unnest as fn_college_day_attendance_rate). 0 = no marks at all.';

-- ----------------------------------------------------------------------------
-- 2. The college''s "normal" daily mark volume — avg over the trailing window,
--    counting only days that actually had marks (so a teaching day''s typical
--    volume, not dragged to zero by holidays/weekends).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_college_normal_daily_marks(
  p_institution_id uuid,
  p_date           date,
  p_lookback       integer DEFAULT 30
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT avg(daily)::numeric
  FROM (
    SELECT sa.attendance_date, count(*) AS daily
    FROM public.student_attendance sa
    CROSS JOIN LATERAL jsonb_each(sa.attendance_data) AS sess(key, value)
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(sess.value->'students') = 'array'
           THEN sess.value->'students'
           ELSE '[]'::jsonb END
    ) AS elem
    WHERE sa.institution_id = p_institution_id
      AND sa.attendance_date >= p_date - p_lookback
      AND sa.attendance_date <  p_date
    GROUP BY sa.attendance_date
  ) t;
$$;

COMMENT ON FUNCTION public.fn_college_normal_daily_marks(uuid, date, integer) IS
  'Auto-meeting engine: the college''s typical daily attendance-mark volume over the trailing p_lookback days (averaged over days that had marks). The baseline a "near-empty" day is compared against. NULL when there is no recent marking history.';

-- ----------------------------------------------------------------------------
-- 3. The gap check — canonical working-day + zero-OR-near-empty. Returns the
--    verdict plus the numbers so the engine can craft an accurate message and
--    record observed_value. Replaces fn_college_is_missing_data_day (PR3), which
--    re-queried institution_leaves raw and only handled ZERO.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_college_is_missing_data_day(uuid, date);

CREATE OR REPLACE FUNCTION public.fn_college_data_gap_check(
  p_institution_id uuid,
  p_date           date,
  p_min_pct        numeric DEFAULT 25
)
RETURNS TABLE (is_gap boolean, marks integer, normal numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_marks  integer;
  v_normal numeric;
BEGIN
  -- Working day? not Sunday (academic calendar treats only Sunday as weekend)
  -- and not a canonical approved institution holiday (is_institution_holiday is
  -- the SAME source the timetable working-day engine uses, and is where a future
  -- recurring-weekly-off would live).
  IF EXTRACT(DOW FROM p_date) = 0
     OR public.is_institution_holiday(p_institution_id, p_date) THEN
    RETURN QUERY SELECT false, NULL::int, NULL::numeric;
    RETURN;
  END IF;

  v_marks  := public.fn_college_day_mark_count(p_institution_id, p_date);
  v_normal := public.fn_college_normal_daily_marks(p_institution_id, p_date, 30);

  RETURN QUERY SELECT
    -- ZERO is always a gap; a partial day is a gap only when a baseline exists
    -- and the day is below p_min_pct of it.
    (v_marks = 0)
      OR (v_normal IS NOT NULL AND v_normal > 0
          AND v_marks < (p_min_pct / 100.0) * v_normal),
    v_marks,
    v_normal;
END;
$$;

COMMENT ON FUNCTION public.fn_college_data_gap_check(uuid, date, numeric) IS
  'Auto-meeting engine PR3.1: is a college-day a data gap? Working day (not Sunday, not is_institution_holiday) AND (zero marks OR marks below p_min_pct of the college''s recent normal). Returns is_gap + marks + normal so the engine can message accurately. Replaces fn_college_is_missing_data_day.';

REVOKE EXECUTE ON FUNCTION public.fn_college_day_mark_count(uuid, date)            FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_college_normal_daily_marks(uuid, date, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_college_data_gap_check(uuid, date, numeric)    FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_college_day_mark_count(uuid, date)            TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.fn_college_normal_daily_marks(uuid, date, integer) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.fn_college_data_gap_check(uuid, date, numeric)    TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. Per-college ALERT OWNER (no-Principal routing). Optional staff member who
--    receives a rule''s alert when the college has no Principal on record —
--    instead of fanning out to all super-admins.
-- ----------------------------------------------------------------------------
ALTER TABLE public.meeting_trigger_rules
  ADD COLUMN IF NOT EXISTS alert_owner_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.meeting_trigger_rules.alert_owner_staff_id IS
  'Optional: when the college has no Principal, route this rule''s alert to this one staff member instead of the super-admin fallback.';

-- ----------------------------------------------------------------------------
-- 5. Repurpose the missing-data rule threshold from nominal 0 to the near-empty
--    percentage (Director: 25%). comparator stays nominal (the metric is decided
--    by fn_college_data_gap_check, not the numeric compare path).
-- ----------------------------------------------------------------------------
UPDATE public.meeting_trigger_rules
   SET threshold = 25
 WHERE metric_key = 'attendance_missing_data'
   AND threshold = 0;

NOTIFY pgrst, 'reload schema';
