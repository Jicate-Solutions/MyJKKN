-- ============================================================================
-- Migration: 20271008093015_hr_salary_revision_target_scheduled_periods
-- Raise targets: the measurement reads the app's OWN schedule (8 Oct 2026).
-- ============================================================================
-- !!! STACKED ON #4252 (20271007180207_hr_salary_revision_target_gated_raises),
--   merged and applied 7 Oct 2026. Section 0 stops, changing nothing, if
--   #4252's objects are missing, if it is not in the migration ledger, or if
--   any of the four functions this file re-creates is not byte-for-byte the
--   body #4252 wrote (a hand edit on the live database). Measurement STAYS
--   OFF: the switch 'hr.salary_revision.target_measurement_on' is not touched.
--   This file must be merged AND applied before the Director switches it on
--   (default mm classifies the waiting held parts at switch-on with whatever
--   resolver is live then).
--
-- WHY. #4252's hr_salary_revision_target_measure read timetables.timetable_data
-- itself, with SQL that understood only weekday-keyed timetables, while the
-- app's real schedule logic is TypeScript (My Classes:
-- FacultyAttendanceService.getFacultyTodayPeriods). Review round 5 left six
-- findings open. This file fixes them by READING THE SCHEDULE THE APP'S OWN
-- RESOLVER RECORDS, never timetable_data:
--
--   finding                                   change                                         probe
--   1 a replaced timetable double-counts      a period of ANOTHER timetable at an            F1 (probe-schedule.sql)
--     where period names differ               overlapping time the same day is the same
--                                             teaching: only the marked, else the newer
--                                             timetable's counts (default nn)
--   2 cycle / batch / dateless timetables     the measure reads hr_target_scheduled_periods, F2
--     misread                                 written nightly from the app's resolver
--                                             (get_cycle_for_date, RANGE batches, specific
--                                             dates); no timetable_data parsing is left
--   3 department / semester / section         the resolver applies them (approved-leave-     F3
--     holidays ignored                        scope.ts) when the day is recorded; a day whose
--                                             approved holidays changed since is recorded
--                                             again (holiday_key, default pp)
--   4 "teaches" leans on the timetable's      a day recorded ON the day itself (live) shows  F4
--     creation date; first marks start empty  the timetable existed and scheduled them then:
--                                             it counts, whenever the timetable was made;
--                                             90 days not yet recorded: undecided, not
--                                             "does not teach" (default qq)
--   5 T5's last week judged before it ends    a Monday-to-Sunday week counts in the month    F5
--                                             its SUNDAY falls in (default rr)
--   6 leave approved after a month is         a MISSED month whose approved leave changed    F6
--     counted is never taken into account     since it was counted is measured again
--                                             (bounded); met now: released / resumed from
--                                             the next 1st, never backdated, nothing paid
--                                             is taken back (default ss)
--   and: a finished month is counted only once every day it reads is recorded  F7
--        (default oo); a re-created function hand-edited live stops this file  section 0
--
-- REVIEW ROUND 6 (8 Oct 2026), fixed here; probes R6-* in probe-schedule.sql:
--   1 leave covering a whole missed month    re-measured to 'not_counted' (default d),   R6-1
--     only ever flipped it to 'met'          missed_in_row worked out again
--   2 a month waiting for its days let later strictly calendar order: nothing after the  R6-2
--     months be counted and acted first      waiting month is counted (EXIT) or acted on
--     (pause before a release, a miss        (act loop stops before it)
--     counted before the met month)
--   3 a college holiday approved later       the holiday key of a cycle timetable's day     R6-3
--     shifts every later cycle day; only     also keys the college holidays since its start
--     that day was recorded again
--   5 the leave key missed the days before   the key covers the Monday of the week holding   R6-5
--     the 1st that T5 reads (default rr)     the 1st to the month's last day
--   9 listing the days had no time box       hr_target_schedule_needs works one person at a  R6-9
--                                            time and stops after p_budget_ms (the cron
--                                            passes a third of its time, at most 8 s)
--
-- REVIEW ROUND 7 (8 Oct 2026, money review of round 2), fixed here; probes
-- B1-B4 in probe-stale.sql, probe-order.sql and probe-schedule.sql:
--   B1 a recorded day whose holiday key is    a day whose holiday key is not today's key     B1 (probe-stale.sql,
--      stale counted as recorded: a month     counts as NOT recorded (missing_days, so the  probe-schedule.sql)
--      counted on the old schedule            month waits and teaches stays undecided);
--                                             every person's holidays_changed days are listed
--                                             before anyone's missing days; the key stored
--                                             is the one worked out BEFORE the resolver read
--                                             (needs returns it, record takes it)
--   B2 a holiday approved after a month was   each counted month keeps a holiday key of the  B2 (probe-schedule.sql)
--      counted never re-measured it           days its measure reads; a MISSED month whose
--                                             key changed is measured again once those days
--                                             are recorded again (default ss's directions)
--   B3 a flagged month the Director has not   the first finished month that cannot be acted  B3 (probe-order.sql)
--      decided let later months be counted    on yet (waiting for days, flagged, or left
--      and acted on first                     "so far" by the month cap) stops counting and
--                                             acting on every month after it
--   B4 a late met month: the pay step set     the misses in a row are worked out again from  B4 (probe-order.sql)
--      the misses in a row to 0               the months, in calendar order, right after a
--                                             release or resume the re-measure caused (and
--                                             before acting, for a part already paid)
--
-- REVIEW ROUND 8 (8 Oct 2026, round-3 money and safety reviews), fixed here;
-- probes probe-settled-*.sql (RV3-*, R8-*) and R6-9 / R8-U5 in probe-schedule.sql:
--   U1 calendar order kept per case (waiting,  ONE rule: a finished month is SETTLED       RV3-P1, RV3-P4,
--      flagged, capped) missed a counted       when nothing can change its count any more  R8-U1
--      missed month waiting to be measured     (met, Director-decided, not measured, not
--      again on new holidays: later months     counted; or missed and measured on a
--      paused ahead of it (rv3-p1), and the    complete schedule whose leave and holiday
--      window closed on it (rv3-p4)            keys are still the keys now). One loop
--                                              counts and acts in calendar order and stops
--                                              at the first finished month that is not
--                                              settled, whatever the reason; a waiting
--                                              part's window cannot close past one
--                                              (hr_salary_revision_target_month_settled)
--   U2 measurement OFF for one night closed    OFF closes only THIS month as not measured;   RV3-P3
--      every month left "so far", throwing     a finished month still waiting stays
--      away a finished met month               waiting (default ll: still nothing else
--                                              happens while OFF)
--   U3 the keys stored with a measure were     each month's leave and holiday keys are      R8-U3
--      worked out after it (a holiday          worked out ONCE, before its days are checked,
--      approved in between left it "current")  and exactly those are stored
--   U4 the older-flagged-month stop and the    probes and mutation controls for both        R8-U4a, R8-U4b
--      month-cap stop had no probe
--   U5 the stale-day pass could use the whole  that pass works out keys only for days       R6-9, R8-U5
--      time box, leaving missing days unlisted already recorded and stops at HALF the
--                                              time box; the missing-day pass always lists
--                                              one person's days
--
-- REVIEW ROUND 9 (8 Oct 2026, round-4 money review), fixed here; probes
-- probe-settled-wait-off.sql (RV4-*, R9-W3) and R9-W2 in probe-schedule.sql:
--   W1 the window-over count had no lower      the count reads only the window's own        RV4-A1, RV4-A2,
--      bound: months written as not measured   months (window_start to its last month)     RV4-A2b, RV4-B
--      while a part waited for measurement
--      (OFF) counted as window months
--   W2 today's and stale days could fill the   a share of the ROWS (a quarter, at most 50) R9-W2
--      row limit, so no missing day was        is kept for the missing-day pass
--      listed for many nights
--   W3 a finished month final by its status    its keys are not worked out: it is passed    R9-W3
--      still had its keys worked out           over before them
--
-- REVIEW ROUND 12 (8 Oct 2026, round-7 money review), fixed here; probes
-- probe-replay.sql, probe-replay-b.sql, probe-replay-c.sql:
--   R7 seven rounds each found a new month   run_one's decision is a REPLAY: after the     R7 (i), R7 (ii),
--      ORDER bug in the act loop's step-by-   months are measured and settled as before,   R12-H
--      step decisions (incremental missed-    the state the held part should be in is
--      in-row, window, pause/resume steps).   worked out from scratch by walking every
--      The last: a late re-measure turns an   settled month of the plan in calendar order
--      old missed month met, the part is      from its window start (rulings 3 and 4; not
--      released or resumed, the misses since  counted / not measured skipped, ruling (a)),
--      then are already at the rule but were  up to the first month not settled. Only the
--      acted on before, so nothing pauses it: change from where it stands is written,
--      it stays paid                          from the next 1st (never backdated, no pay
--                                             row undone). A paused part is paid again only
--                                             on a month on target (ruling (b)); released
--                                             and paused again within the months settled
--                                             now writes no pay (paused from the next 1st);
--                                             nothing is written while a change already
--                                             written stands on a month at or after the
--                                             stop. missed_in_row = the replay's count
--                                             (left as it stands while a month waits and
--                                             nothing before it moved)
--
-- THE CONTRACT between the nightly job and the measure
--   lib/services/hr/salary-revision/scheduled-periods-recorder.ts, run by
--   /api/cron/hr-salary-revisions?mode=targets BEFORE the measure, asks
--   fn_hr_target_schedule_needs() which (team member, day) pairs to record,
--   calls FacultyAttendanceService.getFacultyTodayPeriods(staff, day,
--   { client: service role, includeInactive: true, teachingInstitutionIds })
--   for each, and hands the period cards to fn_hr_target_schedule_record(),
--   which keeps one row per person per day in hr_target_scheduled_periods:
--     periods  jsonb array, each element exactly
--       { timetable_id uuid, institution_id uuid|null, slot_id text,
--         period_name text|null  (the card's name: what the mark page saves),
--         course_id uuid|null, section_ids text[], start_time 'HH:MM'|null,
--         end_time 'HH:MM'|null, is_primary boolean (primary_staff_id = them),
--         kind 'slot'|'sub_slot'|'practical' }
--     recorded_live  true once the day was recorded on the day itself (sticky)
--     holiday_key    md5 of the approved holidays covering that day in the
--                    institutions they teach in, as they stood when recorded
--                    (round 7: as the listing worked them out BEFORE the day
--                    was read; the listing returns it, the job passes it back).
--                    A row whose key is not the day's key now is stale and
--                    counts as not recorded until the day is recorded again.
--   Recording a day again replaces that day's list (an upsert: nothing is
--   deleted). The measure reads ONLY this table.
--
-- DIRECTOR RULINGS (8 Oct 2026, 05:30, first-hand)
--   (a) Option A: a month not measured, not counted or Director-decided is
--       skipped over in a run of missed months (#4252 default d). Once paid,
--       the run (and the nightly listing) reaches back to the first month of
--       the current run of misses: the month after the last met or decided
--       met month acted on, never before the window start. A pause comes only
--       once every month of that run is settled; the closing of an older month
--       left "so far" (default aa) never reaches a month the stop holds.
--   (b) A part paused by a month later excused stays paused until a month on
--       target; no backdating (ss below).
--   (c) A split week counts in the month it ENDS in (rr).
--   (d) Only the MAIN teacher is measured (tt).
--   (e) A combined class at the same hour in two timetables counts ONCE (nn).
--   (f) A month with a missing schedule day WAITS (oo).
--   (g) not_counted is final even if the leave behind it is later cancelled.
--   (h) "Teaches" waits ("being set up") until the 90 days are recorded (qq).
--   (i) A wrongly made timetable still counts until HR deletes or end-dates it
--       (uu): deleting it drops its periods from every day; end-dating it stops
--       the days after the new end date from being recorded with it (the
--       resolver reads a timetable by its dates), and a day already recorded
--       keeps the periods it was recorded with (until it is recorded again,
--       e.g. for a holiday change).
--
-- DEFAULTS TAKEN (8 Oct 2026) — overrule here
--   nn. (finding 1) Two periods on the same day from DIFFERENT timetables whose
--       times overlap are one teaching: only one counts (the marked one, else
--       the newer timetable). Periods of ONE timetable never merge. A period
--       with no start or end time can only merge by name (as before). A chain
--       (A overlaps B overlaps C, A not C) keeps only the best: rare, accepted.
--   oo. A finished month is counted only when every day it reads (the month,
--       and the days before the 1st in the week that holds the 1st) has a row
--       in the schedule record. Until then it stays "so far" and the plan's
--       run note says which month waits. Round 6: strictly in calendar order:
--       no later month is counted or acted on (not even measured "so far")
--       until it is. Round 8: one rule for every such stop (settled, U1); a
--       missed month waiting to be measured again stops later months the
--       same way. Director ruling (a), 8 Oct 2026: once paid, the run
--       measures the whole current run of misses (from the month after the
--       last met month acted on, never before the window start), so a month
--       in that run never ages out while it waits: it stops the months after
--       it until it is settled, and no pause comes before it is.
--   pp. (finding 3) A recorded day is recorded again when the approved holidays
--       covering it, in the institutions the person teaches in (own college and
--       staff-plan colleges, as fn_staff_teaching_institutions), changed since.
--       Round 6: for a college with a cycle timetable running that day, also
--       its approved college-wide holidays since that timetable began (they
--       number the cycle: get_cycle_for_date). A change to a timetable itself
--       (its start date, cycle count or start cycle) is NOT keyed, as no
--       timetable edit is (default uu).
--       College-wide approved holidays and off-days are still left out by the
--       measure itself as well.
--   qq. (finding 4) "Teaches" (default y) = periods as the main teacher, in the
--       90 days before, on a day in the schedule record, where the timetable
--       was made before the range began, OR they first-marked in it, OR the day
--       was recorded live. Not all 90 days recorded and nothing found yet:
--       undecided; the held part stays 'awaiting_measurement' (reason
--       schedule_not_recorded, run note) and is classified on a later night.
--       Backfilled days (recorded after the fact) only count through the first
--       two: a timetable made just before the yes cannot make anyone a teacher.
--   rr. (finding 5) A Monday-to-Sunday week counts in the month its SUNDAY falls
--       in. The run on the 1st therefore judges only weeks that have ended; a
--       week that starts in one month and ends in the next is judged with the
--       next month (its pulses in either month count, opened in that week).
--       Round 6: the leave key (ss) covers those days too.
--   ss. (finding 6) Each counted month keeps a key of the person's approved
--       leave overlapping the days its measure reads. A MISSED month whose key changed is measured again
--       (only months the run still measures: the window while waiting, the
--       current run of misses once paid (ruling (a)); within the per-call month
--       cap). Met now:
--       waiting -> released from the next 1st; paused -> resumed from the next
--       1st; released -> the month counts as met and the missed-in-a-row count
--       is worked out again (round 12: all of this by the replay of every settled
--       month, so the misses after it pause the part when they reach the rule).
--       Never backdated; nothing paid is taken back; a met
--       month is never re-measured into a missed one. Round 6: leave now
--       covering every period of the month makes it 'not_counted' (default d)
--       and the count is worked out again; a part already PAUSED by that month
--       stays paused (paid again after a month on target, as before): Director
--       ruling (b), 8 Oct 2026, no backdating.
--       Round 8: a month 'not_counted' is final, like a met one: it is not
--       measured again if the leave that emptied it is withdrawn (Director
--       ruling (g), 8 Oct 2026).
--   tt. Only periods where the person is the slot's MAIN teacher
--       (primary_staff_id) count, as in #4252. The resolver also lists periods
--       where they are a co-teacher (staff_ids), in a sub-slot group or a
--       practical batch: they are recorded (is_primary false) but not counted.
--   uu. Every day is read with timetables switched off since included (the
--       daily job switches a timetable off the day after it ends; default dd).
--       A day recorded after the fact reads the timetable as it is THEN.
--   vv. Who is recorded: everyone with a held part in play (any open state)
--       and everyone with a raise asked for and not yet decided or applied.
--       Days: today (live) for each; the days their classification or
--       measurement will read (ruling (a): for a paid part, its whole current
--       run of misses, never before its window start; no 400-day cut any
--       more). Today first for everyone,
--       then one person at a time (days whose holidays changed, then missing
--       days newest first), in an order that turns every night. Round 6: the
--       listing is time-boxed (p_budget_ms). How many days a night actually
--       gets recorded is bounded by the cron's 25 s share and the resolver's
--       speed, NOT by the range (see the PR for the estimate).
--   ww. The schedule record is written only by the nightly job (service role);
--       no signed-in person reads or writes it. A day not yet begun is refused.
--
-- WHAT
--   a. Table hr_target_scheduled_periods (RLS on; no grants to anon or
--      authenticated; service role reads; written only by
--      hr_target_schedule_record). Columns hr_salary_revision_target_months.leave_key
--      and (round 7) .holiday_key. Round 7: this file's own listing and record
--      functions dropped and created again (their result and arguments changed).
--   b. hr_target_schedule_institutions, hr_target_schedule_holiday_key,
--      hr_target_schedule_missing_days, hr_salary_revision_target_leave_key,
--      (round 7) hr_salary_revision_target_holiday_key,
--      hr_salary_revision_target_missed_in_row, (round 8)
--      hr_salary_revision_target_month_settled,
--      hr_target_schedule_ranges, hr_target_schedule_needs,
--      hr_target_schedule_record (all internal) and
--      fn_hr_target_schedule_needs(), fn_hr_target_schedule_record() (service
--      role only, for the cron route).
--   c-e. Re-created from #4252: hr_salary_revision_target_measure (reads the
--      record; nn, rr), hr_salary_revision_target_teaches (qq),
--      hr_salary_revision_target_classify (undecided -> awaiting) and
--      hr_salary_revision_targets_run_one (oo, ss, awaiting stays awaiting).
--      Every line of #4252 they still need is kept as it was, except
--      run_one's act loop: since round 12 its decision is the replay (rulings
--      3 and 4 restated there, one rule per line).
--   f. Self-check of the four bodies.
--
-- Nothing is verified against live data: production was not read while
-- writing this file. Applying it changes nobody's pay and writes no rows.
-- Idempotent: CREATE ... IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, CREATE OR
-- REPLACE, DROP POLICY IF EXISTS. No inner BEGIN/COMMIT.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. #4252 first, unchanged. Stop here, changing nothing, if not.
-- ----------------------------------------------------------------------------
DO $check$
DECLARE
  v_recorded boolean;
