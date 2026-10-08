-- Raise targets: the Director's rulings of 8 Oct 2026 (05:30, first-hand)
-- that had no probe of their own. Run by run-targets.sh after probe-schedule.sql
-- on the same database (F4's raise released, M3 not counted on leave over the
-- whole month). Each line prints PASS or FAIL.
--   (a) lower bound: once paid, the run reads only the CURRENT run of misses
--       (from the month after the last met month acted on), so a missed month
--       before that met month never holds the run, even when its days go stale.
--   (e) a combined class at the same hour in two timetables counts once.
--   (g) not_counted is final, even if the leave behind it is later cancelled.
--   (i) a wrongly made timetable still counts until HR deletes or end-dates it.
\set ON_ERROR_STOP 0
\set D    '00000000-0000-0000-0000-000000010001'
\set F4   '00000000-0000-0000-0000-000000010014'
\set F9   '00000000-0000-0000-0000-000000010020'
\set sF4  '00000000-0000-0000-0000-000000020014'
\set sF9  '00000000-0000-0000-0000-000000020020'
\set A    '00000000-0000-0000-0000-0000000000a1'
\set DEPT '00000000-0000-0000-0000-00000000d0a1'
\set C4   '00000000-0000-0000-0000-0000000c0004'
\set C9   '00000000-0000-0000-0000-0000000c0009'
\set T '{"t1_marked_by_self_min_pct": 85, "t1_mark_within_hours": 24, "t3_linked_min_pct": 60, "t4_resource_min_pct": 25, "t5_min_pulses_per_week": 1}'
SELECT set_config('t.today', '', false);
SELECT t.login(NULL);
SELECT (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '2 month')::date AS m2,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '3 month')::date AS m3,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '4 month')::date AS m4,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '5 month')::date AS m5,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '6 month')::date AS m6,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '7 month')::date AS m7,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '8 month')::date AS m8,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '12 month')::date AS m12 \gset
SELECT request_id AS req FROM public.hr_salary_revision_target_plans WHERE staff_id = :'sF4' \gset
CREATE OR REPLACE FUNCTION t.info(p text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN RAISE NOTICE 'INFO %', p; END $$;
CREATE OR REPLACE FUNCTION t.dump(p_req uuid) RETURNS text LANGUAGE sql AS $$
  SELECT (SELECT state || ' mir=' || missed_in_row || COALESCE(' note=' || left(run_note, 60), '') FROM public.hr_salary_revision_target_plans WHERE request_id = p_req)
      || ' | ' || (SELECT string_agg(to_char(month, 'YYYY-MM') || ':' || status || CASE WHEN acted THEN '/' || COALESCE(action, '-') ELSE '/unacted' END, ' ' ORDER BY month)
                     FROM public.hr_salary_revision_target_months WHERE request_id = p_req)
      || ' | pay rows ' || (SELECT count(*) FROM public.hr_staff_salaries s JOIN public.hr_salary_revision_target_plans p ON p.staff_id = s.staff_id WHERE p.request_id = p_req)
$$;
SELECT t.info('start: ' || t.dump(:'req'));
SELECT count(*) AS pay0 FROM public.hr_staff_salaries WHERE staff_id = :'sF4' \gset

-- ── (g) not_counted is final, even if the leave is later cancelled ─────────
-- probe-schedule.sql (R6-1) left M3 not counted: leave approved later over the
-- whole month. That leave is now cancelled.
SELECT measured_at AS m3_at FROM public.hr_salary_revision_target_months WHERE request_id = :'req' AND month = :'m3' \gset
UPDATE public.hr_leave_applications SET status = 'cancelled'
 WHERE employee_id = :'sF4' AND start_date = :'m3'::date AND end_date = (:'m4'::date - 1) AND status = 'approved';
SELECT public.hr_salary_revision_targets_run_on((:'m4'::date + 6)) AS g1 \gset
SELECT t.check('(g) a month not counted (leave over all of it) stays not counted when that leave is later cancelled: not measured again, nothing moves',
  (SELECT status = 'not_counted' AND measured_at = :'m3_at'::timestamptz
     FROM public.hr_salary_revision_target_months WHERE request_id = :'req' AND month = :'m3')
  AND (SELECT state = 'released' AND missed_in_row = 0 FROM public.hr_salary_revision_target_plans WHERE request_id = :'req')
  AND (SELECT count(*) FROM public.hr_staff_salaries WHERE staff_id = :'sF4') = :'pay0'::int,
  t.dump(:'req'));

-- ── (a) lower bound: a missed month before the last met month is left alone ─
-- M4 missed, M5 met, M6 missed, counted in order (one miss in a row). Then a
-- department holiday is approved over M4 20-25 and M4's recorded days go stale
-- (they are the job's, not the rehearsal mirror's, so nothing records them
-- again). The run of misses is M6 on: M4 is never looked at again, so M7 is
-- counted (two in a row) and nothing waits on M4.
SELECT t.tt(:'sF4', :'A', :'C4', :'m4', (:'m12'::date - 1)) AS tt \gset
UPDATE public.timetables SET department_id = :'DEPT' WHERE id = :'tt';
UPDATE public.hr_target_scheduled_periods SET resolver = 'probe'
 WHERE staff_id = :'sF4' AND day BETWEEN date_trunc('week', :'m4'::date)::date AND (:'m5'::date - 1);
SELECT t.bad_month(:'tt', :'F4', :'C4', :'m4');
SELECT t.good_month(:'tt', :'F4', :'C4', :'m5');
SELECT t.bad_month(:'tt', :'F4', :'C4', :'m6');
SELECT t.bad_month(:'tt', :'F4', :'C4', :'m7');
SELECT public.hr_salary_revision_targets_run_on(:'m5') AS a1 \gset
SELECT public.hr_salary_revision_targets_run_on(:'m6') AS a2 \gset
SELECT public.hr_salary_revision_targets_run_on(:'m7') AS a3 \gset
SELECT t.info('(a) run m7: ' || t.dump(:'req'));
SELECT t.check('(a) setup: M4 missed, M5 met, M6 missed, counted in calendar order: one miss in a row, still paid',
  (SELECT status = 'missed' AND acted FROM public.hr_salary_revision_target_months WHERE request_id = :'req' AND month = :'m4')
  AND (SELECT status = 'met' AND acted FROM public.hr_salary_revision_target_months WHERE request_id = :'req' AND month = :'m5')
  AND (SELECT status = 'missed' AND acted FROM public.hr_salary_revision_target_months WHERE request_id = :'req' AND month = :'m6')
  AND (SELECT state = 'released' AND missed_in_row = 1 FROM public.hr_salary_revision_target_plans WHERE request_id = :'req'),
  t.dump(:'req'));
INSERT INTO public.institution_leaves (institution_id, leave_type_id, leave_name, start_date, end_date, status, requested_by, scope_level, department_ids)
VALUES (:'A', '00000000-0000-0000-0000-0000000001e1', 'Dept closure', (:'m4'::date + 19), (:'m4'::date + 24), 'approved', :'D', 'department', ARRAY[:'DEPT']::uuid[]);
SELECT public.hr_target_schedule_missing_days(:'sF4', date_trunc('week', :'m4'::date)::date, (:'m5'::date - 1)) AS m4_stale \gset
SELECT public.hr_salary_revision_targets_run_on(:'m8') AS a4 \gset
SELECT t.info('(a) M4 stale days ' || :'m4_stale' || '; run m8: ' || t.dump(:'req'));
SELECT t.check('(a) a missed month BEFORE the last met month is never looked at again: its days going stale holds nothing (M7 counted, two misses in a row, no waiting note)',
  :'m4_stale'::int > 0
  AND (SELECT status = 'missed' AND acted FROM public.hr_salary_revision_target_months WHERE request_id = :'req' AND month = :'m7')
  AND (SELECT state = 'released' AND missed_in_row = 2 AND run_note IS NULL FROM public.hr_salary_revision_target_plans WHERE request_id = :'req')
  AND (SELECT count(*) FROM public.hr_staff_salaries WHERE staff_id = :'sF4') = :'pay0'::int,
  t.dump(:'req'));
SELECT t.check('(a) the nightly listing starts at the run of misses too: M4''s stale days are not asked for',
  NOT EXISTS (SELECT 1 FROM public.hr_target_schedule_needs((:'m8'::date + 1), 100000) n
               WHERE n.staff_id = :'sF4' AND n.day BETWEEN :'m4' AND (:'m5'::date - 1))
  AND (SELECT from_day = date_trunc('week', :'m6'::date)::date FROM public.hr_target_schedule_ranges((:'m8'::date + 1)) WHERE staff_id = :'sF4'),
  (SELECT from_day::text FROM public.hr_target_schedule_ranges((:'m8'::date + 1)) WHERE staff_id = :'sF4'));

-- ── (e) a combined class at the same hour in two timetables counts once ────
-- F9 teaches one combined class listed in two section timetables at 09:00,
-- named differently ('Period 1' and 'Hour 1'), every day of M2; F9 marked
-- both on the 1st, on time.
INSERT INTO public.timetables (id, institution_id, timetable_name, start_date, end_date, created_at)
VALUES ('00000000-0000-0000-0000-0000000ae001', :'A', 'Section A', :'m2', (:'m3'::date - 1), now() - interval '1 year'),
       ('00000000-0000-0000-0000-0000000ae002', :'A', 'Section B', :'m2', (:'m3'::date - 1), now() - interval '6 months');
SELECT count(public.hr_target_schedule_record(:'sF9', d::date,
         jsonb_build_array(
           jsonb_build_object('timetable_id', '00000000-0000-0000-0000-0000000ae001', 'slot_id', 'a1', 'period_name', 'Period 1',
                              'course_id', :'C9', 'start_time', '09:00', 'end_time', '10:00', 'is_primary', true),
           jsonb_build_object('timetable_id', '00000000-0000-0000-0000-0000000ae002', 'slot_id', 'b1', 'period_name', 'Hour 1',
                              'course_id', :'C9', 'start_time', '09:00', 'end_time', '10:00', 'is_primary', true)),
         'probe', d::date))
  FROM generate_series(:'m2'::date, (:'m3'::date - 1), interval '1 day') d \gset
INSERT INTO public.attendance_first_marks (timetable_id, attendance_date, period_name, ordinal, marker_profile_id, first_marked_at)
VALUES ('00000000-0000-0000-0000-0000000ae001', :'m2', 'Period 1', 1, :'F9', (:'m2'::date + time '09:30') AT TIME ZONE 'Asia/Kolkata'),
       ('00000000-0000-0000-0000-0000000ae002', :'m2', 'Hour 1', 1, :'F9', (:'m2'::date + time '09:31') AT TIME ZONE 'Asia/Kolkata');
CREATE TEMP TABLE re AS SELECT * FROM public.hr_salary_revision_target_measure(:'sF9', :'m2', :'T');
SELECT t.check('(e) a combined class listed at the same hour in two section timetables counts once a day (and once marked)',
  (SELECT denominator = t.days_in(:'m2') AND numerator = 1 FROM re WHERE target = 't1'),
  (SELECT numerator || '/' || denominator || ' expected 1/' || t.days_in(:'m2') FROM re WHERE target = 't1'));

-- ── (i) a wrongly made timetable counts until HR deletes or end-dates it ──
-- A timetable made by mistake gives F9 a 14:00 class every day of M3.
INSERT INTO public.timetables (id, institution_id, timetable_name, start_date, end_date, created_at)
VALUES ('00000000-0000-0000-0000-0000000ae101', :'A', 'Made by mistake', :'m3', (:'m4'::date - 1), now() - interval '1 year');
SELECT count(public.hr_target_schedule_record(:'sF9', d::date,
         jsonb_build_array(jsonb_build_object('timetable_id', '00000000-0000-0000-0000-0000000ae101', 'slot_id', 'w1',
                             'period_name', 'Period 5', 'course_id', :'C9', 'start_time', '14:00', 'end_time', '15:00', 'is_primary', true)),
         'probe', d::date))
  FROM generate_series(:'m3'::date, (:'m4'::date - 1), interval '1 day') d \gset
UPDATE public.timetables SET is_active = false WHERE id = '00000000-0000-0000-0000-0000000ae101';
SELECT t.check('(i) a wrongly made timetable switched off still counts for the days it gave (until HR deletes or end-dates it)',
  (SELECT denominator = t.days_in(:'m3') FROM public.hr_salary_revision_target_measure(:'sF9', :'m3', :'T') WHERE target = 't1'),
  (SELECT denominator::text FROM public.hr_salary_revision_target_measure(:'sF9', :'m3', :'T') WHERE target = 't1'));
-- End-dated to the 10th: the days after it are no longer given to F9 (the
-- resolver reads a timetable by its dates; recorded again here as it would).
UPDATE public.timetables SET end_date = (:'m3'::date + 9) WHERE id = '00000000-0000-0000-0000-0000000ae101';
SELECT count(public.hr_target_schedule_record(:'sF9', d::date, '[]'::jsonb, 'probe', d::date))
  FROM generate_series((:'m3'::date + 10), (:'m4'::date - 1), interval '1 day') d \gset
SELECT t.check('(i) end-dated: only the days up to its end date count',
  (SELECT denominator = 10 FROM public.hr_salary_revision_target_measure(:'sF9', :'m3', :'T') WHERE target = 't1'),
  (SELECT denominator::text FROM public.hr_salary_revision_target_measure(:'sF9', :'m3', :'T') WHERE target = 't1'));
DELETE FROM public.timetables WHERE id = '00000000-0000-0000-0000-0000000ae101';
SELECT t.check('(i) deleted by HR: none of its periods count any more, even on days already recorded',
  (SELECT denominator = 0 FROM public.hr_salary_revision_target_measure(:'sF9', :'m3', :'T') WHERE target = 't1'),
  (SELECT denominator::text FROM public.hr_salary_revision_target_measure(:'sF9', :'m3', :'T') WHERE target = 't1'));
