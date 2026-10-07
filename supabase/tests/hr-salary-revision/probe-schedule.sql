-- Raise targets: the schedule record (20271008093015, 8 Oct 2026), the six
-- review findings of round 5 and the record's own rules. Run by run-targets.sh
-- on the full stack, after seed-targets.sql and mirror-schedule.sql (the
-- rehearsal's stand-in for the nightly job). A probe that needs a day the way
-- the app's resolver would record it (a cycle or batch timetable, a holiday
-- applied, a day recorded on the day itself) writes it through
-- hr_target_schedule_record, as the job does. Each line prints PASS or FAIL.
\set ON_ERROR_STOP 0
\set D    '00000000-0000-0000-0000-000000010001'
\set H    '00000000-0000-0000-0000-000000010002'
\set PA   '00000000-0000-0000-0000-000000010003'
\set F4   '00000000-0000-0000-0000-000000010014'
\set F9   '00000000-0000-0000-0000-000000010020'
\set F10  '00000000-0000-0000-0000-000000010021'
\set F12  '00000000-0000-0000-0000-000000010023'
\set sH   '00000000-0000-0000-0000-000000020002'
\set sF4  '00000000-0000-0000-0000-000000020014'
\set sF8  '00000000-0000-0000-0000-000000020019'
\set sF9  '00000000-0000-0000-0000-000000020020'
\set sF10 '00000000-0000-0000-0000-000000020021'
\set sF11 '00000000-0000-0000-0000-000000020022'
\set sF12 '00000000-0000-0000-0000-000000020023'
\set A    '00000000-0000-0000-0000-0000000000a1'
\set DEPT '00000000-0000-0000-0000-00000000d0a1'
\set C4   '00000000-0000-0000-0000-0000000c0004'
\set C8   '00000000-0000-0000-0000-0000000c0008'
\set C9   '00000000-0000-0000-0000-0000000c0009'
\set C10  '00000000-0000-0000-0000-0000000c0011'
\set C11  '00000000-0000-0000-0000-0000000c0012'
\set C12  '00000000-0000-0000-0000-0000000c0015'
\set T '{"t1_marked_by_self_min_pct": 85, "t1_mark_within_hours": 24, "t3_linked_min_pct": 60, "t4_resource_min_pct": 25, "t5_min_pulses_per_week": 1}'

-- The test clock: t.today when set, the real date otherwise.
CREATE OR REPLACE FUNCTION public.hr_salary_revision_ist_today()
RETURNS date LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT COALESCE(NULLIF(current_setting('t.today', true), '')::date, (now() AT TIME ZONE 'Asia/Kolkata')::date)
$$;
SELECT set_config('t.today', '', false);
SELECT public.hr_salary_revision_ist_today() AS today,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '1 month')::date AS m1,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '2 month')::date AS m2,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '3 month')::date AS m3,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '4 month')::date AS m4 \gset
UPDATE public.platform_policies SET value = 'true'::jsonb WHERE policy_key = 'hr.salary_revision.target_measurement_on';
SELECT t.login(NULL);

-- ── W. Who may list, record and read it ─────────────────────────────────────
SET ROLE authenticated;
SELECT t.login(:'D');
SELECT t.check('a signed-in person (even the Director) cannot list, record or read the schedule record',
  t.try('SELECT * FROM public.fn_hr_target_schedule_needs(10)') = '42501'
  AND t.try(format('SELECT public.fn_hr_target_schedule_record(%L, %L, %L, %L)', :'sF8', :'today', '[]', 'x')) = '42501'
  AND t.try(format('SELECT public.hr_target_schedule_record(%L, %L, %L, %L, %L)', :'sF8', :'today', '[]', 'x', :'today')) = '42501'
  AND t.try('SELECT count(*) FROM public.hr_target_scheduled_periods') = '42501');
RESET ROLE;
SET ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
SELECT t.check('the nightly job (the service role) lists the days and records one',
  t.try('SELECT * FROM public.fn_hr_target_schedule_needs(10)') = 'ok'
  AND t.try(format('SELECT public.fn_hr_target_schedule_record(%L, %L, %L, %L)', :'sF8', :'today', '[]', 'probe')) = 'ok');
SELECT t.check('a day not yet begun is refused',
  t.try(format('SELECT public.fn_hr_target_schedule_record(%L, %L, %L, %L)', :'sF8', (:'today'::date + 1), '[]', 'probe')) = '22023');
SELECT t.check('anything but a list of periods is refused, and a period needs a real timetable id',
  t.try(format('SELECT public.fn_hr_target_schedule_record(%L, %L, %L, %L)', :'sF8', :'today', '{"a": 1}', 'probe')) = '22023'
  AND t.try(format('SELECT public.fn_hr_target_schedule_record(%L, %L, %L, %L)', :'sF8', :'today', '[1]', 'probe')) = '22023'
  AND t.try(format('SELECT public.fn_hr_target_schedule_record(%L, %L, %L, %L)', :'sF8', :'today', '[{"timetable_id": "x"}]', 'probe')) = '22P02'
  AND t.try(format('SELECT public.fn_hr_target_schedule_record(%L, %L, %L, %L)', :'sF8', :'today', '[{"period_name": "P1"}]', 'probe')) = '22023');