BEGIN
  IF to_regprocedure('public.hr_salary_revision_target_measure(uuid, date, jsonb)') IS NULL
     OR to_regprocedure('public.hr_salary_revision_target_teaches(uuid, date, date)') IS NULL
     OR to_regprocedure('public.hr_salary_revision_target_classify(uuid, jsonb, date)') IS NULL
     OR to_regprocedure('public.hr_salary_revision_targets_run_one(uuid, date, integer)') IS NULL
     OR to_regclass('public.hr_salary_revision_target_months') IS NULL
     OR to_regclass('public.attendance_first_marks') IS NULL THEN
    RAISE EXCEPTION 'ABORT: #4252''s objects are missing. Apply 20271007180207_hr_salary_revision_target_gated_raises first.';
  END IF;
  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations'
                  AND column_name = 'name') THEN
      EXECUTE 'SELECT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = $1 OR name LIKE $2)'
        INTO v_recorded USING '20271007180207', '%hr_salary_revision_target_gated_raises%';
    ELSE
      EXECUTE 'SELECT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = $1)'
        INTO v_recorded USING '20271007180207';
    END IF;
    IF NOT v_recorded THEN
      RAISE EXCEPTION 'ABORT: 20271007180207 (#4252) is not recorded in supabase_migrations.schema_migrations. Apply #4252 through the wave first.';
    END IF;
  END IF;
END
$check$;

-- Drift check: the four functions re-created below must be, on this database,
-- exactly the bodies #4252 wrote (or this file's own, when it is applied a
-- second time). Fingerprint: md5 of the body without carriage returns and
-- outer blank space, whether it is SECURITY DEFINER, and its settings. A body
-- edited by hand on the live database stops this file here.
DO $drift$
DECLARE
  c_check_drift CONSTANT boolean := true;
  v_fn  text;
  v_ok  text[];
  v_fp  text;
BEGIN
  IF NOT c_check_drift THEN
    RETURN;
  END IF;
  FOR v_fn, v_ok IN
    SELECT x.fn, x.ok FROM (VALUES
      ('public.hr_salary_revision_target_measure(uuid, date, jsonb)',
       ARRAY['c23c9ee34d6149f34b55a92268fdfca4|false|search_path=public', '44d35da412fe82ff45e34fae64a73ede|false|search_path=public']),
      ('public.hr_salary_revision_target_teaches(uuid, date, date)',
       ARRAY['3a64dd8ca8c762c56ac63554b3e9f9e5|true|search_path=public', 'd34bb1dc0515c15e7b789d44e6887c98|true|search_path=public']),
      ('public.hr_salary_revision_target_classify(uuid, jsonb, date)',
       ARRAY['0eac67dcaecb3d25f5f397ed3a3c10a4|true|search_path=public', 'e4679c8456521dc0096c9b7bdd21627c|true|search_path=public']),
      ('public.hr_salary_revision_targets_run_one(uuid, date, integer)',
       ARRAY['7cbbb8dbe04a7deb5c80414700d2e0d3|true|search_path=public', 'e6e3cf461c929266d665d602816d8626|true|search_path=public'])) x(fn, ok)
  LOOP
    SELECT md5(btrim(replace(p.prosrc, E'\r', ''), E' \t\n')) || '|' || p.prosecdef::text || '|'
           || COALESCE(array_to_string(p.proconfig, ','), '')
      INTO v_fp
      FROM pg_proc p WHERE p.oid = to_regprocedure(v_fn);
    IF v_fp IS NULL OR NOT (v_fp = ANY (v_ok)) THEN
      RAISE EXCEPTION 'ABORT: % on this database is not the body #4252 (20271007180207) wrote (fingerprint %). It was changed by hand: compare it with main before applying 20271008093015.', v_fn, v_fp;
    END IF;
  END LOOP;
END
$drift$;

-- ----------------------------------------------------------------------------
-- a. The schedule record
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_target_scheduled_periods (
  staff_id          uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  day               date NOT NULL,
  periods           jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(periods) = 'array'),
  recorded_live     boolean NOT NULL DEFAULT false,
  holiday_key       text NOT NULL,
  resolver          text NOT NULL,
  first_recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (staff_id, day)
);

COMMENT ON TABLE public.hr_target_scheduled_periods IS
  'Raise targets (8 Oct 2026): the periods a team member was SCHEDULED to teach on a day, as the app''s own resolver '
  '(FacultyAttendanceService.getFacultyTodayPeriods, My Classes) gave them to the nightly job. One row per person per '
  'day; recording the day again replaces its list. recorded_live: once recorded on the day itself. holiday_key: the '
  'approved holidays covering the day when recorded. Read by hr_salary_revision_target_measure and _teaches. Written '
  'only by hr_target_schedule_record. Migration 20271008093015.';

ALTER TABLE public.hr_target_scheduled_periods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hr_target_scheduled_periods_service_role ON public.hr_target_scheduled_periods;
CREATE POLICY hr_target_scheduled_periods_service_role ON public.hr_target_scheduled_periods
  FOR SELECT TO service_role USING (true);
REVOKE ALL ON public.hr_target_scheduled_periods FROM anon, PUBLIC, authenticated, service_role;
GRANT SELECT ON public.hr_target_scheduled_periods TO service_role;

-- Default ss: the person's approved leave overlapping a counted month, as it
-- stood when the month was measured.
ALTER TABLE public.hr_salary_revision_target_months ADD COLUMN IF NOT EXISTS leave_key text;

COMMENT ON COLUMN public.hr_salary_revision_target_months.leave_key IS
  'Default ss (8 Oct 2026): a key of the person''s approved leave overlapping the month when it was measured. A missed '
  'month whose key changes is measured again. Migration 20271008093015.';

-- Round 7 (B2): the approved holidays covering the days a counted month's
-- measure reads, as they stood when the month was measured.
ALTER TABLE public.hr_salary_revision_target_months ADD COLUMN IF NOT EXISTS holiday_key text;

COMMENT ON COLUMN public.hr_salary_revision_target_months.holiday_key IS
  'Round 7 (8 Oct 2026): a key of the approved holidays covering the days the month''s measure read, when it was '
  'measured. A missed month whose key changes is measured again once those days are recorded again. '
  'Migration 20271008093015.';

-- Round 7 (B1): the listing now also returns the holiday key it worked out
-- (a new result column, which CREATE OR REPLACE cannot add) and the record
-- takes it (a new argument). So THIS file's own four functions are dropped
-- here and created again below: real deletes, of functions only this file
-- makes (main and production have none of them; on a second apply they are
-- the ones this file made the first time).
DROP FUNCTION IF EXISTS public.fn_hr_target_schedule_needs(integer, integer);
DROP FUNCTION IF EXISTS public.hr_target_schedule_needs(date, integer, integer);
DROP FUNCTION IF EXISTS public.fn_hr_target_schedule_record(uuid, date, jsonb, text);
DROP FUNCTION IF EXISTS public.hr_target_schedule_record(uuid, date, jsonb, text, date);

-- ----------------------------------------------------------------------------
-- b. The helpers
-- ----------------------------------------------------------------------------
-- The institutions a team member teaches in: their own and their staff-plan
-- colleges (the rule of fn_staff_teaching_institutions, which refuses a caller
-- with no signed-in user, such as the nightly job).
CREATE OR REPLACE FUNCTION public.hr_target_schedule_institutions(p_staff_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_agg(DISTINCT x.inst_id ORDER BY x.inst_id), ARRAY[]::uuid[])
    FROM (SELECT s.institution_id AS inst_id FROM public.staff s WHERE s.id = p_staff_id
          UNION
          SELECT sp.institution_id
            FROM public.staff_plan_courses spc
            JOIN public.staff_plans sp ON sp.id = spc.staff_plan_id
           WHERE spc.staff_id = p_staff_id) x
   WHERE x.inst_id IS NOT NULL
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_target_schedule_institutions(uuid) FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.hr_target_schedule_institutions(uuid) IS
  'Internal (8 Oct 2026). The colleges a team member teaches in: own and staff-plan colleges, as '
  'fn_staff_teaching_institutions. Migration 20271008093015.';

