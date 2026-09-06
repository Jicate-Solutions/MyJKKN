-- =====================================================================
-- fn_resolve_shift_timings_bulk — one call for a whole import
-- =====================================================================
-- Plan: docs/superpowers/plans/2026-08-06-biometric-attendance-ingestion.md
--
-- A monthly biometric import needs the applicable timing for every
-- (staff, date) pair — 48 employees x 31 days = 1,488 lookups for one file.
-- Calling fn_resolve_shift_timing per pair is unusable, and re-implementing
-- the precedence rules in TypeScript would let the two drift apart, which is
-- exactly the class of bug that silently mis-grades attendance.
--
-- So: same precedence, same effective-dating, same second-Saturday rule as
-- fn_resolve_shift_timing — expressed once, evaluated set-wise.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_resolve_shift_timings_bulk(
  p_staff_ids uuid[],
  p_from      date,
  p_to        date
)
RETURNS TABLE (
  staff_id uuid,
  work_date date,
  timing_id uuid,
  is_working_day boolean,
  first_half_start time,
  first_half_end time,
  second_half_start time,
  second_half_end time,
  grace_minutes integer,
  matched_by text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT (
       public.is_super_admin()
    OR public.is_admin()
    OR public.user_has_permission('hr.shift_timings.view')
    OR public.user_has_permission('hr.attendance.override')
  ) THEN
    RAISE EXCEPTION 'Not authorized to resolve shift timings'
      USING ERRCODE = '42501';
  END IF;

  IF p_to < p_from THEN
    RAISE EXCEPTION 'p_to must not be earlier than p_from' USING ERRCODE = '22023';
  END IF;

  -- Guard against an accidental unbounded range; a monthly import is ~31 days.
  IF (p_to - p_from) > 400 THEN
    RAISE EXCEPTION 'Date range too wide (% days); resolve at most 400 days at a time', (p_to - p_from)
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH s AS (
    SELECT st.id, st.institution_id, st.category_id, ec.is_teaching
    FROM public.staff st
    JOIN public.employment_categories ec ON ec.id = st.category_id
    WHERE st.id = ANY(p_staff_ids)
  ), d AS (
    SELECT gs::date AS wd FROM generate_series(p_from, p_to, interval '1 day') gs
  )
  SELECT
    s.id,
    d.wd,
    t.id,
    CASE WHEN t.id IS NULL THEN NULL
         WHEN (EXTRACT(ISODOW FROM d.wd) = 6
               AND EXTRACT(DAY FROM d.wd) BETWEEN 8 AND 14
               AND t.second_saturday_holiday) THEN false
         ELSE t.is_working_day END,
    CASE WHEN (EXTRACT(ISODOW FROM d.wd) = 6
               AND EXTRACT(DAY FROM d.wd) BETWEEN 8 AND 14
               AND t.second_saturday_holiday) THEN NULL ELSE t.first_half_start  END,
    CASE WHEN (EXTRACT(ISODOW FROM d.wd) = 6
               AND EXTRACT(DAY FROM d.wd) BETWEEN 8 AND 14
               AND t.second_saturday_holiday) THEN NULL ELSE t.first_half_end    END,
    CASE WHEN (EXTRACT(ISODOW FROM d.wd) = 6
               AND EXTRACT(DAY FROM d.wd) BETWEEN 8 AND 14
               AND t.second_saturday_holiday) THEN NULL ELSE t.second_half_start END,
    CASE WHEN (EXTRACT(ISODOW FROM d.wd) = 6
               AND EXTRACT(DAY FROM d.wd) BETWEEN 8 AND 14
               AND t.second_saturday_holiday) THEN NULL ELSE t.second_half_end   END,
    t.grace_minutes,
    CASE WHEN t.id IS NULL THEN NULL
         WHEN (EXTRACT(ISODOW FROM d.wd) = 6
               AND EXTRACT(DAY FROM d.wd) BETWEEN 8 AND 14
               AND t.second_saturday_holiday) THEN 'second_saturday_holiday'
         ELSE t.staff_scope END
  FROM s
  CROSS JOIN d
  LEFT JOIN LATERAL (
    SELECT tt.*
    FROM public.hr_shift_timings tt
    WHERE tt.institution_id = s.institution_id
      AND tt.day_of_week    = EXTRACT(ISODOW FROM d.wd)::smallint
      AND tt.is_active
      AND tt.effective_from <= d.wd
      AND (tt.effective_until IS NULL OR tt.effective_until > d.wd)
      AND (
           (tt.staff_scope = 'category'     AND tt.employment_category_id = s.category_id)
        OR (tt.staff_scope = 'teaching'     AND s.is_teaching)
        OR (tt.staff_scope = 'non_teaching' AND NOT s.is_teaching)
      )
    ORDER BY CASE tt.staff_scope WHEN 'category' THEN 0 ELSE 1 END,  -- most specific wins
             tt.effective_from DESC
    LIMIT 1
  ) t ON true;
END;
$fn$;

COMMENT ON FUNCTION public.fn_resolve_shift_timings_bulk(uuid[], date, date) IS
  'Set-wise version of fn_resolve_shift_timing for imports: one row per (staff, date) across a range. Identical precedence, effective-dating and second-Saturday handling. Self-authorizing.';

REVOKE ALL ON FUNCTION public.fn_resolve_shift_timings_bulk(uuid[], date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_resolve_shift_timings_bulk(uuid[], date, date) TO authenticated;