-- The job's key carrying a signed-in user (even the Director's) is refused by the functions themselves.
SELECT set_config('request.jwt.claims', json_build_object('role', 'service_role', 'sub', :'D')::text, false);
SELECT t.check('a call carrying a signed-in user is refused even with the job''s key',
  t.try('SELECT * FROM public.fn_hr_target_schedule_needs(10)') = '42501'
  AND t.try(format('SELECT public.fn_hr_target_schedule_record(%L, %L, %L, %L)', :'sF8', :'today', '[]', 'probe')) = '42501');
RESET ROLE;
SELECT set_config('request.jwt.claims', '', false);
SELECT public.hr_target_schedule_record(:'sF8', (:'today'::date - 3),
  '[{"timetable_id": "00000000-0000-0000-0000-0000000aa001", "period_name": "  P1 ", "start_time": "9:00 AM",
     "end_time": "10:00", "is_primary": true, "kind": "weird", "extra": "dropped"}]', 'probe', (:'today'::date - 3)) AS n3 \gset
SELECT t.check('a period is kept in the exact shape of the contract (unknown fields dropped, a time not HH:MM empty)',
  (SELECT periods = '[{"kind": "slot", "slot_id": "", "end_time": "10:00", "course_id": null, "is_primary": true,
                       "start_time": null, "period_name": "P1", "section_ids": [], "timetable_id": "00000000-0000-0000-0000-0000000aa001",
                       "institution_id": null}]'::jsonb AND recorded_live
     FROM public.hr_target_scheduled_periods WHERE staff_id = :'sF8' AND day = (:'today'::date - 3)),
  (SELECT periods::text FROM public.hr_target_scheduled_periods WHERE staff_id = :'sF8' AND day = (:'today'::date - 3)));

-- ── F1. A replacement that names its periods differently ────────────────────
-- F9's old timetable calls the 09:00-10:00 class 'Period 1'; its replacement
-- (made now) calls it 'Lecture 1'. Both are recorded for every day of M1. On
-- the 1st the OLD one was marked (by F9, on time); on the 5th the replacement
-- also has 'Lecture 1b' at 09:30-10:30 (same timetable: a second class).
INSERT INTO public.timetables (id, institution_id, timetable_name, start_date, end_date, created_at)
VALUES ('00000000-0000-0000-0000-0000000aa101', :'A', 'F9 old', :'m1', (:'m2'::date - 1), now() - interval '1 year'),
       ('00000000-0000-0000-0000-0000000aa102', :'A', 'F9 new', :'m1', (:'m2'::date - 1), now());
SELECT count(public.hr_target_schedule_record(:'sF9', d::date,
         jsonb_build_array(
           jsonb_build_object('timetable_id', '00000000-0000-0000-0000-0000000aa101', 'slot_id', 'o1', 'period_name', 'Period 1',
                              'course_id', :'C9', 'start_time', '09:00', 'end_time', '10:00', 'is_primary', true),
           jsonb_build_object('timetable_id', '00000000-0000-0000-0000-0000000aa102', 'slot_id', 'n1', 'period_name', 'Lecture 1',
                              'course_id', :'C9', 'start_time', '09:00', 'end_time', '10:00', 'is_primary', true))
         || CASE WHEN d::date = :'m1'::date + 4 THEN jsonb_build_array(
           jsonb_build_object('timetable_id', '00000000-0000-0000-0000-0000000aa102', 'slot_id', 'n2', 'period_name', 'Lecture 1b',
                              'course_id', :'C9', 'start_time', '09:30', 'end_time', '10:30', 'is_primary', true)) ELSE '[]'::jsonb END,
         'probe', d::date + 1))
  FROM generate_series(:'m1'::date, (:'m2'::date - 1), interval '1 day') d \gset
INSERT INTO public.attendance_first_marks (timetable_id, attendance_date, period_name, ordinal, marker_profile_id, first_marked_at)
VALUES ('00000000-0000-0000-0000-0000000aa101', :'m1', 'Period 1', 1, :'F9', (:'m1'::date + time '09:30') AT TIME ZONE 'Asia/Kolkata');
CREATE TEMP TABLE f1 AS SELECT * FROM public.hr_salary_revision_target_measure(:'sF9', :'m1', :'T');
SELECT t.check('F1 a replaced timetable that names its periods differently counts once at each time (the marked one, else the newer); two overlapping periods of ONE timetable both count',
  (SELECT denominator = t.days_in(:'m1') + 1 AND numerator = 1 FROM f1 WHERE target = 't1'),
  (SELECT numerator || '/' || denominator || ' expected 1/' || (t.days_in(:'m1') + 1) FROM f1 WHERE target = 't1'));

