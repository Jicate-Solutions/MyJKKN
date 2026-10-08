-- Raise targets, review round 7 (8 Oct 2026; from the money review's probe
-- rv-order.sql): months are counted and acted on in calendar order, with a
-- flagged month (B3) and a late met month (B4). Run by run-targets.sh after
-- probe-schedule.sql on the same database: F4's raise is 'released'
-- (missed_in_row 0), M1..M3 counted. Each check states the calendar-order
-- outcome. Each line prints PASS or FAIL.
\set ON_ERROR_STOP 0
\set F4   '00000000-0000-0000-0000-000000010014'
\set sF4  '00000000-0000-0000-0000-000000020014'
\set A    '00000000-0000-0000-0000-0000000000a1'
\set C4   '00000000-0000-0000-0000-0000000c0004'
SELECT set_config('t.today', '', false);
SELECT t.login(NULL);
SELECT (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '4 month')::date AS m4,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '5 month')::date AS m5,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '6 month')::date AS m6,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '7 month')::date AS m7,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '8 month')::date AS m8,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '9 month')::date AS m9,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '10 month')::date AS m10,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '11 month')::date AS m11,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '12 month')::date AS m12 \gset
SELECT request_id AS req FROM public.hr_salary_revision_target_plans WHERE staff_id = :'sF4' \gset
CREATE OR REPLACE FUNCTION t.info(p text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN RAISE NOTICE 'INFO %', p; END $$;
CREATE OR REPLACE FUNCTION t.dump(p_req uuid) RETURNS text LANGUAGE sql AS $$
  SELECT (SELECT state || ' mir=' || missed_in_row FROM public.hr_salary_revision_target_plans WHERE request_id = p_req)
      || ' | ' || (SELECT string_agg(to_char(month, 'YYYY-MM') || ':' || status || CASE WHEN acted THEN '/' || COALESCE(action, '-') ELSE '/unacted' END, ' ' ORDER BY month)
                     FROM public.hr_salary_revision_target_months WHERE request_id = p_req)
      || ' | pay rows ' || (SELECT count(*) FROM public.hr_staff_salaries s JOIN public.hr_salary_revision_target_plans p ON p.staff_id = s.staff_id WHERE p.request_id = p_req)
$$;
SELECT t.info('start: ' || t.dump(:'req'));
SELECT t.tt(:'sF4', :'A', :'C4', :'m4', (:'m12'::date - 1)) AS tt \gset
-- M4: on time days 1-19, someone else days 20+ (F4 away, leave not yet approved). Other targets done.
SELECT t.teach(:'tt', :'F4', :'C4', :'m4', (SELECT array_agg(g) FROM generate_series(1, 19) g), NULL,
               (SELECT array_agg(g) FROM generate_series(20, t.days_in(:'m4')) g), NULL,
               t.all_days(:'m4'), (SELECT array_agg(g) FROM generate_series(1, t.days_in(:'m4'), 2) g), t.all_days(:'m4'));
SELECT t.bad_month(:'tt', :'F4', :'C4', :'m5');
SELECT t.bad_month(:'tt', :'F4', :'C4', :'m6');
SELECT public.hr_salary_revision_targets_run_on(:'m7') AS r1 \gset
SELECT t.info('after run on M7 (M4, M5, M6 missed): ' || t.dump(:'req'));
SELECT t.check('B4 setup: three misses in a row paused it',
  (SELECT state = 'paused' FROM public.hr_salary_revision_target_plans WHERE request_id = :'req'), t.dump(:'req'));

-- S3: leave approved later for the WHOLE of M6 (the month that paused it).
SELECT count(*) AS pay_s3 FROM public.hr_staff_salaries WHERE staff_id = :'sF4' \gset
INSERT INTO public.hr_leave_applications (employee_id, start_date, end_date, status)
VALUES (:'sF4', :'m6', (:'m7'::date - 1), 'approved');
SELECT public.hr_salary_revision_targets_run_on((:'m7'::date + 1)) AS r2 \gset
SELECT t.info('after leave over all of M6, run M7+1: ' || t.dump(:'req'));
-- DIRECTOR RULING (b), 8 Oct 2026 (was the open question of round 7): a part
-- PAUSED by a month that later becomes not counted stays paused until a month
-- on target: nothing is backdated or paid by itself.
SELECT t.check('B4-S3 DIRECTOR RULING (b): the month that paused it is now not counted, and the part stays paused until a month on target (no backdating)',
  (SELECT status = 'not_counted' FROM public.hr_salary_revision_target_months WHERE request_id = :'req' AND month = :'m6')
  AND (SELECT state = 'paused' FROM public.hr_salary_revision_target_plans WHERE request_id = :'req')
  AND (SELECT count(*) FROM public.hr_staff_salaries WHERE staff_id = :'sF4') = :'pay_s3'::int,
  t.dump(:'req'));

-- S4: leave approved later for M4 days 20+: M4 becomes met, acted AFTER M5 and M6 were.
INSERT INTO public.hr_leave_applications (employee_id, start_date, end_date, status)
VALUES (:'sF4', (:'m4'::date + 19), (:'m5'::date - 1), 'approved');
SELECT public.hr_salary_revision_targets_run_on((:'m7'::date + 2)) AS r3 \gset
SELECT t.info('after leave M4 20+, run M7+2: ' || t.dump(:'req'));
SELECT t.check('B4-S4 after M4 turns met, the misses since the last met month (M5; M6 not counted) are counted: missed_in_row = 1, not 0',
  (SELECT missed_in_row = 1 FROM public.hr_salary_revision_target_plans WHERE request_id = :'req'), t.dump(:'req'));
SELECT t.bad_month(:'tt', :'F4', :'C4', :'m7');
SELECT t.bad_month(:'tt', :'F4', :'C4', :'m8');
SELECT public.hr_salary_revision_targets_run_on(:'m9') AS r4 \gset
SELECT t.info('after M7, M8 missed, run M9: ' || t.dump(:'req'));
SELECT t.check('B4-S4 M5, M7, M8 missed since the last met month (M4): three in a row, the part is paused',
  (SELECT state = 'paused' FROM public.hr_salary_revision_target_plans WHERE request_id = :'req'), t.dump(:'req'));

-- S1: a flagged month is not decided before the next month is counted.
-- Put the plan back to a clean 'released' with two misses in a row (as if).
UPDATE public.hr_salary_revision_target_plans SET state = 'released', missed_in_row = 2, paused_from = NULL WHERE request_id = :'req';
INSERT INTO public.hr_salary_revision_target_months (request_id, month, status) VALUES (:'req', :'m9', 'flagged')
ON CONFLICT (request_id, month) DO UPDATE SET status = 'flagged';
SELECT t.good_month(:'tt', :'F4', :'C4', :'m9');
SELECT t.bad_month(:'tt', :'F4', :'C4', :'m10');
SELECT count(*) AS pay_before FROM public.hr_staff_salaries WHERE staff_id = :'sF4' \gset
SELECT public.hr_salary_revision_targets_run_on(:'m11') AS r5 \gset
SELECT t.info('M9 flagged (undecided), M10 missed, run M11: ' || t.dump(:'req'));
SELECT t.check('B3-S1 while flagged M9 is undecided, M10 after it is not counted or acted on (no pause ahead of M9), and the note says so',
  (SELECT state = 'released' AND run_note LIKE 'Flagged, waiting for the Director''s decision: %. The months after it are counted after it, in calendar order.'
     FROM public.hr_salary_revision_target_plans WHERE request_id = :'req')
  AND NOT EXISTS (SELECT 1 FROM public.hr_salary_revision_target_months WHERE request_id = :'req' AND month = :'m10' AND status <> 'in_progress')
  AND (SELECT count(*) FROM public.hr_staff_salaries WHERE staff_id = :'sF4') = :'pay_before'::int, t.dump(:'req'));
UPDATE public.hr_salary_revision_target_months SET status = 'decided_met' WHERE request_id = :'req' AND month = :'m9';
SELECT public.hr_salary_revision_targets_run_on((:'m11'::date + 1)) AS r6 \gset
SELECT t.info('Director decides M9 met, run M11+1: ' || t.dump(:'req'));
SELECT t.check('B3-S1 in calendar order: M9 met resets, M10 is 1 miss: still paid, no pay rows written (no pause-then-resume)',
  (SELECT state = 'released' AND missed_in_row = 1 FROM public.hr_salary_revision_target_plans WHERE request_id = :'req')
  AND (SELECT count(*) FROM public.hr_staff_salaries WHERE staff_id = :'sF4') = :'pay_before'::int, t.dump(:'req'));
