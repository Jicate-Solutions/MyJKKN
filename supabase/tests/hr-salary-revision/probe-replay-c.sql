-- Review round 12 (8 Oct 2026): the replay stops at the first finished month
-- that is not settled, so it cannot speak for a change already written for a
-- month at or after that stop. A PAUSED part (paused by M5..M7) gets, on one
-- night, a late met M5 (leave approved after it was counted) AND a stale M6
-- (a department holiday approved after its days were recorded). The replay
-- reaches only M5 (met: no pause in it) and, written as it stands, would pay
-- the part again; once M6 is recorded again M6, M7, M8 are three in a row and
-- it would be paused again: a resume and a pause, two pay rows. Nothing is
-- written while M6 waits; then the whole run says paused, and it stays so.
-- Run by run-targets.sh after probe-schedule.sql on the same database (F4's
-- raise), on its own database. Each line prints PASS or FAIL.
\ir probe-settled-common.sql
SELECT (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '9 month')::date AS m9 \gset
DELETE FROM public.hr_salary_revision_target_months WHERE request_id = :'req';
UPDATE public.hr_salary_revision_target_plans
   SET state = 'waiting', window_start = :'m4', window_months = 6, missed_in_row = 0,
       held_paid_from = NULL, paused_from = NULL, last_run_on = NULL
 WHERE request_id = :'req';
-- M4 met; M5: on time days 1-19, someone else days 20+ (leave not yet
-- approved): missed; M6, M7, M8 missed.
SELECT t.good_month(:'tt', :'F4', :'C4', :'m4');
SELECT t.teach(:'tt', :'F4', :'C4', :'m5', (SELECT array_agg(g) FROM generate_series(1, 19) g), NULL,
               (SELECT array_agg(g) FROM generate_series(20, t.days_in(:'m5')) g), NULL,
               t.all_days(:'m5'), (SELECT array_agg(g) FROM generate_series(1, t.days_in(:'m5'), 2) g), t.all_days(:'m5'));
SELECT t.bad_month(:'tt', :'F4', :'C4', :'m6');
SELECT t.bad_month(:'tt', :'F4', :'C4', :'m7');
SELECT t.bad_month(:'tt', :'F4', :'C4', :'m8');
SELECT public.hr_salary_revision_targets_run_on(:'m5') AS c1 \gset
SELECT public.hr_salary_revision_targets_run_on(:'m6') AS c2 \gset
SELECT public.hr_salary_revision_targets_run_on(:'m7') AS c3 \gset
SELECT public.hr_salary_revision_targets_run_on(:'m8') AS c4 \gset
SELECT public.hr_salary_revision_targets_run_on(:'m9') AS c5 \gset
SELECT t.info('R12-H M4 met, M5..M8 missed, run m9: ' || t.dump(:'req'));
SELECT t.check('R12-H setup: released by M4, paused by M5..M7, M8 missed while paused',
  (SELECT state = 'paused' AND paused_from = :'m8'::date FROM public.hr_salary_revision_target_plans WHERE request_id = :'req')
  AND (SELECT action = 'paused' FROM public.hr_salary_revision_target_months WHERE request_id = :'req' AND month = :'m7'),
  t.dump(:'req'));
-- The job recorded M6's days (and its lead-in week) as the resolver gave them then.
UPDATE public.hr_target_scheduled_periods SET resolver = 'probe'
 WHERE staff_id = :'sF4' AND day BETWEEN date_trunc('week', :'m6'::date)::date AND (:'m7'::date - 1);
SELECT count(*) AS pay_h FROM public.hr_staff_salaries WHERE staff_id = :'sF4' \gset
-- The same night: F4's leave for M5 days 20+ is approved (M5 turns met) and a
-- department closure on M6's 10th-12th (M6's days stale).
INSERT INTO public.hr_leave_applications (employee_id, start_date, end_date, status)
VALUES (:'sF4', (:'m5'::date + 19), (:'m6'::date - 1), 'approved');
INSERT INTO public.institution_leaves (institution_id, leave_type_id, leave_name, start_date, end_date, status, requested_by,
                                      scope_level, department_ids)
VALUES (:'A', '00000000-0000-0000-0000-0000000001e1', 'Dept closure R12', (:'m6'::date + 9), (:'m6'::date + 11), 'approved', :'D',
        'department', ARRAY[:'DEPT']::uuid[]);
SELECT public.hr_salary_revision_targets_run_on((:'m9'::date + 1)) AS c6 \gset
SELECT t.info('R12-H M5 met, M6 stale, run m9+1: ' || t.dump(:'req'));
SELECT t.check('R12-H a late met month while a later month of the pausing run waits to be measured again: nothing is written (no resume ahead of it)',
  (SELECT status = 'met' FROM public.hr_salary_revision_target_months WHERE request_id = :'req' AND month = :'m5')
  AND (SELECT state = 'paused' FROM public.hr_salary_revision_target_plans WHERE request_id = :'req')
  AND (SELECT count(*) FROM public.hr_staff_salaries WHERE staff_id = :'sF4') = :'pay_h'::int,
  t.dump(:'req'));
-- The job records M6's stale days again, with the key the listing gave (the
-- resolver gives no class on the closure days).
SELECT count(public.hr_target_schedule_record(n.staff_id, n.day, '[]'::jsonb, 'probe', (:'m9'::date + 1), n.holiday_key)) AS hrec
  FROM public.hr_target_schedule_needs((:'m9'::date + 1), 100000) n
 WHERE n.staff_id = :'sF4' AND n.reason = 'holidays_changed' AND n.day BETWEEN :'m6' AND (:'m7'::date - 1) \gset
SELECT public.hr_salary_revision_targets_run_on((:'m9'::date + 2)) AS c7 \gset
SELECT t.info('R12-H M6 recorded again, run m9+2: ' || t.dump(:'req'));
SELECT t.check('R12-H once M6 is measured again (missed): M6, M7, M8 are three in a row after the met M5: still paused, no pay row written',
  :'hrec'::int = 3
  AND (SELECT status = 'missed' FROM public.hr_salary_revision_target_months WHERE request_id = :'req' AND month = :'m6')
  AND (SELECT state = 'paused' AND missed_in_row = 0 FROM public.hr_salary_revision_target_plans WHERE request_id = :'req')
  AND (SELECT count(*) FROM public.hr_staff_salaries WHERE staff_id = :'sF4') = :'pay_h'::int,
  :'hrec' || ' recorded; ' || t.dump(:'req'));
