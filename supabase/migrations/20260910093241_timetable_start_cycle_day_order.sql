-- BUG-006085 — a cycle timetable that begins mid-term on a day order other than Cycle 1.
--
-- Reported 2026-09-10 by DR. B. PALANISAMY, HOD Chemistry, JKKN College of Arts
-- and Science (Aided): "I PG time table start date - 18.8.2026 and Day order -
-- III, but not matching."
--
-- `timetables.start_date` does two unrelated jobs: it records when the term
-- begins AND it anchors the rotation. get_cycle_for_date defines "Cycle 1 = the
-- first working day on or after start_date", so a timetable could only ever
-- begin on Cycle 1.
--
-- I M.SC CHEMISTRY (27bb781a-4768-4a92-924c-d4d68ad25e82) is anchored
-- 2026-08-18; 23 of the same college's other active cycle timetables are
-- anchored 2026-06-15. 44 working days separate those anchors (Sundays and
-- approved institution holidays excluded) and 44 mod 6 = 2, so this timetable
-- reported Cycle 1 on 18 Aug while the college was on Cycle 3 — and stayed two
-- cycles behind for the whole term. It is a phase SHIFT: it never self-corrects
-- and each timetable stays internally consistent, which is why only the HOD
-- comparing his cohort against the college day order could see it.
--
-- BUG-005837 (2026-08-17) added an authoring-time warning for this shape, but
-- the only remedy it could offer was moving start_date — which would misstate
-- when the programme actually begins. `start_cycle` separates the two meanings:
-- the term still starts 18 Aug, and that first working day carries Cycle 3.

ALTER TABLE public.timetables
  ADD COLUMN IF NOT EXISTS start_cycle INTEGER;

COMMENT ON COLUMN public.timetables.start_cycle IS
  'Cycle-format only. Which cycle (day order) the FIRST working day on or after '
  'start_date carries. NULL means 1, the historic behaviour. Lets a programme '
  'that begins mid-term rotate in step with the rest of its institution without '
  'misstating start_date. Added 2026-09-10 for BUG-006085.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'timetables_start_cycle_range'
  ) THEN
    ALTER TABLE public.timetables
      ADD CONSTRAINT timetables_start_cycle_range
      CHECK (start_cycle IS NULL OR (start_cycle >= 1 AND start_cycle <= 52));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- get_cycle_for_date: honour start_cycle.
--
-- CREATE OR REPLACE, never DROP + CREATE: dropping would discard the EXECUTE
-- grant to `authenticated` and 403 every faculty attendance screen that resolves
-- today's cycle through this function.
--
-- Behaviour is unchanged wherever start_cycle IS NULL, which is every row but
-- the one corrected below. The 2026-07-31 set-based rewrite is preserved
-- verbatim; only the final RETURN gains the offset.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_cycle_for_date(p_timetable_id uuid, p_date date)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
    v_start_date     DATE;
    v_num_cycles     INTEGER;
    v_start_cycle    INTEGER;
    v_institution_id UUID;
    v_first_wd       DATE;
    v_is_holiday     BOOLEAN;
    v_count          INTEGER;
BEGIN
    SELECT start_date, num_cycles, COALESCE(start_cycle, 1), institution_id
      INTO v_start_date, v_num_cycles, v_start_cycle, v_institution_id
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

    -- start_cycle is 1-indexed, so subtract 1 before the modulo and add it back.
    -- The modulo also absorbs a start_cycle left larger than num_cycles by a
    -- later reduction of the cycle count, rather than returning a cycle key that
    -- has no entry in timetable_data.
    RETURN (((v_count + v_start_cycle - 1) % v_num_cycles) + v_num_cycles) % v_num_cycles + 1;
END;
$function$;

-- ---------------------------------------------------------------------------
-- The reported timetable.
--
-- Cycle 3 is not a guess: get_cycle_for_date on any of the 23 timetables
-- anchored 2026-06-15 returns 3 for 2026-08-18. Scoped by start_date and
-- num_cycles so it becomes a no-op if either was changed before this runs.
-- ---------------------------------------------------------------------------
UPDATE public.timetables
   SET start_cycle = 3,
       updated_at  = NOW()
 WHERE id          = '27bb781a-4768-4a92-924c-d4d68ad25e82'
   AND start_date  = '2026-08-18'
   AND num_cycles  = 6
   AND start_cycle IS DISTINCT FROM 3;