-- ── F2. Cycle and batch timetables ──────────────────────────────────────────
-- Keyed 'cycle-1' and by dates: the old SQL found nothing in them. The app's
-- resolver (get_cycle_for_date, the batch RANGEs) gives F11 the cycle class
-- every day of M1 and the clinic on its first ten days; that is what counts.
INSERT INTO public.timetables (id, institution_id, timetable_name, timetable_format, start_date, end_date, timetable_data, periods, created_at)
VALUES ('00000000-0000-0000-0000-0000000aa201', :'A', 'F11 cycle', 'cycle', :'m1', (:'m2'::date - 1),
        jsonb_build_object('cycle-1', jsonb_build_object('p1', jsonb_build_object('course_id', :'C11', 'primary_staff_id', :'sF11'))),
        '[{"id": "p1", "period_name": "Cycle 1", "start_time": "09:00", "end_time": "10:00"}]', now() - interval '1 year'),
       ('00000000-0000-0000-0000-0000000aa202', :'A', 'F11 batch', 'batch', :'m1', (:'m2'::date - 1),
        jsonb_build_object(:'m1'::text, jsonb_build_object('p2', jsonb_build_object('course_id', :'C11', 'primary_staff_id', :'sF11'))),
        '[{"id": "p2", "period_name": "Clinic", "start_time": "14:00", "end_time": "16:00"}]', now() - interval '1 year');
SELECT count(public.hr_target_schedule_record(:'sF11', d::date,
         jsonb_build_array(jsonb_build_object('timetable_id', '00000000-0000-0000-0000-0000000aa201', 'slot_id', 'c1',
                             'period_name', 'Cycle 1', 'course_id', :'C11', 'start_time', '09:00', 'end_time', '10:00', 'is_primary', true))
         || CASE WHEN d::date < :'m1'::date + 10 THEN jsonb_build_array(jsonb_build_object(
              'timetable_id', '00000000-0000-0000-0000-0000000aa202', 'slot_id', 'b1', 'period_name', 'Clinic',
              'course_id', :'C11', 'start_time', '14:00', 'end_time', '16:00', 'is_primary', true)) ELSE '[]'::jsonb END,
         'probe', d::date))
  FROM generate_series(:'m1'::date, (:'m2'::date - 1), interval '1 day') d \gset
CREATE TEMP TABLE f2 AS SELECT * FROM public.hr_salary_revision_target_measure(:'sF11', :'m1', :'T');
SELECT t.check('F2 the periods of a cycle timetable and a batch timetable, as the app''s resolver recorded them, count',
  (SELECT denominator = t.days_in(:'m1') + 10 FROM f2 WHERE target = 't1'),
  (SELECT denominator::text || ' expected ' || (t.days_in(:'m1') + 10) FROM f2 WHERE target = 't1'));
SELECT t.check('F2 a period where they are only a co-teacher is recorded, not counted (default tt)',
  (SELECT public.hr_target_schedule_record(:'sF11', :'m1', periods || jsonb_build_array(jsonb_build_object(
            'timetable_id', '00000000-0000-0000-0000-0000000aa201', 'slot_id', 'c2', 'period_name', 'Cycle 2',
            'course_id', :'C11', 'start_time', '11:00', 'end_time', '12:00', 'is_primary', false)), 'probe', :'m1') = 3
     FROM public.hr_target_scheduled_periods WHERE staff_id = :'sF11' AND day = :'m1')
  AND (SELECT denominator = t.days_in(:'m1') + 10 FROM public.hr_salary_revision_target_measure(:'sF11', :'m1', :'T') WHERE target = 't1'));

