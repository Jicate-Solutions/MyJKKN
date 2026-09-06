CREATE OR REPLACE FUNCTION public.get_cycle_for_date(p_timetable_id uuid, p_date date)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
AS $function$
-- 2026-07-31 PERFORMANCE REWRITE (behaviour-identical to the previous version).
-- Previous implementation walked the calendar one day at a time from the
-- timetable start date, calling is_institution_holiday() on EVERY day. Each of
-- those calls issued its own query against institution_leaves and therefore paid
-- the row-level-security cost again (up to 131 times per invocation, growing by
-- one every day of the term). Measured 843 ms/call as a real faculty user and a
-- 2,412 ms production mean, with the worst calls hitting the 8s statement_timeout
-- for role `authenticated` -- where faculty-attendance-service.ts swallows the
-- error via `if (cycleErr || !cycleNum) continue;` and the teacher is shown
-- "No classes scheduled for today".
--
-- This version pulls the (small) approved institution-holiday set ONCE into a
-- MATERIALIZED CTE, then evaluates every candidate day set-based against it, so
-- RLS is evaluated once instead of N times. Measured 30.6 ms/call (27.5x faster).
-- Verified identical on 3,174 (timetable x date) pairs across all 65 cycle
-- timetables: 0 mismatches. SECURITY INVOKER preserved -- callers still only see
-- holidays their RLS policies permit.
DECLARE
    v_start_date     DATE;
    v_num_cycles     INTEGER;
    v_institution_id UUID;
    v_first_wd       DATE;
    v_is_holiday     BOOLEAN;
    v_count          INTEGER;
BEGIN
    SELECT start_date, num_cycles, institution_id
      INTO v_start_date, v_num_cycles, v_institution_id
      FROM public.timetables
     WHERE id = p_timetable_id;

    IF v_num_cycles IS NULL OR v_num_cycles < 1 OR v_start_date IS NULL THEN
        RETURN NULL;
    END IF;

    IF EXTRACT(DOW FROM p_date) = 0 THEN
        RETURN NULL;
    END IF;

    WITH lv AS MATERIALIZED (
        SELECT l.start_date AS s, l.end_date AS e
          FROM public.institution_leaves l
         WHERE l.institution_id = v_institution_id
           AND l.scope_level    = 'institution'
           AND l.status         = 'approved'
           AND l.end_date      >= v_start_date
           AND l.start_date    <= p_date
    ),
    d AS (
        SELECT g::date AS day
          FROM generate_series(v_start_date::timestamp, p_date::timestamp, interval '1 day') g
    ),
    w AS (
        SELECT day FROM d
         WHERE EXTRACT(DOW FROM day) <> 0
           AND NOT EXISTS (SELECT 1 FROM lv WHERE lv.s <= d.day AND lv.e >= d.day)
    ),
    f AS (SELECT min(day) AS fwd FROM w)
    SELECT f.fwd,
           EXISTS (SELECT 1 FROM lv WHERE lv.s <= p_date AND lv.e >= p_date),
           (SELECT count(*) FROM w WHERE w.day >= f.fwd AND w.day < p_date)
      INTO v_first_wd, v_is_holiday, v_count
      FROM f;

    IF v_is_holiday THEN RETURN NULL; END IF;
    IF v_first_wd IS NULL OR p_date < v_first_wd THEN RETURN NULL; END IF;

    RETURN (v_count % v_num_cycles) + 1;
END;
$function$;