-- Default pp: the approved holidays covering a day in those colleges, as one key.
-- 8 Oct 2026 (review round 6, finding 3): and, where a college has a CYCLE
-- timetable running that day, its approved college-wide holidays from that
-- timetable's start up to the day. get_cycle_for_date numbers a day by the
-- working days since the start (college-wide approved holidays and Sundays
-- skipped), so a holiday approved later for an earlier day moves the cycle of
-- every day after it: the key of each of those days changes and each is
-- recorded again. The earliest start among a college's cycle timetables is
-- used, so a few more days may be recorded again than strictly needed, never
-- fewer. With no such holiday the key is exactly the day's own.
CREATE OR REPLACE FUNCTION public.hr_target_schedule_holiday_key(p_institution_ids uuid[], p_day date)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT md5(
    COALESCE((SELECT string_agg(
                l.id::text || ':' || l.start_date::text || ':' || l.end_date::text || ':'
                || COALESCE(array_to_string(l.department_ids, ','), '') || ':'
                || COALESCE(array_to_string(l.semester_ids, ','), '') || ':'
                || COALESCE(array_to_string(l.section_ids, ','), ''),
                ';' ORDER BY l.id)
                FROM public.institution_leaves l
               WHERE l.institution_id = ANY (COALESCE(p_institution_ids, ARRAY[]::uuid[]))
                 AND l.status = 'approved'
                 AND p_day BETWEEN l.start_date AND l.end_date), '')
    -- 8 Oct 2026 (finding 3): the holidays a cycle timetable's numbering of this day depends on.
    || COALESCE((SELECT '|cycle:' || string_agg(l.id::text || ':' || l.start_date::text || ':' || l.end_date::text,
                                                ';' ORDER BY l.id)
                   FROM public.institution_leaves l
                   JOIN (SELECT t.institution_id, min(t.start_date) AS anchor
                           FROM public.timetables t
                          WHERE t.institution_id = ANY (COALESCE(p_institution_ids, ARRAY[]::uuid[]))
                            AND t.timetable_format = 'cycle'
                            AND COALESCE(t.is_template, false) = false
                            AND p_day BETWEEN t.start_date AND t.end_date
                          GROUP BY t.institution_id) c ON c.institution_id = l.institution_id
                  WHERE l.status = 'approved' AND l.scope_level = 'institution'
                    AND l.end_date >= c.anchor AND l.start_date < p_day), ''))
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_target_schedule_holiday_key(uuid[], date) FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.hr_target_schedule_holiday_key(uuid[], date) IS
  'Internal (default pp, 8 Oct 2026). A key of the approved holidays (institution_leaves, any scope) covering the day '
  'in those colleges and, for a college with a cycle timetable running that day, its approved college-wide holidays '
  'since that timetable began (they number the cycle). A recorded day whose key changed is recorded again. '
  'Migration 20271008093015.';

-- Default oo: how many days of a range have no row in the schedule record.
-- 8 Oct 2026 (review round 7, B1): a row whose holiday key is not the day's
-- key now (a holiday approved, changed or withdrawn since it was recorded) is
-- stale: it counts as NOT recorded until the job records the day again, so a
-- month is never counted, nor anyone found not to teach, on the old schedule.
CREATE OR REPLACE FUNCTION public.hr_target_schedule_missing_days(p_staff_id uuid, p_from date, p_to date)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT GREATEST((p_to - p_from + 1) - (SELECT count(*)::int FROM public.hr_target_scheduled_periods sp
                                          CROSS JOIN (SELECT public.hr_target_schedule_institutions(p_staff_id) AS ids) i
                                          WHERE sp.staff_id = p_staff_id AND sp.day BETWEEN p_from AND p_to
                                            AND sp.holiday_key = public.hr_target_schedule_holiday_key(i.ids, sp.day)), 0)
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_target_schedule_missing_days(uuid, date, date) FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.hr_target_schedule_missing_days(uuid, date, date) IS
  'Internal (default oo, 8 Oct 2026). The days of the range with no up-to-date row in hr_target_scheduled_periods '
  'for the person: no row, or a row whose holiday key is not the day''s key now (round 7, B1). '
  'Migration 20271008093015.';

-- Round 7 (B2): the approved holidays covering a range of days, as one key:
-- each day's own key (default pp) in the person's colleges, in order.
CREATE OR REPLACE FUNCTION public.hr_salary_revision_target_holiday_key(p_staff_id uuid, p_from date, p_to date)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT md5(COALESCE(string_agg(public.hr_target_schedule_holiday_key(i.ids, g::date), ';' ORDER BY g), ''))
    FROM generate_series(p_from, p_to, interval '1 day') g
   CROSS JOIN (SELECT public.hr_target_schedule_institutions(p_staff_id) AS ids) i
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_target_holiday_key(uuid, date, date) FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.hr_salary_revision_target_holiday_key(uuid, date, date) IS
  'Internal (round 7, B2, 8 Oct 2026). A key of the approved holidays covering each day of the range in the '
  'colleges the person teaches in (hr_target_schedule_holiday_key, day by day). Migration 20271008093015.';

-- Round 7 (B4): the missed months in a row of a raise, worked out from its
-- months in calendar order: the missed months acted on after the last month
-- acted on as met. A month not counted (or not measured) neither adds nor resets.
CREATE OR REPLACE FUNCTION public.hr_salary_revision_target_missed_in_row(p_request_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT count(*)::int FROM public.hr_salary_revision_target_months mo
   WHERE mo.request_id = p_request_id AND mo.acted
     AND mo.status IN ('missed', 'decided_missed')
     AND mo.month > COALESCE((SELECT max(m2.month) FROM public.hr_salary_revision_target_months m2
                               WHERE m2.request_id = p_request_id AND m2.acted
                                 AND m2.status IN ('met', 'decided_met')), '-infinity'::date)
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_target_missed_in_row(uuid) FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.hr_salary_revision_target_missed_in_row(uuid) IS
  'Internal (round 7, B4, 8 Oct 2026). The missed months in a row of a raise, from its months in calendar order: '
  'missed months acted on after the last met month acted on. Since round 12 the monthly run no longer calls it: '
  'its replay (hr_salary_revision_targets_run_one) works out the count and stores it. Migration 20271008093015.';

-- Default ss: the person's approved leave overlapping a range, as one key.
-- 8 Oct 2026 (review round 6, finding 5): run_one asks it for the days the
-- month's measure reads: from the Monday of the week holding the 1st (T5
-- judges that week in this month, default rr) to the month's last day.
CREATE OR REPLACE FUNCTION public.hr_salary_revision_target_leave_key(p_staff_id uuid, p_from date, p_to date)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT md5(COALESCE(string_agg(la.id::text || ':' || la.start_date::text || ':' || la.end_date::text, ';'
                                 ORDER BY la.id), ''))
    FROM public.hr_leave_applications la
   WHERE la.employee_id = p_staff_id AND la.status = 'approved'
     AND la.start_date <= p_to AND la.end_date >= p_from
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_target_leave_key(uuid, date, date) FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.hr_salary_revision_target_leave_key(uuid, date, date) IS
  'Internal (default ss, 8 Oct 2026). A key of the person''s approved leave (hr_leave_applications) overlapping the '
  'range. Migration 20271008093015.';

-- Round 8 (U1, 8 Oct 2026): ONE rule for calendar order. A finished month is
-- SETTLED when nothing can change its count any more:
--   met, decided_met, decided_missed, not_measured: final by their status (a
--     met month is never measured again, default ss; a Director's decision
--     stands; a month not measured stays so);
--   not_counted: final as well (it neither adds nor resets, and no rule
--     measures it again; Director ruling (g), 8 Oct 2026: final even if the
--     leave behind it is later cancelled);
--   missed: only while it was measured on a complete, CURRENT schedule: every
--     day it reads recorded with today's holiday key (missing_days = 0) and
--     its stored leave and holiday keys equal to the keys now;
--   anything else (no row, "so far", flagged and not yet decided) is not.
-- The monthly run counts and acts on months in calendar order and stops at
-- the first finished month that is not settled, whatever the reason; a window
-- goes back to the Director only once every one of its months is settled.
-- The keys "now" are passed in when the caller worked them out already (run_one
-- works them out ONCE per month, before the days are checked, and stores
-- exactly those with the measure: U3); otherwise they are worked out here.
CREATE OR REPLACE FUNCTION public.hr_salary_revision_target_month_settled(
  p_request_id uuid, p_staff_id uuid, p_month date, p_leave_key text DEFAULT NULL, p_holiday_key text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
  v_lkey   text;
  v_hkey   text;
  v_d0     date := date_trunc('week', p_month)::date;
  v_d1     date := (p_month + interval '1 month' - interval '1 day')::date;
BEGIN
  SELECT mo.status, mo.leave_key, mo.holiday_key INTO v_status, v_lkey, v_hkey
    FROM public.hr_salary_revision_target_months mo
   WHERE mo.request_id = p_request_id AND mo.month = p_month;
  IF v_status IN ('met', 'decided_met', 'decided_missed', 'not_measured', 'not_counted') THEN
    RETURN true;
  END IF;
  IF v_status IS DISTINCT FROM 'missed' THEN
    RETURN false;
  END IF;
  RETURN v_lkey IS NOT DISTINCT FROM COALESCE(p_leave_key, public.hr_salary_revision_target_leave_key(p_staff_id, v_d0, v_d1))
     AND v_hkey IS NOT DISTINCT FROM COALESCE(p_holiday_key, public.hr_salary_revision_target_holiday_key(p_staff_id, v_d0, v_d1))
     AND public.hr_target_schedule_missing_days(p_staff_id, v_d0, v_d1) = 0;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_target_month_settled(uuid, uuid, date, text, text) FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.hr_salary_revision_target_month_settled(uuid, uuid, date, text, text) IS
  'Internal (round 8, 8 Oct 2026). True when a finished month of a raise can no longer change its count: met, '
  'Director-decided, not measured or not counted; or missed and measured on a complete schedule whose leave and '
  'holiday keys are still the keys now. The monthly run stops at the first finished month that is not settled. '
  'Migration 20271008093015.';

-- Default vv: who the nightly job records, and from which day to which.
CREATE OR REPLACE FUNCTION public.hr_target_schedule_ranges(p_today date)
RETURNS TABLE(staff_id uuid, from_day date, to_day date)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH
people AS (
  -- A held part in play: the days its classification or measurement will read.
  SELECT p.staff_id,
         CASE WHEN p.state = 'awaiting_measurement' THEN p_today - 90
              WHEN p.state = 'waiting' THEN date_trunc('week', p.window_start)::date
              -- 8 Oct 2026 (Director ruling (a), option A): a paid part's
              -- run_one reads the whole current run of misses (from the month
              -- after the last met month acted on, never before the window
              -- start), so its days are recorded from there.
              ELSE date_trunc('week', GREATEST(p.window_start,
                     COALESCE((SELECT (max(mo.month) + interval '1 month')::date
                                 FROM public.hr_salary_revision_target_months mo
                                WHERE mo.request_id = p.request_id AND mo.acted
                                  AND mo.status IN ('met', 'decided_met')), p.window_start)))::date
         END AS from_day,
         CASE WHEN p.state = 'waiting'
              THEN LEAST(p_today, (p.window_start + make_interval(months => p.window_months) - interval '1 day')::date)
              ELSE p_today END AS to_day
    FROM public.hr_salary_revision_target_plans p
   WHERE p.state IN ('awaiting_measurement', 'waiting', 'released', 'paused')
  UNION ALL
  -- A raise asked for and not yet decided or applied: the 90 days its
  -- classification would read at the yes.
  SELECT r.staff_id, p_today - 90, p_today
    FROM public.hr_salary_revision_requests r
   WHERE r.status IN ('waiting_principal', 'waiting_director', 'approved')
     AND r.staff_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.hr_salary_revision_target_plans p WHERE p.request_id = r.id)
)
-- 8 Oct 2026 (Director ruling (a)): no longer cut at 400 days back. The
-- widest range is a paid part's run of misses, which never starts before its
-- window start; a cut there would leave a stale day of an old month in the run
-- never recorded again, and the part could then never be paused or paid again.
-- The listing stays bounded by its row limit and time box (hr_target_schedule_needs).
SELECT x.staff_id, min(x.from_day), LEAST(max(x.to_day), p_today)
  FROM people x
 GROUP BY x.staff_id
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_target_schedule_ranges(date) FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.hr_target_schedule_ranges(date) IS
  'Internal (default vv, 8 Oct 2026). Everyone the nightly job records (a held part in play, or a raise asked for and '
  'not yet decided or applied) with the days their classification or measurement will read: for a paid part, the '
  'whole current run of missed months, never before its window start (Director ruling (a), 8 Oct 2026). '
  'Migration 20271008093015.';