-- ── F3. A holiday approved after the day was recorded ───────────────────────
-- F8 has a raise asked for (so the job records F8's last 90 days). The 5th day
-- back was recorded on the day itself, with a class of a Department A1
-- timetable. A Department A1 holiday is approved for that day afterwards.
SET ROLE authenticated;
SELECT t.login(:'H');
SELECT public.fn_hr_salary_revision_propose(:'sF8', 34000, 'New lab') AS req_f8 \gset
RESET ROLE;
SELECT t.login(NULL);
INSERT INTO public.timetables (id, institution_id, timetable_name, start_date, end_date, department_id, created_at)
VALUES ('00000000-0000-0000-0000-0000000aa301', :'A', 'F8 dept', (:'today'::date - 30), (:'today'::date + 30), :'DEPT', now() - interval '1 year');
SELECT public.hr_target_schedule_record(:'sF8', (:'today'::date - 5), jsonb_build_array(jsonb_build_object(
         'timetable_id', '00000000-0000-0000-0000-0000000aa301', 'slot_id', 'd1', 'period_name', 'Period 1',
         'course_id', :'C8', 'start_time', '09:00', 'end_time', '10:00', 'is_primary', true)), 'probe', (:'today'::date - 5)) AS r3 \gset
SELECT t.check('F3 a recorded day whose holidays did not change is not asked for again',
  NOT EXISTS (SELECT 1 FROM public.hr_target_schedule_needs(:'today', 100000) n WHERE n.staff_id = :'sF8' AND n.day = (:'today'::date - 5)));
INSERT INTO public.institution_leaves (institution_id, leave_type_id, leave_name, start_date, end_date, status, requested_by, scope_level, department_ids)
VALUES (:'A', '00000000-0000-0000-0000-0000000001e1', 'Department day', (:'today'::date - 5), (:'today'::date - 5), 'approved', :'D',
        'department', ARRAY[:'DEPT']::uuid[]);
SELECT t.check('F3 a department holiday approved after the day was recorded: the day is asked for again',
  EXISTS (SELECT 1 FROM public.hr_target_schedule_needs(:'today', 100000) n
           WHERE n.staff_id = :'sF8' AND n.day = (:'today'::date - 5) AND n.reason = 'holidays_changed'));
-- The resolver now leaves the class out (approved-leave-scope.ts) and the job records it again.
SELECT public.hr_target_schedule_record(:'sF8', (:'today'::date - 5), '[]', 'probe', :'today') AS r3b \gset
SELECT t.check('F3 recorded again: not asked for any more, and still a day recorded on the day itself',
  NOT EXISTS (SELECT 1 FROM public.hr_target_schedule_needs(:'today', 100000) n WHERE n.staff_id = :'sF8' AND n.day = (:'today'::date - 5))
  AND (SELECT recorded_live AND periods = '[]'::jsonb FROM public.hr_target_scheduled_periods WHERE staff_id = :'sF8' AND day = (:'today'::date - 5)));
-- Missing days: today first (recorded on the day itself), then the rest newest first.
DELETE FROM public.hr_target_scheduled_periods WHERE staff_id = :'sF8' AND day IN (:'today'::date, :'today'::date - 40);
SELECT t.check('the days to record: today first (live), then missing days; nothing for someone with no raise in play',
  (SELECT n.staff_id = :'sF8' AND n.day = :'today'::date AND n.reason = 'live' FROM public.hr_target_schedule_needs(:'today', 1) n)
  AND EXISTS (SELECT 1 FROM public.hr_target_schedule_needs(:'today', 100000) n
               WHERE n.staff_id = :'sF8' AND n.day = (:'today'::date - 40) AND n.reason = 'missing')
  AND NOT EXISTS (SELECT 1 FROM public.hr_target_schedule_needs(:'today', 100000) n WHERE n.staff_id = :'sF9')
  AND (SELECT max(n.day) <= :'today'::date AND min(n.day) >= (:'today'::date - 400) FROM public.hr_target_schedule_needs(:'today', 100000) n));
SELECT t.mirror_staff(:'sF8');

-- ── F4. Who teaches ─────────────────────────────────────────────────────────
-- F12 (role 'lecturer': no role targets) has a timetable made just now, inside
-- the 90 days, never first-marked. Its days recorded after the fact are no
-- proof; one day recorded ON the day itself is.
SET ROLE authenticated;
SELECT t.login(:'H');
SELECT public.fn_hr_salary_revision_propose(:'sF12', 34000, 'Teaches') AS req_f12 \gset
SELECT t.login(:'PA');
SELECT public.fn_hr_salary_revision_propose(:'sH', 100000, 'HR load') AS req_h \gset
RESET ROLE;
SELECT t.login(NULL);
INSERT INTO public.timetables (id, institution_id, timetable_name, start_date, end_date, created_at)
VALUES ('00000000-0000-0000-0000-0000000aa401', :'A', 'F12 new', (:'today'::date - 60), (:'today'::date + 30), now());
SELECT count(public.hr_target_schedule_record(:'sF12', d::date, jsonb_build_array(jsonb_build_object(
         'timetable_id', '00000000-0000-0000-0000-0000000aa401', 'slot_id', 'l1', 'period_name', 'Period 1',
         'course_id', :'C12', 'start_time', '09:00', 'end_time', '10:00', 'is_primary', true)), 'probe', d::date + 1))
  FROM generate_series((:'today'::date - 60), (:'today'::date - 1), interval '1 day') d \gset
SELECT t.check('F4 periods recorded after the fact, on a timetable made inside the 90 days and never marked: not teaching',
  public.hr_salary_revision_target_teaches(:'sF12', (:'today'::date - 90), (:'today'::date - 1)) IS FALSE
  AND (SELECT state = 'held_listed' AND reason = 'no_teaching_timetable'
         FROM public.hr_salary_revision_target_classify(:'req_f12', public.hr_salary_revision_target_rules(), :'today')));
SELECT public.hr_target_schedule_record(:'sF12', (:'today'::date - 20), periods, 'probe', (:'today'::date - 20)) AS r4
  FROM public.hr_target_scheduled_periods WHERE staff_id = :'sF12' AND day = (:'today'::date - 20) \gset
SELECT t.check('F4 a day recorded on the day itself counts, whenever the timetable was made',
  public.hr_salary_revision_target_teaches(:'sF12', (:'today'::date - 90), (:'today'::date - 1)) IS TRUE
  AND (SELECT state = 'waiting' AND role = 'faculty'
         FROM public.hr_salary_revision_target_classify(:'req_f12', public.hr_salary_revision_target_rules(), :'today')));
-- H teaches nothing; one of H's 90 days is missing from the record.
DELETE FROM public.hr_target_scheduled_periods WHERE staff_id = :'sH' AND day = (:'today'::date - 40);
SELECT t.check('F4 one of the 90 days not recorded and no teaching found: undecided, the held part waits (awaiting_measurement)',
  public.hr_salary_revision_target_teaches(:'sH', (:'today'::date - 90), (:'today'::date - 1)) IS NULL
  AND (SELECT state = 'awaiting_measurement' AND reason = 'schedule_not_recorded'
         FROM public.hr_salary_revision_target_classify(:'req_h', public.hr_salary_revision_target_rules(), :'today')));
SELECT t.mirror_staff(:'sH');
SELECT t.check('F4 all 90 days recorded and no teaching: does not teach (parked, as before)',
  (SELECT state = 'held_listed' AND reason = 'no_teaching_timetable'
     FROM public.hr_salary_revision_target_classify(:'req_h', public.hr_salary_revision_target_rules(), :'today')));

-- ── F5. The last week of a month ────────────────────────────────────────────
-- A month MZ whose 1st is not a Monday and whose last day is not a Sunday.
-- F10 teaches every day; pulses every day of MZ EXCEPT the days of the week
-- that ends in the next month (its pulse comes on the next month's 1st).
SELECT m AS mz FROM (SELECT (date_trunc('month', :'today'::date) + make_interval(months => k))::date AS m
                       FROM generate_series(1, 14) k) x
 WHERE extract(isodow FROM m) <> 1 AND extract(isodow FROM (m + interval '1 month' - interval '1 day')) <> 7
 ORDER BY m LIMIT 1 \gset
SELECT (:'mz'::date + interval '1 month')::date AS mz1,
       date_trunc('week', (:'mz'::date + interval '1 month' - interval '1 day'))::date AS wcross \gset
SELECT t.tt(:'sF10', :'A', :'C10', (:'mz'::date - 10), (:'mz1'::date + 10)) AS tt10 \gset
SELECT t.spine(:'C10', :'F10', false);
SELECT t.teach(:'tt10', :'F10', :'C10', :'mz', t.all_days(:'mz'), NULL, NULL, NULL, NULL, NULL,
               (SELECT array_agg(d) FROM generate_series(1, t.days_in(:'mz')) d WHERE :'mz'::date + d - 1 < :'wcross'::date));
SELECT count(*) AS sundays FROM generate_series(:'mz'::date, (:'mz1'::date - 1), interval '1 day') d WHERE extract(isodow FROM d) = 7 \gset
CREATE TEMP TABLE f5 AS SELECT * FROM public.hr_salary_revision_target_measure(:'sF10', :'mz', :'T');
SELECT t.check('F5 a week counts in the month its Sunday falls in: the last week, which ends next month, is not judged yet',
  (SELECT denominator = :'sundays'::int AND met FROM f5 WHERE target = 't5'),
  (SELECT numerator || '/' || denominator || ' expected ' || :'sundays' || '/' || :'sundays' FROM f5 WHERE target = 't5'));
SELECT t.teach(:'tt10', :'F10', :'C10', :'mz1', ARRAY[1, 2, 3, 4, 5, 6, 7], NULL, NULL, NULL, NULL, NULL, ARRAY[1]);
SELECT t.check('F5 that week is judged with the next month, and its pulse there counts',
  (SELECT numerator = 1 FROM public.hr_salary_revision_target_measure(:'sF10', :'mz1', :'T') WHERE target = 't5')
  AND EXISTS (SELECT 1 FROM public.hr_target_scheduled_periods sp WHERE sp.staff_id = :'sF10' AND sp.day = :'wcross'::date
                 AND jsonb_array_length(sp.periods) > 0));

-- ── Round 6, finding 3: a cycle timetable after a college holiday approved later ──
-- F8 (a raise asked for: the job records F8's last 90 days) teaches in a cycle
-- timetable of college A that began 30 days ago. Its last 20 days were recorded
-- (not live). get_cycle_for_date numbers a day by the working days since the
-- start, so a college holiday approved now for the 15th day back moves the
-- cycle of EVERY later day: each must be recorded again, not only that day.
INSERT INTO public.timetables (id, institution_id, timetable_name, timetable_format, start_date, end_date, periods, created_at)
VALUES ('00000000-0000-0000-0000-0000000aa601', :'A', 'F8 cycle', 'cycle', (:'today'::date - 30), (:'today'::date + 30),
        '[{"id": "p1", "period_name": "Cycle 1", "start_time": "11:00", "end_time": "12:00"}]', now() - interval '1 year');
SELECT count(public.hr_target_schedule_record(:'sF8', d::date, jsonb_build_array(jsonb_build_object(
         'timetable_id', '00000000-0000-0000-0000-0000000aa601', 'slot_id', 'y1', 'period_name', 'Cycle 1',
         'course_id', :'C8', 'start_time', '11:00', 'end_time', '12:00', 'is_primary', true)), 'probe', :'today'))
  FROM generate_series((:'today'::date - 20), (:'today'::date - 1), interval '1 day') d \gset
SELECT count(*) AS r6_before FROM public.hr_target_schedule_needs(:'today', 100000) n
 WHERE n.staff_id = :'sF8' AND n.day BETWEEN (:'today'::date - 15) AND (:'today'::date - 1) \gset
INSERT INTO public.institution_leaves (institution_id, leave_type_id, leave_name, start_date, end_date, status, requested_by, scope_level)
VALUES (:'A', '00000000-0000-0000-0000-0000000001e1', 'College day', (:'today'::date - 15), (:'today'::date - 15), 'approved', :'D',
        'institution');
SELECT t.check('R6-3 a college holiday approved later on a cycle timetable''s day: that day AND every later recorded day is asked for again (their cycle moved)',
  :'r6_before'::int = 0
  AND (SELECT count(*) FROM public.hr_target_schedule_needs(:'today', 100000) n
        WHERE n.staff_id = :'sF8' AND n.day BETWEEN (:'today'::date - 15) AND (:'today'::date - 1)
          AND n.reason = 'holidays_changed') = 15
  AND NOT EXISTS (SELECT 1 FROM public.hr_target_schedule_needs(:'today', 100000) n
                   WHERE n.staff_id = :'sF8' AND n.day BETWEEN (:'today'::date - 20) AND (:'today'::date - 16)),
  (SELECT :'r6_before' || ' before; after: ' || count(*) || ' of 15 asked for again'
     FROM public.hr_target_schedule_needs(:'today', 100000) n
    WHERE n.staff_id = :'sF8' AND n.day BETWEEN (:'today'::date - 15) AND (:'today'::date - 1) AND n.reason = 'holidays_changed'));

-- ── Round 6, finding 9: listing the days is time-boxed ─────────────────────
SELECT t.check('R6-9 listing the days stops at its time box: with none left only today''s days are listed, given time the rest are',
  EXISTS (SELECT 1 FROM public.hr_target_schedule_needs(:'today', 100000, 60000) n WHERE n.reason <> 'live')
  AND NOT EXISTS (SELECT 1 FROM public.hr_target_schedule_needs(:'today', 100000, 0) n WHERE n.reason <> 'live'));

-- ── F6 and the coverage wait: F4's raise, measured from M1 ──────────────────
SET ROLE authenticated;
SELECT t.login(:'H');
SELECT public.fn_hr_salary_revision_propose(:'sF4', 60000, 'Second lab') AS req_f4 \gset
SELECT t.login(:'D');
SELECT public.fn_hr_salary_revision_director_decide(:'req_f4', true) AS f4_yes \gset
RESET ROLE;
SELECT t.login(NULL);
SELECT t.check('F4''s raise is split and waiting for targets, from M1',
  (SELECT state = 'waiting' AND target_role = 'faculty' AND window_start = :'m1'::date AND held_amount > 0
     FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f4'),
  (SELECT state || ' ' || COALESCE(state_reason, '') FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f4'));
SELECT set_config('t.today', :'m1', false);
SET ROLE authenticated;
SELECT t.login(:'H');
SELECT public.fn_hr_salary_revision_apply_due() AS applied \gset
RESET ROLE;
SELECT t.login(NULL);
SELECT monthly_gross AS f4_pay FROM public.hr_staff_salaries WHERE staff_id = :'sF4' AND superseded_by IS NULL \gset
SELECT held_amount AS f4_held FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f4' \gset
SELECT t.spine(:'C4', :'F4', false);
SELECT t.tt(:'sF4', :'A', :'C4', :'m1', (:'m3'::date - 1)) AS tt4 \gset
-- M1: everything done, but the classes from the 20th on were marked by
-- somebody else (F4 was away; the leave is approved only later).
SELECT t.teach(:'tt4', :'F4', :'C4', :'m1', (SELECT array_agg(g) FROM generate_series(1, 19) g), NULL,
               (SELECT array_agg(g) FROM generate_series(20, t.days_in(:'m1')) g), NULL,
               t.all_days(:'m1'), (SELECT array_agg(g) FROM generate_series(1, t.days_in(:'m1'), 2) g), t.all_days(:'m1'));
-- One day of M1 not in the schedule record yet (the job did not reach it).
DELETE FROM public.hr_target_scheduled_periods WHERE staff_id = :'sF4' AND day = (:'m1'::date + 9);
SELECT public.hr_salary_revision_targets_run_on(:'m2') AS w1 \gset
SELECT t.check('a finished month with a day not in the schedule record is not counted yet, and the run note says so',
  NOT EXISTS (SELECT 1 FROM public.hr_salary_revision_target_months
               WHERE request_id = :'req_f4' AND month = :'m1' AND status NOT IN ('in_progress'))
  AND (SELECT run_note LIKE 'Not counted yet, some days not in the schedule record: %'
         FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f4'),
  (SELECT COALESCE(run_note, 'no note') FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f4'));
SELECT t.mirror_staff(:'sF4');
SELECT public.hr_salary_revision_targets_run_on((:'m2'::date + 1)) AS w2 \gset
SELECT t.check('once every day is recorded, the month is counted (missed: 19 of the days marked by them) and the note is gone',
  (SELECT status = 'missed' AND acted FROM public.hr_salary_revision_target_months WHERE request_id = :'req_f4' AND month = :'m1')
  AND (SELECT state = 'waiting' AND run_note IS NULL FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f4'),
  (SELECT status || ' ' || results::text FROM public.hr_salary_revision_target_months WHERE request_id = :'req_f4' AND month = :'m1'));
-- F4's leave for the 20th onwards is approved now, after M1 was counted.
INSERT INTO public.hr_leave_applications (employee_id, start_date, end_date, status)
VALUES (:'sF4', (:'m1'::date + 19), (:'m2'::date - 1), 'approved');
SELECT public.hr_salary_revision_targets_run_on((:'m2'::date + 2)) AS w3 \gset
SELECT t.check('F6 leave approved after the month was counted: measured again, met, the held part released from the next 1st (never backdated)',
  (SELECT status = 'met' AND action = 'released' AND action_effective_from = :'m3'::date
     FROM public.hr_salary_revision_target_months WHERE request_id = :'req_f4' AND month = :'m1')
  AND (SELECT state = 'released' AND held_paid_from = :'m3'::date FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f4')
  AND (SELECT monthly_gross = :'f4_pay'::numeric + :'f4_held'::numeric AND effective_from = :'m3'::date
         FROM public.hr_staff_salaries WHERE staff_id = :'sF4' AND superseded_by IS NULL),
  (SELECT status || ' ' || COALESCE(action, '-') || ' ' || COALESCE(action_effective_from::text, '-')
     FROM public.hr_salary_revision_target_months WHERE request_id = :'req_f4' AND month = :'m1'));
SELECT t.check('F6 a month measured again is not measured a third time while its leave stays the same',
  (SELECT leave_key = public.hr_salary_revision_target_leave_key(:'sF4', date_trunc('week', :'m1'::date)::date, (:'m2'::date - 1))
     FROM public.hr_salary_revision_target_months WHERE request_id = :'req_f4' AND month = :'m1'));

-- ── Round 6, finding 2: months are counted and acted on in calendar order ──
-- F4's held part is paid from M3 (F6). Say two months below target in a row
-- are already counted. M2 is on target, but one of its days is not in the
-- schedule record yet; M3 is missed. Counting M3 first (the old order) paused
-- the part on a third miss and then resumed it when M2 came in (two pay rows,
-- missed_in_row 0). In calendar order nothing moves until M2's day is
-- recorded; then M2 (met) resets the count and M3 makes it 1.
SELECT t.tt(:'sF4', :'A', :'C4', :'m3', (:'m4'::date - 1)) AS tt4b \gset
SELECT t.good_month(:'tt4', :'F4', :'C4', :'m2');
SELECT t.bad_month(:'tt4b', :'F4', :'C4', :'m3');
UPDATE public.hr_salary_revision_target_plans SET missed_in_row = 2 WHERE request_id = :'req_f4';
SELECT count(*) AS f4_pay_rows FROM public.hr_staff_salaries WHERE staff_id = :'sF4' \gset
DELETE FROM public.hr_target_scheduled_periods WHERE staff_id = :'sF4' AND day = (:'m2'::date + 9);
SELECT public.hr_salary_revision_targets_run_on(:'m4') AS o1 \gset
SELECT t.check('R6-2 while M2 waits for a day, M3 after it is not counted: no pause, nothing written, the note says so',
  NOT EXISTS (SELECT 1 FROM public.hr_salary_revision_target_months
               WHERE request_id = :'req_f4' AND month IN (:'m2', :'m3') AND status NOT IN ('in_progress'))
  AND (SELECT state = 'released' AND missed_in_row = 2
              AND run_note LIKE 'Not counted yet, some days not in the schedule record: %. The months after it are counted after it, in calendar order.'
         FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f4')
  AND (SELECT count(*) FROM public.hr_staff_salaries WHERE staff_id = :'sF4') = :'f4_pay_rows'::int,
  (SELECT string_agg(to_char(month, 'YYYY-MM') || ' ' || status || CASE WHEN acted THEN ' acted' ELSE '' END, ', ' ORDER BY month)
     FROM public.hr_salary_revision_target_months WHERE request_id = :'req_f4')
  || ' / ' || (SELECT state || ' ' || missed_in_row FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f4'));
-- A later month counted ahead (as a run before this file could leave it) is not acted on either.
INSERT INTO public.hr_salary_revision_target_months (request_id, month, status, results, measured_at)
VALUES (:'req_f4', :'m3', 'missed', '[]'::jsonb, now())
ON CONFLICT (request_id, month) DO UPDATE SET status = 'missed', acted = false;
SELECT public.hr_salary_revision_targets_run_on((:'m4'::date + 1)) AS o2 \gset
SELECT t.check('R6-2 a later month already counted is not acted on while an earlier one waits (no pause on it)',
  (SELECT NOT acted FROM public.hr_salary_revision_target_months WHERE request_id = :'req_f4' AND month = :'m3')
  AND (SELECT state = 'released' AND missed_in_row = 2 FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f4')
  AND (SELECT count(*) FROM public.hr_staff_salaries WHERE staff_id = :'sF4') = :'f4_pay_rows'::int,
  (SELECT state || ' ' || missed_in_row FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f4'));
SELECT t.mirror_staff(:'sF4');
SELECT public.hr_salary_revision_targets_run_on((:'m4'::date + 2)) AS o3 \gset
SELECT t.check('R6-2 once M2''s day is recorded: M2 met, then M3 missed, in that order: still paid, one miss in a row, no pay row written',
  (SELECT status = 'met' AND acted FROM public.hr_salary_revision_target_months WHERE request_id = :'req_f4' AND month = :'m2')
  AND (SELECT status = 'missed' AND acted FROM public.hr_salary_revision_target_months WHERE request_id = :'req_f4' AND month = :'m3')
  AND (SELECT state = 'released' AND missed_in_row = 1 AND run_note IS NULL
         FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f4')
  AND (SELECT count(*) FROM public.hr_staff_salaries WHERE staff_id = :'sF4') = :'f4_pay_rows'::int,
  (SELECT string_agg(to_char(month, 'YYYY-MM') || ' ' || status || CASE WHEN acted THEN ' acted' ELSE '' END, ', ' ORDER BY month)
     FROM public.hr_salary_revision_target_months WHERE request_id = :'req_f4')
  || ' / ' || (SELECT state || ' ' || missed_in_row FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f4'));

-- ── Round 6, finding 5: leave on the days before the 1st that T5 reads ─────
-- M3's measure reads the days before its 1st in the week holding the 1st
-- (default rr). Leave approved later on such a day changes what M3's T5
-- reads, so the missed M3 is measured again. (Needs M3's 1st not to be a
-- Monday, or there is no such day: the check says so rather than pass.)
-- First a night with no new leave: the run keeps M3's key its own way
-- (the row above was written without one, so it is measured once more now).
SELECT public.hr_salary_revision_targets_run_on((:'m4'::date + 3)) AS o4a \gset
SELECT date_trunc('week', :'m3'::date)::date AS m3_lead,
       (SELECT measured_at FROM public.hr_salary_revision_target_months WHERE request_id = :'req_f4' AND month = :'m3') AS m3_measured \gset
INSERT INTO public.hr_leave_applications (employee_id, start_date, end_date, status)
VALUES (:'sF4', :'m3_lead', :'m3_lead', 'approved');
SELECT public.hr_salary_revision_targets_run_on((:'m4'::date + 4)) AS o4 \gset
SELECT t.check('R6-5 leave approved later on a day before the 1st in the week holding the 1st: the missed month is measured again',
  extract(isodow FROM :'m3'::date) <> 1
  AND (SELECT measured_at > :'m3_measured'::timestamptz
              AND leave_key = public.hr_salary_revision_target_leave_key(:'sF4', :'m3_lead'::date, (:'m4'::date - 1))
         FROM public.hr_salary_revision_target_months WHERE request_id = :'req_f4' AND month = :'m3'),
  CASE WHEN extract(isodow FROM :'m3'::date) = 1 THEN 'INCONCLUSIVE: M3 starts on a Monday this month; run again next month'
       ELSE (SELECT status || ' measured ' || measured_at FROM public.hr_salary_revision_target_months
              WHERE request_id = :'req_f4' AND month = :'m3') END);

-- ── Round 6, finding 1: leave now covering the whole of a missed month ─────
INSERT INTO public.hr_leave_applications (employee_id, start_date, end_date, status)
VALUES (:'sF4', :'m3', (:'m4'::date - 1), 'approved');
SELECT public.hr_salary_revision_targets_run_on((:'m4'::date + 5)) AS o5 \gset
SELECT t.check('R6-1 leave approved later for the whole of a missed month: not counted (no periods left), the misses in a row worked out again',
  (SELECT status = 'not_counted' FROM public.hr_salary_revision_target_months WHERE request_id = :'req_f4' AND month = :'m3')
  AND (SELECT state = 'released' AND missed_in_row = 0 FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f4')
  AND (SELECT count(*) FROM public.hr_staff_salaries WHERE staff_id = :'sF4') = :'f4_pay_rows'::int,
  (SELECT status FROM public.hr_salary_revision_target_months WHERE request_id = :'req_f4' AND month = :'m3')
  || ' / ' || (SELECT state || ' ' || missed_in_row FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f4'));

-- ── Switch-on safety: OFF records nothing about money ───────────────────────
SELECT t.check('measurement stays as the probe set it; the switch row was not touched by 20271008093015',
  (SELECT count(*) = 1 FROM public.platform_policies WHERE policy_key = 'hr.salary_revision.target_measurement_on'));
