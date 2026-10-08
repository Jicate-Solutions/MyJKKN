-- Director ruling (a), 8 Oct 2026 (option A): the reviewer's RV6-B (round 6
-- of the money review), with the check set to the outcome the ruling gives.
-- Default aa's closing ("an older month left so far is closed as not
-- counted") must never force-settle a month the stop is HOLDING (waiting for
-- a day). Released part, pause after 3. M4 missed (one in a row). M5 on target
-- but one day (the 10th) never recorded (the resolver failing). M6, M7
-- missed, M8 met. Runs m6, m7, m8: M5 waits, everything after it waits. Run
-- m9: before the ruling the run looked back only 3 months (M6 on), closed M5
-- as not counted, counted M6, M7: M4 + M6 + M7 = 3 -> PAUSE. Under the ruling
-- M5 is in the run of misses (after the last met month), so it keeps waiting:
-- no pause. Once its day is recorded M5 met resets; M6, M7 = 2; M8 met: never
-- paused.
\ir probe-settled-common.sql
SELECT (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '9 month')::date AS m9 \gset
DELETE FROM public.hr_salary_revision_target_months WHERE request_id = :'req';
UPDATE public.hr_salary_revision_target_plans SET state = 'released', window_start = LEAST(window_start, :'m4'::date), missed_in_row = 0, last_run_on = NULL WHERE request_id = :'req';
SELECT t.bad_month(:'tt', :'F4', :'C4', :'m4');
SELECT t.good_month(:'tt', :'F4', :'C4', :'m5');
SELECT t.bad_month(:'tt', :'F4', :'C4', :'m6');
SELECT t.bad_month(:'tt', :'F4', :'C4', :'m7');
SELECT t.good_month(:'tt', :'F4', :'C4', :'m8');
DELETE FROM public.hr_target_scheduled_periods WHERE staff_id = :'sF4' AND day = (:'m5'::date + 9);
SELECT public.hr_salary_revision_targets_run_on(:'m5') AS r1 \gset
SELECT public.hr_salary_revision_targets_run_on(:'m6') AS r2 \gset
SELECT public.hr_salary_revision_targets_run_on(:'m7') AS r3 \gset
SELECT public.hr_salary_revision_targets_run_on(:'m8') AS r4 \gset
SELECT t.info('RV6-B run m8 (M5 waits for its 10th): ' || t.dump(:'req'));
SELECT count(*) AS pay0 FROM public.hr_staff_salaries WHERE staff_id = :'sF4' \gset
SELECT public.hr_salary_revision_targets_run_on(:'m9') AS r5 \gset
SELECT t.info('RV6-B run m9: ' || t.dump(:'req'));
SELECT t.check('RV6-B a month the stop holds (waiting for a day) is not closed as not counted and overtaken when it is more than 3 months old: no pause',
  (SELECT state = 'released' FROM public.hr_salary_revision_target_plans WHERE request_id = :'req')
  AND (SELECT status = 'in_progress' FROM public.hr_salary_revision_target_months WHERE request_id = :'req' AND month = :'m5')
  AND (SELECT count(*) FROM public.hr_staff_salaries WHERE staff_id = :'sF4') = :'pay0'::int,
  t.dump(:'req'));
SELECT count(*) AS m5_listed FROM public.hr_target_schedule_needs((:'m9'::date + 1), 100000) n
 WHERE n.staff_id = :'sF4' AND n.day = (:'m5'::date + 9) \gset
SELECT t.mirror_staff(:'sF4');
SELECT public.hr_salary_revision_targets_run_on((:'m9'::date + 1)) AS r6 \gset
SELECT t.info('RV6-B M5 10th listed=' || :'m5_listed' || '; recorded, run m9+1: ' || t.dump(:'req'));
SELECT t.check('RV6-B2 the held day is asked for, and once recorded the months count in calendar order: M5 met resets, M6, M7 = 2, M8 met: still paid, no pay row written',
  :'m5_listed'::int = 1
  AND (SELECT status = 'met' FROM public.hr_salary_revision_target_months WHERE request_id = :'req' AND month = :'m5')
  AND (SELECT status = 'met' AND acted FROM public.hr_salary_revision_target_months WHERE request_id = :'req' AND month = :'m8')
  AND (SELECT state = 'released' AND missed_in_row = 0 FROM public.hr_salary_revision_target_plans WHERE request_id = :'req')
  AND (SELECT count(*) FROM public.hr_staff_salaries WHERE staff_id = :'sF4') = :'pay0'::int,
  t.dump(:'req'));