-- Default vv: the (person, day) pairs the nightly job should record: today
-- first for everyone, then one person at a time (days whose holidays changed,
-- then missing days newest first), in an order that turns every night.
-- 8 Oct 2026 (review round 6, finding 9): time-boxed. Once p_budget_ms has
-- passed no further person is worked out; what is found so far is returned
-- and the rest are asked for on a later night.
-- 8 Oct 2026 (review round 7, B1): every person's days whose holidays changed
-- come before anyone's missing days (a stale day can hold a counted month on
-- the old schedule; a missing one only makes it wait), and each pair carries
-- the day's holiday key as worked out NOW, before the resolver reads the day:
-- the job hands it back to hr_target_schedule_record, so a holiday approved
-- while the day is being read leaves the row stale (recorded again), never
-- fresh on an old reading.
-- Round 8 (U5, 8 Oct 2026): the stale-day pass may use only half the time box
-- (and works out keys only for days already recorded); the missing-day pass
-- always lists at least one person's days.
CREATE OR REPLACE FUNCTION public.hr_target_schedule_needs(p_today date, p_limit integer, p_budget_ms integer DEFAULT NULL)
RETURNS TABLE(staff_id uuid, day date, institution_ids uuid[], reason text, holiday_key text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_started timestamptz := clock_timestamp();
  v_left    integer := GREATEST(COALESCE(p_limit, 0), 0);
  v_got     integer;
  v_r       record;
  v_pass    integer;
  v_first   boolean;  -- round 8 (U5): the first person of a pass
  v_keep    integer;  -- 8 Oct 2026 (round 9, W2): rows kept back for the missing-day pass
BEGIN
  IF v_left = 0 THEN
    RETURN;
  END IF;
  -- 8 Oct 2026 (round 9, W2): a share of the ROWS is kept for the missing-day
  -- pass (a quarter, at most 50, at least 1 once two rows are asked for):
  -- today's days and the stale days together never fill the whole limit.
  v_keep := CASE WHEN v_left >= 2 THEN LEAST(50, GREATEST(1, v_left / 4)) ELSE 0 END;
  -- Today, for everyone not yet recorded today (recorded on the day itself).
  RETURN QUERY
    SELECT r.staff_id, p_today, x.ids, 'live'::text, public.hr_target_schedule_holiday_key(x.ids, p_today)
      FROM public.hr_target_schedule_ranges(p_today) r
     CROSS JOIN LATERAL (SELECT public.hr_target_schedule_institutions(r.staff_id) AS ids) x
     WHERE NOT EXISTS (SELECT 1 FROM public.hr_target_scheduled_periods sp
                        WHERE sp.staff_id = r.staff_id AND sp.day = p_today)
     -- 8 Oct 2026 (round 10): the least recently recorded on the day itself
     -- first (never: first of all), so with more people than the limit the
     -- same people are not left out of the live record every night.
     ORDER BY (SELECT max(sp.day) FROM public.hr_target_scheduled_periods sp
                WHERE sp.staff_id = r.staff_id AND sp.recorded_live) NULLS FIRST, r.staff_id
     LIMIT v_left - v_keep;
  GET DIAGNOSTICS v_got = ROW_COUNT;
  v_left := v_left - v_got;
  -- Round 7 (B1): pass 1 lists the days whose holidays changed, for everyone;
  -- pass 2 the missing days, newest first.
  -- Round 8 (U5): pass 1 works out keys only for days that have a row, and
  -- stops at HALF the time box, so pass 2 always has the other half; pass 2
  -- always goes on until it has listed one person's missing days, whatever
  -- time is left. 8 Oct 2026 (round 9, W2): and pass 2 always has the rows
  -- kept back above, so (with two rows or more asked for) a night is never
  -- spent on today's and stale days alone: missing days are listed too.
  FOR v_pass IN 1..2 LOOP
    v_first := true;
    FOR v_r IN
      SELECT r.staff_id, r.from_day, r.to_day, public.hr_target_schedule_institutions(r.staff_id) AS ids
        FROM public.hr_target_schedule_ranges(p_today) r
       ORDER BY md5(r.staff_id::text || p_today::text), r.staff_id
    LOOP
      EXIT WHEN v_left <= 0;
      EXIT WHEN v_pass = 1 AND v_left <= v_keep;  -- 8 Oct 2026 (round 9, W2)
      EXIT WHEN v_pass = 1 AND p_budget_ms IS NOT NULL AND clock_timestamp() - v_started > make_interval(secs => p_budget_ms / 2000.0);
      EXIT WHEN v_pass = 2 AND NOT v_first
                AND p_budget_ms IS NOT NULL AND clock_timestamp() - v_started > make_interval(secs => p_budget_ms / 1000.0);
      IF v_pass = 1 THEN
        RETURN QUERY
          SELECT v_r.staff_id, j.day, v_r.ids, 'holidays_changed'::text, j.key_now
            FROM (SELECT sp.day, sp.holiday_key, public.hr_target_schedule_holiday_key(v_r.ids, sp.day) AS key_now
                    FROM public.hr_target_scheduled_periods sp
                   WHERE sp.staff_id = v_r.staff_id
                     AND (sp.day BETWEEN v_r.from_day AND v_r.to_day OR sp.day = p_today)) j
           WHERE j.holiday_key IS DISTINCT FROM j.key_now
           ORDER BY j.day DESC
           LIMIT v_left - v_keep;
      ELSE
        -- Today not yet recorded is listed above, as 'live'.
        RETURN QUERY
          SELECT v_r.staff_id, g.d, v_r.ids, 'missing'::text, public.hr_target_schedule_holiday_key(v_r.ids, g.d)
            FROM (SELECT x::date AS d FROM generate_series(v_r.from_day, v_r.to_day, interval '1 day') x
                   WHERE x::date <> p_today
                     AND NOT EXISTS (SELECT 1 FROM public.hr_target_scheduled_periods sp
                                      WHERE sp.staff_id = v_r.staff_id AND sp.day = x::date)
                   ORDER BY x DESC
                   LIMIT v_left) g
           ORDER BY g.d DESC;
      END IF;
      GET DIAGNOSTICS v_got = ROW_COUNT;
      v_left := v_left - v_got;
      IF v_got > 0 THEN
        v_first := false;  -- round 8 (U5): pass 2 has listed its first person's days
      END IF;
    END LOOP;
  END LOOP;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_target_schedule_needs(date, integer, integer) FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.hr_target_schedule_needs(date, integer, integer) IS
  'Internal (default vv, 8 Oct 2026). The (team member, day) pairs the nightly job should record in '
  'hr_target_scheduled_periods, each with the day''s holiday key worked out now: today for everyone, then every '
  'person''s days whose approved holidays changed, then missing days newest first (round 7, B1). Today''s pass takes '
  'the people least recently recorded on the day itself first (round 10). Stops working out '
  'further people once p_budget_ms has passed: the stale-day pass at half of it, the missing-day pass once it has '
  'listed one person''s days (round 8, U5). A share of the rows (a quarter, at most 50) is kept for missing days, '
  'so today''s and stale days never fill the whole limit (round 9, W2). Migration 20271008093015.';

-- Default ww: one day's periods for one person, as the resolver gave them,
-- kept in the exact shape of the contract (anything else is refused).
-- 8 Oct 2026 (review round 7, B1): the holiday key stored is p_holiday_key,
-- the day's key as hr_target_schedule_needs worked it out BEFORE the resolver
-- read the day. A holiday approved in between then leaves the row stale, so
-- the day is recorded again. Only when no key is passed (the SQL console) is
-- it worked out here.
CREATE OR REPLACE FUNCTION public.hr_target_schedule_record(
  p_staff_id uuid, p_day date, p_periods jsonb, p_resolver text, p_today date, p_holiday_key text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_clean jsonb;
BEGIN
  IF p_staff_id IS NULL OR p_day IS NULL OR NOT EXISTS (SELECT 1 FROM public.staff s WHERE s.id = p_staff_id) THEN
    RAISE EXCEPTION 'No such team member.' USING ERRCODE = '22023';
  END IF;
  IF p_day > p_today THEN
    RAISE EXCEPTION 'A day not yet begun cannot be recorded.' USING ERRCODE = '22023';
  END IF;
  IF p_holiday_key IS NOT NULL AND p_holiday_key !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'The holiday key must be the one the listing gave.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_periods) IS DISTINCT FROM 'array'
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_periods) e WHERE jsonb_typeof(e) IS DISTINCT FROM 'object') THEN
    RAISE EXCEPTION 'The periods must be a list of periods.' USING ERRCODE = '22023';
  END IF;
  -- Each field in its own type; an id that is not a uuid fails the whole day
  -- (recorded again the next night), never half of it.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'timetable_id',   (e->>'timetable_id')::uuid,
           'institution_id', NULLIF(e->>'institution_id', '')::uuid,
           'slot_id',        COALESCE(e->>'slot_id', ''),
           'period_name',    NULLIF(btrim(e->>'period_name'), ''),
           'course_id',      NULLIF(e->>'course_id', '')::uuid,
           'section_ids',    (SELECT COALESCE(jsonb_agg(s), '[]'::jsonb)
                                FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(e->'section_ids') = 'array'
                                                                    THEN e->'section_ids' ELSE '[]'::jsonb END) s),
           'start_time',     CASE WHEN e->>'start_time' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN e->>'start_time' END,
           'end_time',       CASE WHEN e->>'end_time' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN e->>'end_time' END,
           'is_primary',     COALESCE(e->'is_primary' = 'true'::jsonb, false),
           'kind',           CASE WHEN e->>'kind' IN ('slot', 'sub_slot', 'practical') THEN e->>'kind' ELSE 'slot' END)
         ORDER BY e->>'timetable_id', e->>'slot_id'), '[]'::jsonb)
    INTO v_clean
    FROM jsonb_array_elements(p_periods) e;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_clean) e WHERE e->>'timetable_id' IS NULL) THEN
    RAISE EXCEPTION 'Every period needs its timetable.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.hr_target_scheduled_periods
    (staff_id, day, periods, recorded_live, holiday_key, resolver, first_recorded_at, recorded_at)
  VALUES
    (p_staff_id, p_day, v_clean, p_day = p_today,
     COALESCE(p_holiday_key,
              public.hr_target_schedule_holiday_key(public.hr_target_schedule_institutions(p_staff_id), p_day)),
     left(COALESCE(NULLIF(btrim(p_resolver), ''), 'unknown'), 200), now(), now())
  ON CONFLICT (staff_id, day) DO UPDATE
     SET periods = EXCLUDED.periods,
         recorded_live = public.hr_target_scheduled_periods.recorded_live OR EXCLUDED.recorded_live,
         holiday_key = EXCLUDED.holiday_key,
         resolver = EXCLUDED.resolver,
         recorded_at = now();
  RETURN jsonb_array_length(v_clean);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_target_schedule_record(uuid, date, jsonb, text, date, text) FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.hr_target_schedule_record(uuid, date, jsonb, text, date, text) IS
  'Internal (default ww, 8 Oct 2026). Records one day''s scheduled periods for one person in '
  'hr_target_scheduled_periods, replacing that day''s list; live when the day is today. The holiday key stored is '
  'the one the listing worked out before the day was read (round 7, B1). Migration 20271008093015.';

