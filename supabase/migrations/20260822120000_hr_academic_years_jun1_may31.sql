-- ---------------------------------------------------------------------------
-- HR academic years: Apr 1 -> Mar 31  becomes  Jun 1 -> May 31
-- Date: 2026-08-22
-- Applied as supabase_migrations.schema_migrations version 20260822093314.
--
-- WHY: the table was seeded on 2026-08-10 with the Indian financial year, but
-- the group's actual HR leave year runs June to May. The window stays exactly
-- 12 months, so nothing that slices the year into sub-periods needs a
-- companion fix -- see the note on hr_leave_period_window below.
--
-- WHY A LOOP AND NOT ONE SET-BASED UPDATE:
--   hr_academic_years_no_overlap is a non-deferrable
--   EXCLUDE USING gist (daterange(start_date, end_date, '[]') WITH &&)
--   WHERE (is_active). Postgres evaluates it as each row is written, and a
--   set-based UPDATE has no defined row order. Moving 2024-2025 forward while
--   2025-2026 still starts Apr 1 2025 collides on Apr-May 2025. Walking the
--   rows newest-first means every year moves into space its successor has
--   already vacated, so the constraint never sees a transient overlap.
--
-- WHY DATES ARE DERIVED FROM THE NAME, NOT SHIFTED BY +2 MONTHS:
--   same rule as academic_years (see 20260728040000). '2027-2028' means
--   2027-06-01 .. 2028-05-31 regardless of what is currently stored, so a row
--   someone had already hand-corrected converges instead of drifting further.
--
-- BLAST RADIUS (verified against live data before writing this):
--   - hr_leave_applications: all 496 rows start Jun-Nov 2026, inside both the
--     old and the new 2026-2027 window. No row changes year, so no
--     hr_leave_balances.used figure goes stale.
--   - hr_leave_balances / hr_leave_entitlement_overrides / hr_leave_encashments
--     are keyed on hr_academic_year_id, never on dates. Untouched.
--   - hr_leave_period_window derives its blocks from start_date, so quarter and
--     half_year windows follow automatically. Every configured cap in
--     hr_leave_types uses 'month', which returns before the year is read.
--   - v_hr_leave_balance_src splits on frozen_at, not on dates.
-- ---------------------------------------------------------------------------

-- 1. Rollback capture. Mirrors academic_years_dates_rollback_20260728.
CREATE TABLE IF NOT EXISTS public.hr_academic_years_dates_rollback_20260822 (
  id             uuid PRIMARY KEY,
  year_name      text NOT NULL,
  old_start_date date NOT NULL,
  old_end_date   date NOT NULL,
  captured_at    timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.hr_academic_years_dates_rollback_20260822
  (id, year_name, old_start_date, old_end_date)
SELECT id, year_name, start_date, end_date
FROM public.hr_academic_years
ON CONFLICT (id) DO NOTHING;

-- 2. Move the windows, newest first.
DO $$
DECLARE
  r         record;
  v_from    int;
  v_to      int;
  v_start   date;
  v_end     date;
  v_moved   int := 0;
  v_skipped int := 0;
BEGIN
  FOR r IN
    SELECT id, year_name, start_date, end_date
    FROM public.hr_academic_years
    ORDER BY start_date DESC
  LOOP
    IF r.year_name !~ '^\d{4}-\d{4}$' THEN
      RAISE WARNING 'hr_academic_years: "%" is not YYYY-YYYY; dates left untouched', r.year_name;
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_from := split_part(r.year_name, '-', 1)::int;
    v_to   := split_part(r.year_name, '-', 2)::int;

    IF v_to <> v_from + 1 THEN
      RAISE WARNING 'hr_academic_years: "%" is not a consecutive pair; dates left untouched', r.year_name;
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_start := make_date(v_from, 6, 1);
    v_end   := make_date(v_to,   5, 31);

    CONTINUE WHEN (r.start_date, r.end_date) IS NOT DISTINCT FROM (v_start, v_end);

    UPDATE public.hr_academic_years
       SET start_date = v_start,
           end_date   = v_end
     WHERE id = r.id;

    v_moved := v_moved + 1;
  END LOOP;

  RAISE NOTICE 'hr_academic_years: % row(s) moved to Jun 1 -> May 31, % skipped', v_moved, v_skipped;
END $$;

-- 3. Guard: no leave application may be left outside the year it is stored
--    against. True for today's data; this makes it true whenever the migration
--    runs, and aborts the whole transaction rather than orphaning a row.
DO $$
DECLARE v_bad int;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.hr_leave_applications a
  JOIN public.hr_academic_years y ON y.id = a.hr_academic_year_id
  WHERE a.start_date NOT BETWEEN y.start_date AND y.end_date;

  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'hr_academic_years: % leave application(s) would sit outside their stored year; aborting.', v_bad;
  END IF;
END $$;