-- The cron route's two calls: service role (or the SQL console) only.
CREATE OR REPLACE FUNCTION public.fn_hr_target_schedule_needs(p_limit integer, p_budget_ms integer DEFAULT 8000)
RETURNS TABLE(staff_id uuid, day date, institution_ids uuid[], reason text, holiday_key text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL OR COALESCE(auth.role(), 'service_role') <> 'service_role' THEN
    RAISE EXCEPTION 'Only the scheduled job can record the schedule.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 8 Oct 2026 (finding 9): the time box, at most 20 seconds.
  RETURN QUERY SELECT * FROM public.hr_target_schedule_needs(public.hr_salary_revision_ist_today(), LEAST(p_limit, 2000),
                                                             LEAST(GREATEST(COALESCE(p_budget_ms, 8000), 0), 20000));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_target_schedule_needs(integer, integer) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_hr_target_schedule_needs(integer, integer) TO service_role;

COMMENT ON FUNCTION public.fn_hr_target_schedule_needs(integer, integer) IS
  'The cron route (/api/cron/hr-salary-revisions?mode=targets, service role) only: the days to record in the '
  'schedule record tonight, each with the day''s holiday key, worked out within p_budget_ms (at most 20 s). '
  'Refuses any signed-in caller (42501). '
  'Migration 20271008093015.';

CREATE OR REPLACE FUNCTION public.fn_hr_target_schedule_record(
  p_staff_id uuid, p_day date, p_periods jsonb, p_resolver text, p_holiday_key text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL OR COALESCE(auth.role(), 'service_role') <> 'service_role' THEN
    RAISE EXCEPTION 'Only the scheduled job can record the schedule.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Round 7 (B1): the key the listing gave, worked out before the day was read.
  RETURN public.hr_target_schedule_record(p_staff_id, p_day, p_periods, p_resolver, public.hr_salary_revision_ist_today(),
                                          p_holiday_key);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_target_schedule_record(uuid, date, jsonb, text, text) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_hr_target_schedule_record(uuid, date, jsonb, text, text) TO service_role;

COMMENT ON FUNCTION public.fn_hr_target_schedule_record(uuid, date, jsonb, text, text) IS
  'The cron route (service role) only: records one day''s scheduled periods for one person, as the app''s resolver '
  'gave them, with the holiday key the listing gave for that day. Refuses any signed-in caller (42501). '
  'Migration 20271008093015.';

-- ----------------------------------------------------------------------------
-- c. Measuring one person's month: #4252's body (20271007180207 section c),
--    reading the schedule record instead of timetable_data. Lines marked
--    "8 Oct 2026" are new; every other line is #4252's.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_salary_revision_target_measure(p_staff_id uuid, p_month date, p_targets jsonb)
RETURNS TABLE(target text, numerator integer, denominator integer, met boolean)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
WITH
me AS (
  SELECT s.id, s.profile_id::text AS who FROM public.staff s WHERE s.id = p_staff_id
),
-- 8 Oct 2026 (finding 5, default rr): the month's days, and before them the
-- days of the week that holds the 1st. A Monday-to-Sunday week counts in the
-- month its Sunday falls in, so T5 reads that whole week; T1-T4 read only the
-- month's own days (in_month).
days AS (
  SELECT g::date AS d, g >= date_trunc('month', p_month) AS in_month
    FROM generate_series(date_trunc('week', date_trunc('month', p_month))::date,
                         (date_trunc('month', p_month) + interval '1 month' - interval '1 day')::date,
                         interval '1 day') g
),
-- T1's denominator: their scheduled periods on every working day of the month.
-- 8 Oct 2026 (findings 2 and 3): "scheduled" is what the app's own resolver
-- (My Classes) recorded for the day in hr_target_scheduled_periods: cycle,
-- batch and dated timetables, and department, semester and section holidays,
-- are read the app's way; the timetable JSON is not parsed here. Only periods where
-- they are the main teacher count (default tt). A period whose period has no
-- name cannot be matched to attendance and is left out (default u); two
-- periods with the same name on one day are numbered.
raw_slots AS (
  SELECT t.id AS timetable_id, dd.d, dd.in_month, e->>'slot_id' AS slot_id, lower(e->>'course_id') AS course_id,
         NULLIF(btrim(e->>'period_name'), '') AS period_name, (e->>'start_time')::time AS start_time,
         (e->>'end_time')::time AS end_time
    FROM public.hr_target_scheduled_periods sp
    JOIN days dd ON dd.d = sp.day
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(sp.periods) = 'array'
                                                 THEN sp.periods ELSE '[]'::jsonb END) e
    JOIN public.timetables t ON t.id::text = e->>'timetable_id'
   -- Default dd: a timetable runs on the days between its start and end
   -- dates (not a template), whatever is_active says NOW: the daily job
   -- switches a timetable off the day after it ends.
   WHERE COALESCE(t.is_template, false) = false
     AND sp.staff_id = p_staff_id
     AND jsonb_typeof(e) = 'object'
     AND e->'is_primary' = 'true'::jsonb
     -- Default ii: the teacher's own approved leave days are not counted against them.
     AND NOT EXISTS (SELECT 1 FROM public.hr_leave_applications la
                      WHERE la.employee_id = p_staff_id AND la.status = 'approved'
                        AND dd.d BETWEEN la.start_date AND la.end_date)
     AND NULLIF(e->>'course_id', '') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.institution_off_days o
                      WHERE o.institution_id = t.institution_id AND o.off_date = dd.d)
     AND NOT EXISTS (SELECT 1 FROM public.institution_leaves l
                      WHERE l.institution_id = t.institution_id AND l.status = 'approved'
                        AND COALESCE(l.scope_level, 'institution') = 'institution'
                        AND dd.d BETWEEN l.start_date AND l.end_date)
),
-- Default dd: when two timetables give the same person the same period name
-- on the same day (one replaced the other), only one counts: the one whose
-- period was marked, else the newer.
chosen AS (
  SELECT DISTINCT ON (r.d, r.period_name) r.d, r.period_name, r.timetable_id
    FROM raw_slots r
    JOIN public.timetables t ON t.id = r.timetable_id
   WHERE r.period_name IS NOT NULL
   ORDER BY r.d, r.period_name,
            EXISTS (SELECT 1 FROM public.attendance_first_marks fm
                     WHERE fm.timetable_id = r.timetable_id AND fm.attendance_date = r.d
                       AND fm.period_name = public.attendance_first_mark_period_key(r.period_name)) DESC,
            t.created_at DESC NULLS LAST, t.id DESC
),
named AS (
  SELECT r.*, t.created_at AS tt_made,
         EXISTS (SELECT 1 FROM public.attendance_first_marks fm
                  WHERE fm.timetable_id = r.timetable_id AND fm.attendance_date = r.d
                    AND fm.period_name = public.attendance_first_mark_period_key(r.period_name)) AS was_marked
    FROM raw_slots r
    JOIN public.timetables t ON t.id = r.timetable_id
    JOIN chosen c ON c.d = r.d AND c.period_name = r.period_name AND c.timetable_id = r.timetable_id
),
-- 8 Oct 2026 (finding 1, default nn): a replacement that names its periods
-- differently. A period of ANOTHER timetable at an overlapping time on the
-- same day is the same teaching: only the better one counts (the marked one,
-- else the newer timetable). Periods of one timetable never merge.
week_slots AS (
  SELECT r.*, row_number() OVER (PARTITION BY r.timetable_id, r.d, r.period_name ORDER BY r.end_time NULLS LAST, r.slot_id) AS rn
    FROM named r
   WHERE NOT EXISTS (SELECT 1 FROM named q
                      WHERE q.d = r.d AND q.timetable_id <> r.timetable_id
                        AND q.start_time < r.end_time AND r.start_time < q.end_time
                        AND (q.was_marked, COALESCE(q.tt_made, '-infinity'::timestamptz), q.timetable_id::text)
                            > (r.was_marked, COALESCE(r.tt_made, '-infinity'::timestamptz), r.timetable_id::text))
),
slots AS (
  SELECT w.* FROM week_slots w WHERE w.in_month
),
-- The attendance entries of those timetables and days, with learners in them
-- (for the period's key, which links lessons and material).
entries AS (
  SELECT sa.timetable_id, sa.attendance_date AS d, e.key AS entry_id, btrim(e.value->>'period_name') AS period_name
    FROM public.student_attendance sa
    CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(sa.attendance_data) = 'object'
                                       THEN sa.attendance_data ELSE '{}'::jsonb END) e
   WHERE (sa.timetable_id, sa.attendance_date) IN (SELECT timetable_id, d FROM slots)
     AND jsonb_typeof(e.value) = 'object'
     AND CASE WHEN jsonb_typeof(e.value->'students') = 'array' THEN jsonb_array_length(e.value->'students') END > 0
),
numbered AS (
  SELECT x.*, row_number() OVER (PARTITION BY x.timetable_id, x.d, x.period_name ORDER BY x.entry_id) AS rn
    FROM entries x
),
-- Each slot matched to at most one entry and one first-mark stamp: same
-- timetable, day, period name and number. Who first marked it and when come
-- ONLY from attendance_first_marks (the server's record, default q).
marks AS (
  SELECT s.*, n.entry_id, fm.marker_profile_id::text AS marker_id, fm.first_marked_at AS marked_at
    FROM slots s
    LEFT JOIN numbered n ON n.timetable_id = s.timetable_id AND n.d = s.d
                        AND n.period_name = s.period_name AND n.rn = s.rn
    LEFT JOIN public.attendance_first_marks fm ON fm.timetable_id = s.timetable_id AND fm.attendance_date = s.d
                        AND fm.period_name = public.attendance_first_mark_period_key(s.period_name) AND fm.ordinal = s.rn
),
mine AS (
  SELECT k.* FROM marks k, me WHERE me.who IS NOT NULL AND k.marker_id = me.who AND k.marked_at IS NOT NULL
),
t1 AS (
  SELECT (SELECT count(*) FROM slots)::int AS den,
         (SELECT count(*) FROM mine k
           WHERE (k.marked_at AT TIME ZONE 'Asia/Kolkata')
                 <= k.d + COALESCE(k.end_time, time '23:59:59')
                    + make_interval(hours => (p_targets->>'t1_mark_within_hours')::int)
             -- default z: never before the session began (a row saved ahead for a future day)
             AND (k.marked_at AT TIME ZONE 'Asia/Kolkata') >= k.d + COALESCE(k.start_time, time '00:00'))::int AS num
),
courses AS (SELECT DISTINCT course_id FROM slots),
-- T2 (default r): a course counts when they approved at least one published
-- lesson they did not write themselves (an AI draft, or a colleague's), and
-- no draft THEY created is left on it. Other teachers' drafts on a shared
-- course do not count against them (there is no assignment column).
spine_ok AS (
  SELECT c.course_id FROM courses c, me
   WHERE me.who IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.curriculum_lesson l
                      WHERE l.course_id::text = c.course_id AND l.status = 'draft'
                        AND l.created_by::text = me.who)
     AND EXISTS (SELECT 1 FROM public.curriculum_lesson l
                  WHERE l.course_id::text = c.course_id AND l.status = 'published' AND l.approved_by::text = me.who
                    AND (l.source <> 'faculty' OR l.created_by::text IS DISTINCT FROM me.who))
),
t2 AS (
  SELECT (SELECT count(*) FROM courses)::int AS den, (SELECT count(*) FROM spine_ok)::int AS num
),
t3 AS (
  SELECT count(*)::int AS den,
         (count(*) FILTER (WHERE EXISTS (
            SELECT 1 FROM public.class_session_lesson c, me
             WHERE c.timetable_id = k.timetable_id AND c.attendance_date = k.d
               AND c.period_id = k.entry_id AND c.linked_by::text = me.who)))::int AS num
    FROM mine k
   WHERE k.course_id IN (SELECT course_id FROM spine_ok)
),
-- T4 (default s): their OWN scheduled periods with class material they posted
-- for that period by the end of that day, still switched on.
t4 AS (
  SELECT count(*) FILTER (WHERE EXISTS (
            SELECT 1 FROM public.session_resource r, me
             WHERE me.who IS NOT NULL AND r.posted_by::text = me.who
               AND r.is_active
               AND r.timetable_id = k.timetable_id AND r.attendance_date = k.d AND r.period_id = k.entry_id
               AND r.posted_at < ((k.d + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')))::int AS num
    FROM marks k
),
-- T5 (default t): every (course, Monday-to-Sunday week) they teach in the
-- month needs the set number of pulses they actually OPENED: the class poll
-- they made for it reached open (induction_session_poll.issued_at is set only
-- when a poll opens), or a pulse they opened directly (fn_scf_open_pulse
-- inserts it already open and never gives it a poll), open now or closed
-- since. A placeholder always gets its poll in the same call; one whose poll
-- was drafted and closed never reached open and does not count.
weeks AS (
  SELECT DISTINCT course_id, date_trunc('week', d)::date AS wk FROM week_slots
   -- 8 Oct 2026 (finding 5, default rr): the weeks whose Sunday falls in the month.
   WHERE date_trunc('week', d)::date + 6 <= (date_trunc('month', p_month) + interval '1 month' - interval '1 day')::date
),
pulses AS (
  SELECT lower(sa.attendance_data -> lp.period_id ->> 'course_id') AS course_id,
         date_trunc('week', lp.attendance_date)::date AS wk
    FROM public.scf_live_pulse lp
    JOIN me ON me.who IS NOT NULL AND lp.created_by::text = me.who
    JOIN public.student_attendance sa ON sa.timetable_id = lp.timetable_id AND sa.attendance_date = lp.attendance_date
   WHERE date_trunc('week', lp.attendance_date)::date IN (SELECT wk FROM weeks)
     AND jsonb_typeof(sa.attendance_data -> lp.period_id) = 'object'
     -- Default ee: opened IN that week (India time), not back-filled later.
     AND (EXISTS (SELECT 1 FROM public.induction_session_poll ip
                   WHERE ip.context_type = 'class_session' AND ip.context_id = lp.id
                     AND ip.issued_at IS NOT NULL AND ip.created_by::text = me.who
                     AND date_trunc('week', (ip.issued_at AT TIME ZONE 'Asia/Kolkata')::date) = date_trunc('week', lp.attendance_date))
          OR (NOT EXISTS (SELECT 1 FROM public.induction_session_poll ip
                           WHERE ip.context_type = 'class_session' AND ip.context_id = lp.id)
              AND date_trunc('week', (lp.issued_at AT TIME ZONE 'Asia/Kolkata')::date) = date_trunc('week', lp.attendance_date)))
),
t5 AS (
  SELECT count(*)::int AS den,
         (count(*) FILTER (WHERE (SELECT count(*) FROM pulses p WHERE p.course_id = w.course_id AND p.wk = w.wk)
                                 >= (p_targets->>'t5_min_pulses_per_week')::int))::int AS num
    FROM weeks w
)
SELECT 't1', t1.num, t1.den,
       t1.den > 0 AND t1.num * 100 >= (p_targets->>'t1_marked_by_self_min_pct')::numeric * t1.den
  FROM t1
UNION ALL
SELECT 't2', t2.num, t2.den, t2.den > 0 AND t2.num = t2.den FROM t2
UNION ALL
SELECT 't3', t3.num, t3.den,
       (SELECT t2.den > 0 AND t2.num = t2.den FROM t2)
       AND t3.den > 0 AND t3.num * 100 >= (p_targets->>'t3_linked_min_pct')::numeric * t3.den
  FROM t3
UNION ALL
SELECT 't4', t4.num, t1.den,
       t1.den > 0 AND t4.num * 100 >= (p_targets->>'t4_resource_min_pct')::numeric * t1.den
  FROM t4, t1
UNION ALL
SELECT 't5', t5.num, t5.den, t5.den > 0 AND t5.num = t5.den FROM t5
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_target_measure(uuid, date, jsonb) FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.hr_salary_revision_target_measure(uuid, date, jsonb) IS
  'Internal, pure SQL. One row per faculty target (t1..t5) for one person and one calendar month: numerator, '
  'denominator and met, against the thresholds passed in (the snapshot on the plan). Reads their scheduled periods '
  'ONLY from hr_target_scheduled_periods (the app''s resolver, recorded nightly) and the first marking ONLY from '
  'attendance_first_marks. A week counts in the month its Sunday falls in. Rulings of 7 Oct 2026, defaults q-u, '
  'nn, rr, tt. Migrations 20271007180207, 20271008093015.';

-- ----------------------------------------------------------------------------
-- d. Who teaches, and who the held part is measured as: #4252's bodies
--    (20271007180207 section d), reading the schedule record.
-- ----------------------------------------------------------------------------
-- Default y: does this person teach? Periods as the main teacher
-- (primary_staff_id) on a day of the range, as the app's resolver recorded it
-- (8 Oct 2026). NULL (8 Oct 2026, default qq): nothing found and not every day
-- of the range recorded yet, so it cannot be said yet.
CREATE OR REPLACE FUNCTION public.hr_salary_revision_target_teaches(p_staff_id uuid, p_from date, p_to date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN EXISTS (
    SELECT 1
      FROM public.hr_target_scheduled_periods sp
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(sp.periods) = 'array'
                                                   THEN sp.periods ELSE '[]'::jsonb END) e
      JOIN public.timetables t ON t.id::text = e->>'timetable_id'
     -- Default dd: running by its dates, not by is_active now.
     WHERE COALESCE(t.is_template, false) = false
       AND sp.staff_id = p_staff_id AND sp.day BETWEEN p_from AND p_to
       AND jsonb_typeof(e) = 'object'
       AND e->'is_primary' = 'true'::jsonb
       -- Default kk: made before the range began, or actually marked by them in
       -- it (a timetable made just before the yes cannot make anyone a teacher).
       AND (t.created_at < p_from
            OR EXISTS (SELECT 1 FROM public.attendance_first_marks fm
                         JOIN public.staff s ON s.id = p_staff_id AND s.profile_id = fm.marker_profile_id
                        WHERE fm.timetable_id = t.id AND fm.attendance_date BETWEEN p_from AND p_to)
            -- 8 Oct 2026 (finding 4, default qq): or the day was recorded ON the
            -- day itself: the timetable existed and scheduled them then, whenever
            -- it was made. A day recorded after the fact does not count this way.
            OR sp.recorded_live))
    THEN true
    WHEN public.hr_target_schedule_missing_days(p_staff_id, p_from, p_to) = 0 THEN false
  END
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_target_teaches(uuid, date, date) FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.hr_salary_revision_target_teaches(uuid, date, date) IS
  'Internal (defaults y, dd, kk, qq). True when the schedule record (hr_target_scheduled_periods) has the person as '
  'the main teacher of a period on a day of the range, of a non-template timetable made before the range began, '
  'first-marked by them in it, or recorded on the day itself. False when every day of the range is recorded and '
  'none qualifies; NULL (undecided) otherwise. Migrations 20271007180207, 20271008093015.';

-- Who the held part is measured as (defaults y, ll): a Director-list member,
-- a principal, one role with targets, several, a teacher, or nobody. Run at
-- the yes while measurement is ON, otherwise when it is switched ON.
CREATE OR REPLACE FUNCTION public.hr_salary_revision_target_classify(p_request_id uuid, p_rules jsonb, p_today date)
RETURNS TABLE(state text, role text, reason text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_r       record;
  v_profile uuid;
  v_keys    text[];
  v_wait    text;
  v_match   text[];
  v_role    text;
  v_state   text;
  v_reason  text;
BEGIN
  SELECT * INTO v_r FROM public.hr_salary_revision_requests WHERE id = p_request_id;
  v_profile := COALESCE((SELECT s.profile_id FROM public.staff s WHERE s.id = v_r.staff_id), v_r.subject_profile_id);
  v_keys := public.hr_salary_revision_target_role_keys(v_profile);

  IF false THEN
    NULL;
  -- RULING 6: a Director-list member's held part is never released by itself.
  ELSIF public.hr_salary_revision_is_list_member(v_r.staff_id, v_r.subject_profile_id, v_r.subject_was_list_member) THEN
    v_state := 'held_listed'; v_reason := 'director_list';
  ELSE
    -- RULING 6: the principal's own raise waits for principal targets.
    SELECT min(e) INTO v_wait
      FROM jsonb_array_elements_text(p_rules->'roles_waiting_for_own_targets') e
     WHERE e = ANY (v_keys);
    IF v_wait IS NOT NULL THEN
      v_state := 'held_listed'; v_reason := 'waits_for_own_targets:' || v_wait;
    ELSE
      SELECT array_agg(k ORDER BY k) INTO v_match
        FROM jsonb_object_keys(p_rules->'role_targets') k
       WHERE k = ANY (v_keys);
      IF cardinality(v_match) = 1 THEN
        v_state := 'waiting'; v_role := v_match[1];
      ELSIF v_match IS NOT NULL THEN
        v_state := 'held_listed'; v_reason := 'several_target_roles:' || array_to_string(v_match, ',');
      -- Default y: whoever TEACHES (periods as the main teacher in a
      -- timetable in the 90 days before the day classified) gets the faculty
      -- set, whatever their role key is called.
      ELSIF public.hr_salary_revision_target_teaches(v_r.staff_id,
              p_today - 90, p_today - 1) THEN
        IF p_rules->'role_targets' ? 'faculty' THEN
          v_state := 'waiting'; v_role := 'faculty';
        ELSE
          v_state := 'held_listed'; v_reason := 'no_targets_for_role';
        END IF;
      -- 8 Oct 2026 (default qq): not every day of the 90 recorded yet, and no
      -- teaching found so far: undecided, not "does not teach". The held part
      -- waits (awaiting_measurement) and is classified on a later night.
      ELSIF public.hr_salary_revision_target_teaches(v_r.staff_id, p_today - 90, p_today - 1) IS NULL THEN
        v_state := 'awaiting_measurement'; v_reason := 'schedule_not_recorded';
      ELSE
        v_state := 'held_listed'; v_reason := 'no_teaching_timetable';
      END IF;
    END IF;
  END IF;
  RETURN QUERY SELECT v_state, v_role, v_reason;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_target_classify(uuid, jsonb, date) FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.hr_salary_revision_target_classify(uuid, jsonb, date) IS
  'Internal (defaults y, ll, qq). Classifies a held part for measurement on a day: Director list, principal, role '
  'targets, several roles, teaches, or none; awaiting_measurement (schedule_not_recorded) while the schedule record '
  'cannot yet say whether they teach. Migrations 20271007180207, 20271008093015.';

-- ----------------------------------------------------------------------------
-- e. The monthly run for one raise: #4252's body (20271007180207 section f)
--    plus the lines marked "8 Oct 2026" (defaults oo, qq, ss).
-- ----------------------------------------------------------------------------
-- One person's raise for one day (default bb): measured, counted and acted
-- on in its own call, so the cron route can give every person their own
-- transaction (a time-out on one undoes only that one) and stop when its
-- time budget runs out (the rest are first in line the next night).
CREATE OR REPLACE FUNCTION public.hr_salary_revision_targets_run_one(
  p_request_id uuid, p_today date, p_max_months integer DEFAULT 12)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_p        record;
  v_r        record;
  v_row      record;
  v_cur_m    date := date_trunc('month', p_today)::date;
  v_last     date;
  v_from     date;
  v_m        date;
  v_res      jsonb;
  v_t1_den   integer;
  v_all_met  boolean;
  v_status   text;
  v_action   text;
  v_eff      date;
  v_writes   integer := 0;
  v_flagged  boolean;
  v_measured integer := 0;
  v_rules    jsonb;
  v_state    text;
  v_role     text;
  v_reason   text;
  v_waiting  date[] := ARRAY[]::date[];  -- 8 Oct 2026 (default oo): the finished month waiting for its days (round 6: at most one)
  v_stop     date;                       -- 8 Oct 2026 (round 7, B3): the first finished month that cannot be acted on yet
  v_lkey     text;                       -- 8 Oct 2026 (round 8, U3): the month's leave key, worked out once
  v_hkey     text;                       -- 8 Oct 2026 (round 8, U3): the month's holiday key, worked out once
  v_found    boolean;                    -- 8 Oct 2026 (round 8): the month has a row
  v_again    boolean;                    -- 8 Oct 2026 (round 8): a missed month measured again
  v_mo       record;                     -- 8 Oct 2026 (round 12): a month of the replay
  v_walk_end date;                       -- 8 Oct 2026 (round 12): the replay walks the months before this one
  v_t_state  text;                       -- 8 Oct 2026 (round 12): the state the replay arrives at
  v_t_run    integer;                    -- 8 Oct 2026 (round 12): its missed months in a row
  v_t_month  date;                       -- 8 Oct 2026 (round 12): the month of its last change of state
  v_t_action text;                       -- 8 Oct 2026 (round 12): that change ('released', 'paused', 'resumed')
  v_t_met    date;                       -- 8 Oct 2026 (round 12): the first month on target in the current run of misses
  v_t_last   date;                       -- 8 Oct 2026 (round 12): the last month a change of state was written for
  v_moved    integer := 0;               -- 8 Oct 2026 (round 12): months measured again or acted on by this run
  v_found_n  integer;                    -- 8 Oct 2026 (round 12): rows acted on just now
BEGIN
  -- Default hh: a second call for the same raise on the same day (two runs
  -- overlapping) finds it locked or already run, and skips it.
  SELECT * INTO v_p FROM public.hr_salary_revision_target_plans
   WHERE request_id = p_request_id AND state IN ('awaiting_measurement', 'waiting', 'released', 'paused')
     AND last_run_on IS DISTINCT FROM p_today
   FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Default ll: measurement switched OFF. The month is recorded as not
  -- measured and NOTHING else happens: no release, pause, resume, expiry,
  -- lapse, back-to-Director or classification.
  IF NOT public.hr_salary_revision_target_measurement_on() THEN
    -- This month, if measured "so far" while it was ON, is closed unmeasured
    -- too. 8 Oct 2026 (round 8, U2): only THIS month. A finished month left
    -- "so far" (waiting for its days) stays waiting: it is counted, in
    -- calendar order, once measurement is ON again.
    UPDATE public.hr_salary_revision_target_months
       SET status = 'not_measured', results = '[]'::jsonb, measured_at = now(), acted = true, action = 'none'
     WHERE request_id = p_request_id AND month = v_cur_m AND status = 'in_progress';
    INSERT INTO public.hr_salary_revision_target_months (request_id, month, status, results, measured_at, acted, action)
    VALUES (p_request_id, v_cur_m, 'not_measured', '[]'::jsonb, now(), true, 'none')
    ON CONFLICT (request_id, month) DO NOTHING;
    UPDATE public.hr_salary_revision_target_plans SET last_run_on = p_today, failed_nights = 0
     WHERE request_id = p_request_id;
    RETURN 0;
  END IF;

  -- Default ll: measurement just switched ON for a held part waiting for it:
  -- classified now, with the rules as they are now, and its window starts on
  -- the 1st of next month. Measured from the next run on.
  IF v_p.state = 'awaiting_measurement' THEN
    v_rules := public.hr_salary_revision_target_rules();
    IF v_rules IS NULL THEN
      UPDATE public.hr_salary_revision_target_plans
         SET run_note = 'Measurement is on but the raise rules setting is missing or malformed: not classified.',
             last_run_on = p_today, failed_nights = 0, updated_at = now()
       WHERE request_id = p_request_id;
      RETURN 0;
    END IF;
    SELECT c.state, c.role, c.reason INTO v_state, v_role, v_reason
      FROM public.hr_salary_revision_target_classify(p_request_id, v_rules, p_today) c;
    -- 8 Oct 2026 (default qq): the schedule record cannot say yet whether they
    -- teach: still waiting, classified on a later night.
    IF v_state = 'awaiting_measurement' THEN
      UPDATE public.hr_salary_revision_target_plans
         SET state_reason = v_reason,
             run_note = 'Not every one of the 90 days before today is in the schedule record yet: who this is measured as is decided once they are.',
             last_run_on = p_today, failed_nights = 0, updated_at = now()
       WHERE request_id = p_request_id;
      RETURN 0;
    END IF;
    UPDATE public.hr_salary_revision_target_plans
       SET state = v_state, target_role = v_role, state_reason = v_reason,
           rules = rules || jsonb_build_object(
                    'window_months', v_rules->'window_months',
                    'pause_after_missed_months', v_rules->'pause_after_missed_months',
                    'role', v_role,
                    'targets', CASE WHEN v_role IS NULL THEN NULL ELSE v_rules->'role_targets'->v_role END),
           window_start = (date_trunc('month', p_today) + interval '1 month')::date,
           window_months = (v_rules->>'window_months')::int,
           run_note = NULL, last_run_on = p_today, failed_nights = 0, updated_at = now()
     WHERE request_id = p_request_id;
    RETURN 0;
  END IF;
  -- An error on this person is noted and the night goes on.
  BEGIN
    <<one>>
    BEGIN
      SELECT * INTO v_r FROM public.hr_salary_revision_requests WHERE id = v_p.request_id;
      -- Nothing before the increment is written; nothing for a yes since undone.
      IF v_r.status IS DISTINCT FROM 'applied' THEN
        EXIT one;
      END IF;

      -- #4190 rule 8 (default v): linked to no account: skipped and listed.
      IF public.hr_salary_revision_is_unlinked(v_r.staff_id, v_r.subject_profile_id) THEN
        UPDATE public.hr_salary_revision_target_plans
           SET run_note = 'Linked to no account, so nobody can tell whose raise it is: not measured, nothing written. Listed for the Director.',
               updated_at = now()
         WHERE request_id = v_p.request_id;
        EXIT one;
      END IF;
      -- Default v: on the Director list now, after the held part was paid:
      -- the run never changes such pay; listed for the Director.
      IF v_p.state IN ('released', 'paused')
         AND public.hr_salary_revision_is_list_member(v_r.staff_id, v_r.subject_profile_id, v_r.subject_was_list_member) THEN
        UPDATE public.hr_salary_revision_target_plans
           SET run_note = 'Now on the Director list: the monthly run no longer pauses or resumes this held part. Listed for the Director.',
               updated_at = now()
         WHERE request_id = v_p.request_id;
        EXIT one;
      END IF;

      IF v_p.state = 'waiting' THEN
        -- Default b: left, or moved to another college, while waiting: lapses, listed.
        IF NOT EXISTS (SELECT 1 FROM public.v_hr_staff s
                        WHERE s.id = v_p.staff_id AND COALESCE(s.is_active, false)
                          AND s.institution_id = v_p.institution_id) THEN
          UPDATE public.hr_salary_revision_target_plans
             SET state = 'lapsed',
                 state_reason = CASE WHEN EXISTS (SELECT 1 FROM public.v_hr_staff s
                                                   WHERE s.id = v_p.staff_id AND COALESCE(s.is_active, false))
                                     THEN 'moved_college' ELSE 'left' END,
                 run_note = NULL, updated_at = now()
           WHERE request_id = v_p.request_id;
          EXIT one;
        END IF;
        -- RULING 6: someone on the Director list (then or now) is never released by the run.
        IF public.hr_salary_revision_is_list_member(v_r.staff_id, v_r.subject_profile_id, v_r.subject_was_list_member) THEN
          UPDATE public.hr_salary_revision_target_plans
             SET state = 'held_listed', state_reason = 'director_list', run_note = NULL, updated_at = now()
           WHERE request_id = v_p.request_id;
          EXIT one;
        END IF;
      END IF;

      -- RULING 3: while waiting, only the months of the window count.
      v_last := CASE WHEN v_p.state = 'waiting'
                     THEN (v_p.window_start + make_interval(months => v_p.window_months - 1))::date
                     ELSE v_cur_m END;

      -- Default aa: once the held part is paid, only the months the pause
      -- rule can still use are measured. An older month left "so far" (the run
      -- missed it) is closed as not counted, unmeasured.
      -- 8 Oct 2026 (Director ruling (a), option A): a month not measured (OFF
      -- night), not counted (leave or holidays over the whole month) or
      -- Director-decided is SKIPPED OVER in a run of missed months (#4252
      -- default d), so the months the pause rule can use are the whole CURRENT
      -- run of misses: from the month after the last met (or decided met)
      -- month acted on, never before the window start. Every month of that run
      -- is counted and settled, in calendar order, before any month after it is
      -- acted on, so a pause comes only once every month in the run is settled
      -- (RV6-A). A month the stop holds (waiting for its days, flagged) comes
      -- after the last met month acted on, so it is never older than this and
      -- the closing below never reaches it (RV6-B).
      v_from := CASE WHEN v_p.state IN ('released', 'paused')
                     THEN GREATEST(v_p.window_start,
                                   COALESCE((SELECT (max(mo.month) + interval '1 month')::date
                                               FROM public.hr_salary_revision_target_months mo
                                              WHERE mo.request_id = v_p.request_id AND mo.acted
                                                AND mo.status IN ('met', 'decided_met')), v_p.window_start))
                     ELSE v_p.window_start END;
      UPDATE public.hr_salary_revision_target_months
         SET status = 'not_counted', results = '[]'::jsonb, measured_at = now()
       WHERE request_id = v_p.request_id AND month < v_from AND status = 'in_progress';

      -- Round 7 (B3): a flagged finished month the Director has not decided,
      -- older than the months measured below, stops everything after it too.
      SELECT min(mo.month) INTO v_stop
        FROM public.hr_salary_revision_target_months mo
       WHERE mo.request_id = v_p.request_id AND mo.status = 'flagged' AND mo.month < LEAST(v_from, v_cur_m);

      -- Round 8 (U1, 8 Oct 2026): ONE loop, in calendar order, under ONE rule.
      -- A finished month that is settled (hr_salary_revision_target_month_settled)
      -- is passed over. The first finished month that is not is dealt with if it
      -- can be: counted for the first time; a MISSED month measured again
      -- because the approved leave (default ss, finding 6) or the approved
      -- holidays (round 7, B2) covering the days it reads changed since; a
      -- flagged month measured again for the Director. Nothing at or after it
      -- is counted or acted on while it is not settled: waiting for its days
      -- (default oo; a stale day counts as not recorded, B1), flagged and not
      -- yet decided (B3), or past the per-call month cap. The month in progress
      -- is measured "so far" only once every finished month before it is
      -- settled. A month measured again only changes its status here: what
      -- that means for the held part is worked out by the replay below, from
      -- every settled month in calendar order. Never backdated, nothing paid
      -- taken back, and a met month is never measured again.
      FOR v_m IN
        SELECT g::date FROM generate_series(v_from, LEAST(v_cur_m, v_last), interval '1 month') g
      LOOP
        EXIT WHEN v_stop IS NOT NULL AND v_m >= v_stop;
        SELECT * INTO v_row FROM public.hr_salary_revision_target_months
         WHERE request_id = v_p.request_id AND month = v_m;
        v_found := FOUND;
        v_flagged := v_found AND v_row.status = 'flagged';
        v_again := v_found AND v_row.status = 'missed';
        -- 8 Oct 2026 (round 9, W3): a finished month final by its status (met,
        -- Director-decided, not measured, not counted: settled whatever its
        -- keys, hr_salary_revision_target_month_settled) is passed over BEFORE
        -- its keys are worked out (each key reads every day of the month).
        CONTINUE WHEN v_m < v_cur_m AND v_found
                  AND v_row.status IN ('met', 'decided_met', 'decided_missed', 'not_measured', 'not_counted');
        -- 8 Oct 2026 (round 8, U3): the keys of the days this month's measure
        -- reads (from the Monday of the week that holds the 1st, default rr,
        -- round 6 finding 5), worked out ONCE, before the days are checked.
        -- Exactly these are stored with the measure, so a holiday or leave
        -- approved after this line leaves the month unsettled: measured again.
        v_lkey := public.hr_salary_revision_target_leave_key(
                    v_p.staff_id, date_trunc('week', v_m)::date, (v_m + interval '1 month' - interval '1 day')::date);
        v_hkey := public.hr_salary_revision_target_holiday_key(
                    v_p.staff_id, date_trunc('week', v_m)::date, (v_m + interval '1 month' - interval '1 day')::date);
        IF v_m < v_cur_m THEN
          CONTINUE WHEN public.hr_salary_revision_target_month_settled(v_p.request_id, v_p.staff_id, v_m, v_lkey, v_hkey);
          -- 8 Oct 2026 (default oo): not settled, so every day it reads (the
          -- month, and the days before the 1st in the week that holds the 1st)
          -- must be in the schedule record, on today's holidays, first. Until
          -- then it waits, and every month after it waits with it.
          IF public.hr_target_schedule_missing_days(v_p.staff_id, date_trunc('week', v_m)::date,
                                                    (v_m + interval '1 month' - interval '1 day')::date) > 0 THEN
            v_waiting := v_waiting || v_m;
            v_stop := v_m;  -- waiting for its days
            EXIT;
          END IF;
          -- Round 8: the per-call month cap stops it here too; this month is
          -- dealt with first on the next run.
          IF v_measured >= p_max_months THEN
            v_stop := v_m;  -- the cap
            EXIT;
          END IF;
        ELSE
          -- The month in progress, "so far" (a month closed unmeasured stays so).
          IF v_found AND v_row.status NOT IN ('in_progress', 'flagged') THEN
            CONTINUE;
          END IF;
          EXIT WHEN v_measured >= p_max_months;
        END IF;
        v_measured := v_measured + 1;
        SELECT jsonb_agg(jsonb_build_object('target', m.target, 'numerator', m.numerator,
                                            'denominator', m.denominator, 'met', m.met) ORDER BY m.target),
               max(m.denominator) FILTER (WHERE m.target = 't1'),
               bool_and(m.met)
          INTO v_res, v_t1_den, v_all_met
          FROM public.hr_salary_revision_target_measure(v_p.staff_id, v_m, v_p.rules->'targets') m;
        IF v_again THEN
          -- A missed month measured again (default ss; round 7, B2).
          UPDATE public.hr_salary_revision_target_months
             SET results = COALESCE(v_res, '[]'::jsonb), measured_at = now(),
                 leave_key = v_lkey, holiday_key = v_hkey,
                 -- 8 Oct 2026 (review round 6, finding 1): leave now covering every
                 -- scheduled period of the month: not counted (default d), not missed.
                 status = CASE WHEN COALESCE(v_t1_den, 0) = 0 THEN 'not_counted'
                               WHEN v_all_met THEN 'met' ELSE status END
           WHERE request_id = v_p.request_id AND month = v_m;
          -- 8 Oct 2026 (round 12): whatever the state, the replay below works out
          -- what the month's new status means (round 7's B4 recount is gone).
          v_moved := v_moved + 1;
          CONTINUE;
        END IF;
        -- RULING 5: a flagged month stays flagged until the Director decides it.
        v_status := CASE WHEN v_flagged THEN 'flagged'
                         WHEN v_m >= v_cur_m THEN 'in_progress'
                         WHEN COALESCE(v_t1_den, 0) = 0 THEN 'not_counted'  -- default d
                         WHEN v_all_met THEN 'met'
                         ELSE 'missed' END;
        -- 8 Oct 2026 (default ss; round 7, B2; round 8, U3): with the approved
        -- leave and holidays it was measured with, as worked out above.
        INSERT INTO public.hr_salary_revision_target_months (request_id, month, status, results, measured_at, leave_key, holiday_key)
        VALUES (v_p.request_id, v_m, v_status, COALESCE(v_res, '[]'::jsonb), now(), v_lkey, v_hkey)
        ON CONFLICT (request_id, month) DO UPDATE
           SET status = EXCLUDED.status, results = EXCLUDED.results, measured_at = EXCLUDED.measured_at,
               leave_key = EXCLUDED.leave_key, holiday_key = EXCLUDED.holiday_key;
        -- Round 7 (B3): a flagged finished month waits for the Director's
        -- decision, and every month after it waits with it (calendar order).
        IF v_flagged AND v_m < v_cur_m THEN
          v_stop := v_m;
          EXIT;
        END IF;
      END LOOP;
      -- 8 Oct 2026 (review round 12): the decision is a REPLAY. Rounds 1-11
      -- acted on each month not yet acted on, one step at a time from the
      -- stored state and an incremental count of misses, and every round found
      -- a new month order that left the state wrong (round 7 of the money
      -- review: a late re-measure turns an old missed month met, the part is
      -- released or resumed, the count of misses since then is already at the
      -- rule, and nothing pauses it, because those misses were acted on
      -- before). Now the state the held part SHOULD be in is worked out every
      -- run from scratch: every month of the plan from its window start, in
      -- calendar order, under rulings 3 and 4, up to the first finished month
      -- that is not settled (the stop: waiting for its days, flagged, left by
      -- the cap). A month before v_from is final as it stands (Director ruling
      -- (a): the run of misses starts after the last met month acted on); every
      -- month from v_from on was settled by the loop above. Not counted, not
      -- measured: neither adds nor resets (#4252 default d, Director ruling (a)).
      v_walk_end := COALESCE(v_stop, v_cur_m);
      v_t_state := 'waiting'; v_t_run := 0; v_t_month := NULL; v_t_action := NULL; v_t_met := NULL;
      -- (acted is read for the rehearsal's controls R14/R14b only, which put the
      -- old rule back: a pause only on a month not acted on yet. Nothing here uses it.)
      FOR v_mo IN
        SELECT mo.month, mo.status, mo.acted FROM public.hr_salary_revision_target_months mo
         WHERE mo.request_id = v_p.request_id AND mo.month >= v_p.window_start
           AND mo.month < v_walk_end
         ORDER BY mo.month
      LOOP
        -- Not final and not counted (none is expected before the stop): a stop.
        IF v_mo.status NOT IN ('met', 'missed', 'not_counted', 'decided_met', 'decided_missed', 'not_measured') THEN
          v_walk_end := v_mo.month;
          EXIT;
        END IF;
        -- RULING 3: while waiting, only the months of the window count.
        EXIT WHEN v_t_state = 'waiting' AND v_mo.month > (v_p.window_start + make_interval(months => v_p.window_months - 1))::date;
        IF v_t_state = 'waiting' AND v_mo.status IN ('met', 'decided_met') THEN
          -- RULING 3: the first month with every target met releases the held part.
          v_t_state := 'released'; v_t_run := 0; v_t_month := v_mo.month; v_t_action := 'released';
        ELSIF v_t_state = 'released' AND v_mo.status IN ('missed', 'decided_missed') THEN
          v_t_run := v_t_run + 1;
          -- RULING 4: the set number of missed months in a row pauses it.
          IF v_t_run >= (v_p.rules->>'pause_after_missed_months')::int THEN
            v_t_state := 'paused'; v_t_run := 0; v_t_month := v_mo.month; v_t_action := 'paused';
          END IF;
        ELSIF v_t_state = 'released' AND v_mo.status IN ('met', 'decided_met') THEN
          v_t_run := 0;  -- a met month starts the missed months in a row again
        ELSIF v_t_state = 'paused' AND v_mo.status IN ('met', 'decided_met') THEN
          -- RULING 4: back on target: paid again.
          v_t_state := 'released'; v_t_run := 0; v_t_month := v_mo.month; v_t_action := 'resumed';
        END IF;
        IF v_t_met IS NULL AND v_mo.month >= v_from AND v_mo.status IN ('met', 'decided_met') THEN
          v_t_met := v_mo.month;  -- on target in the current run of misses (Director ruling (b) below)
        END IF;
      END LOOP;

      -- Compare with where the held part stands, and write ONLY the change,
      -- from the next 1st (target_pay: never backdated); a pay row already
      -- written is never undone (Director ruling (b)).
      SELECT * INTO v_p FROM public.hr_salary_revision_target_plans WHERE request_id = v_p.request_id;
      -- DIRECTOR RULING (b), 8 Oct 2026: a part PAUSED stays paused until a month
      -- on target. When the months behind its pause later turn not counted (or
      -- not measured), the replay no longer pauses it at all; that alone never
      -- pays it again: only a met (or decided met) month in the current run of
      -- misses does (round 7, B4: a late met month resumes it).
      IF v_p.state = 'paused' AND v_t_state = 'released' AND v_t_met IS NULL THEN
        v_t_state := 'paused'; v_t_run := 0; v_t_month := NULL; v_t_action := NULL;
      END IF;
      -- A change already written for a month at or after the stop (a month
      -- since gone unsettled, or a flagged month older than it, R8-U4c): the
      -- replay stops before the month that change stands on, so it cannot
      -- speak for it. Nothing is written until that month is settled again.
      SELECT max(mo.month) INTO v_t_last FROM public.hr_salary_revision_target_months mo
       WHERE mo.request_id = v_p.request_id AND mo.acted AND mo.action IN ('released', 'paused', 'resumed');
      IF v_t_last IS NULL OR v_t_last < v_walk_end THEN
        v_action := 'none'; v_eff := NULL;
        IF v_p.state = 'waiting' AND v_t_state = 'released' THEN
          v_eff := public.hr_salary_revision_target_pay(v_p.request_id, 'release', p_today);
          v_action := 'released';
        ELSIF v_p.state = 'released' AND v_t_state = 'paused' THEN
          v_eff := public.hr_salary_revision_target_pay(v_p.request_id, 'pause', p_today);
          v_action := 'paused';
        ELSIF v_p.state = 'paused' AND v_t_state = 'released' THEN
          v_eff := public.hr_salary_revision_target_pay(v_p.request_id, 'resume', p_today);
          v_action := 'resumed';
          -- Carried by the month on target that pays it again: the replay's own
          -- resume, else (the pause above it no longer there) the first met
          -- month of the current run of misses.
          IF v_t_action IS DISTINCT FROM 'resumed' THEN
            v_t_month := v_t_met;
          END IF;
        ELSIF v_p.state = 'waiting' AND v_t_state = 'paused' THEN
          -- Released and paused again within the months settled now: the held
          -- part was never paid, so nothing is written to the pay; it is
          -- paused from the next 1st (a month on target pays it then).
          v_eff := public.hr_salary_revision_start_date(v_p.staff_id, p_today - 1);
          UPDATE public.hr_salary_revision_target_plans
             SET state = 'paused', paused_from = v_eff, pending_action = NULL, pending_effective_from = NULL,
                 updated_at = now()
           WHERE request_id = v_p.request_id;
          v_action := 'paused';
        END IF;
        -- One pay write at most (the no-pay pause above writes none).
        IF v_action <> 'none' AND NOT (v_p.state = 'waiting' AND v_t_state = 'paused') THEN
          v_writes := v_writes + 1;
        END IF;
        -- Every month the replay walked is acted on; the month of the change
        -- carries it, with the date it takes effect.
        UPDATE public.hr_salary_revision_target_months
           SET acted = true, action = 'none'
         WHERE request_id = v_p.request_id AND NOT acted
           AND status IN ('met', 'missed', 'not_counted', 'decided_met', 'decided_missed')
           -- 8 Oct 2026 (finding 2; round 7, B3): never at or past the first finished
           -- month that cannot be acted on yet (waiting for its days, flagged, capped).
           AND month < v_walk_end;
        GET DIAGNOSTICS v_found_n = ROW_COUNT;
        v_moved := v_moved + v_found_n;
        IF v_action <> 'none' THEN
          UPDATE public.hr_salary_revision_target_months
             SET acted = true, action = v_action, action_effective_from = v_eff
           WHERE request_id = v_p.request_id AND month = v_t_month;
        END IF;
        -- The missed months in a row are the replay's (0 once paused). While a
        -- month waits (the stop), the replay ends before it: the count is the
        -- replay's when this run measured again or acted on a month before
        -- the stop, or wrote a change (R8-U4b: the cap); otherwise it is left
        -- as it stands, so a counted miss that now waits to be measured again
        -- still counts until it is (B2, R6-2).
        IF v_stop IS NULL OR v_action <> 'none' OR v_moved > 0 THEN
          UPDATE public.hr_salary_revision_target_plans
             SET missed_in_row = v_t_run, updated_at = now()
           WHERE request_id = v_p.request_id AND missed_in_row IS DISTINCT FROM v_t_run;
        END IF;
      END IF;

      -- RULING 3: the window is over, every month of it counted and acted on,
      -- and nothing released: back to the Director with the numbers.
      SELECT * INTO v_p FROM public.hr_salary_revision_target_plans WHERE request_id = v_p.request_id;
      -- 8 Oct 2026 (round 8, U1; corrected in round 10, X1): the same rule
      -- holds here. The window is over only when this run left nothing before
      -- this month unsettled (v_stop is clear: no window month waiting for its
      -- days, flagged, or left by the cap) AND every window month is acted on
      -- and settled (hr_salary_revision_target_month_settled: a missed month
      -- only on a complete record whose leave and holiday keys are still
      -- today's). Round 8 said the stop alone kept the count short; it did not:
      -- a window month closed as not measured by an OFF night is acted on
      -- without the run counting it, so the count was met while an earlier
      -- window month waited to be measured again (RV5-A: M4 counted missed,
      -- then stale on a new department holiday; M5 closed not measured; the M6
      -- run stopped at M4 yet sent the part back to the Director, so it left
      -- hr_target_schedule_ranges and M4, which measured again would release,
      -- never was). Waiting, the part stays in hr_target_schedule_ranges, so
      -- its days are recorded again (RV3-P4).
      -- 8 Oct 2026 (round 9, W1): only the window's own months are counted
      -- (window_start to v_last). The months a part waited for measurement
      -- while it was OFF are written as not measured (acted) BEFORE its window:
      -- counted, they sent the part back to the Director a month early (the
      -- release it earned lost) or, too many, never (RV4-A1, A2, B).
      IF v_p.state = 'waiting' AND v_cur_m > v_last
         AND v_stop IS NULL
         AND (SELECT count(*) FROM public.hr_salary_revision_target_months mo
               WHERE mo.request_id = v_p.request_id AND mo.month >= v_p.window_start AND mo.month <= v_last
                 AND mo.acted
                 AND public.hr_salary_revision_target_month_settled(v_p.request_id, v_p.staff_id, mo.month)
             ) = v_p.window_months THEN
        UPDATE public.hr_salary_revision_target_plans
           SET state = 'back_to_director', state_reason = 'window_over', updated_at = now()
         WHERE request_id = v_p.request_id;
      END IF;

      UPDATE public.hr_salary_revision_target_plans SET run_note = NULL
       WHERE request_id = v_p.request_id AND run_note IS NOT NULL;
      -- 8 Oct 2026 (default oo): listed while a finished month waits for its days.
      IF cardinality(v_waiting) > 0 THEN
        -- Round 8: a counted missed month waiting to be measured again says so.
        UPDATE public.hr_salary_revision_target_plans
           SET run_note = CASE WHEN EXISTS (SELECT 1 FROM public.hr_salary_revision_target_months mo
                                             WHERE mo.request_id = v_p.request_id AND mo.month = v_waiting[1]
                                               AND mo.status = 'missed')
                               THEN 'Counted missed, measured again once every day it reads is in the schedule record again: '
                               ELSE 'Not counted yet, some days not in the schedule record: ' END
                          || to_char(v_waiting[1], 'FMMonth YYYY')
                          || '. The months after it are counted after it, in calendar order.',
               updated_at = now()
         WHERE request_id = v_p.request_id;
      -- Round 7 (B3): listed while a flagged month waits for the Director.
      ELSIF v_stop IS NOT NULL AND EXISTS (SELECT 1 FROM public.hr_salary_revision_target_months mo
                                            WHERE mo.request_id = v_p.request_id AND mo.month = v_stop
                                              AND mo.status = 'flagged') THEN
        UPDATE public.hr_salary_revision_target_plans
           SET run_note = 'Flagged, waiting for the Director''s decision: '
                          || to_char(v_stop, 'FMMonth YYYY')
                          || '. The months after it are counted after it, in calendar order.',
               updated_at = now()
         WHERE request_id = v_p.request_id;
      END IF;
    END one;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.hr_salary_revision_target_plans
       SET run_note = 'The monthly targets run could not finish for this raise: ' || SQLERRM, updated_at = now()
     WHERE request_id = p_request_id;
  END;
  UPDATE public.hr_salary_revision_target_plans SET last_run_on = p_today, failed_nights = 0
   WHERE request_id = p_request_id;
  RETURN v_writes;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_targets_run_one(uuid, date, integer) FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.hr_salary_revision_targets_run_one(uuid, date, integer) IS
  'Internal. The monthly targets run for ONE raise on one day: measures its months in calendar order (at most '
  'p_max_months per call; once paid, only the months the pause rule can use; a finished month only once every day it '
  'reads is in the schedule record; a missed month again when its approved leave or holidays changed), stopping at '
  'the first finished month that is not settled (hr_salary_revision_target_month_settled, round 8), then works out '
  'the state the held part should be in by replaying every settled month from its window start in calendar order '
  '(round 12) and writes only the change from where it stands (release, pause or resume, from the next 1st; a '
  'paused part is paid again only on a month on target, Director ruling (b)), sends a window that ran out back to '
  'the Director, lapses a plan whose person left or moved. Marks the plan as run that day. '
  'Migrations 20271007180207, 20271008093015.';

-- ----------------------------------------------------------------------------
-- f. Self-check: the re-created bodies read the record and keep #4252's rules.
-- ----------------------------------------------------------------------------
DO $selfcheck$
DECLARE
  v_measure  text := pg_get_functiondef('public.hr_salary_revision_target_measure(uuid, date, jsonb)'::regprocedure);
  v_teaches  text := pg_get_functiondef('public.hr_salary_revision_target_teaches(uuid, date, date)'::regprocedure);
  v_classify text := pg_get_functiondef('public.hr_salary_revision_target_classify(uuid, jsonb, date)'::regprocedure);
  v_run      text := pg_get_functiondef('public.hr_salary_revision_targets_run_one(uuid, date, integer)'::regprocedure);
BEGIN
  -- Each body is this file's (its "8 Oct 2026" lines are in it), and neither
  -- the measure nor teaches reads the timetable JSON any more.
  IF position('8 Oct 2026' IN v_measure) = 0 OR position('8 Oct 2026' IN v_teaches) = 0
     OR position('8 Oct 2026' IN v_classify) = 0 OR position('8 Oct 2026' IN v_run) = 0 THEN
    RAISE EXCEPTION 'SELF-CHECK: a re-created body is not this file''s. The file stops here.';
  END IF;
  IF position('hr_target_scheduled_periods' IN v_measure) = 0 OR position('timetable_data' IN v_measure) > 0
     OR position('hr_target_scheduled_periods' IN v_teaches) = 0 OR position('timetable_data' IN v_teaches) > 0 THEN
    RAISE EXCEPTION 'SELF-CHECK: the measure or teaches does not read the schedule record, or still reads timetable_data. The file stops here.';
  END IF;
END
$selfcheck$;

NOTIFY pgrst, 'reload schema';

-- ROLLBACK (down migration): re-apply 20271007180207 sections c (the measure),
-- d (teaches, classify) and f (hr_salary_revision_targets_run_one) to restore
-- #4252's four bodies; then remove fn_hr_target_schedule_record,
-- fn_hr_target_schedule_needs, hr_target_schedule_record,
-- hr_target_schedule_needs, hr_target_schedule_ranges, hr_salary_revision_target_leave_key,
-- hr_salary_revision_target_holiday_key, hr_salary_revision_target_missed_in_row,
-- hr_salary_revision_target_month_settled,
-- hr_target_schedule_missing_days, hr_target_schedule_holiday_key and
-- hr_target_schedule_institutions (DROP FUNCTION IF EXISTS), and the table
-- hr_target_scheduled_periods with the columns
-- hr_salary_revision_target_months.leave_key and .holiday_key (both hold only
-- re-creatable records). Rolling back writes nobody's pay. Point the cron route back at
-- #4252's behaviour by reverting the route and the recorder in the same step.
