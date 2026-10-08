\ir probe-settled-common.sql
-- P1: an earlier COUNTED missed month (M4) goes stale (dept holiday approved after it was counted);
-- the job has not re-recorded those days yet (failed/lagging); later months are acted meanwhile.
UPDATE public.hr_target_scheduled_periods SET resolver = 'probe'
 WHERE staff_id = :'sF4' AND day BETWEEN date_trunc('week', :'m4'::date)::date AND (:'m5'::date - 1);
SELECT t.teach(:'tt', :'F4', :'C4', :'m4',
               (SELECT array_agg(g) FROM generate_series(1, t.days_in(:'m4')) g WHERE g NOT BETWEEN 20 AND 25), NULL, NULL, NULL,
               t.all_days(:'m4'), (SELECT array_agg(g) FROM generate_series(1, t.days_in(:'m4'), 2) g), t.all_days(:'m4'));
SELECT public.hr_salary_revision_targets_run_on(:'m5') AS r1 \gset
SELECT t.info('P1 run m5: ' || t.dump(:'req'));
INSERT INTO public.institution_leaves (institution_id, leave_type_id, leave_name, start_date, end_date, status, requested_by, scope_level, department_ids)
VALUES (:'A', '00000000-0000-0000-0000-0000000001e1', 'Dept closure', (:'m4'::date + 19), (:'m4'::date + 24), 'approved', :'D', 'department', ARRAY[:'DEPT']::uuid[]);
SELECT t.bad_month(:'tt', :'F4', :'C4', :'m5');
SELECT t.bad_month(:'tt', :'F4', :'C4', :'m6');
SELECT count(*) AS pay0 FROM public.hr_staff_salaries WHERE staff_id = :'sF4' \gset
SELECT public.hr_salary_revision_targets_run_on(:'m6') AS r2 \gset
SELECT t.info('P1 run m6 (M4 stale, not re-recorded): ' || t.dump(:'req'));
SELECT t.check('RV3-P1 pre: M4 holiday key changed (rescore wanted) and its 6 days stale (rescore blocked by missing_days = 0)',
  (SELECT holiday_key IS DISTINCT FROM public.hr_salary_revision_target_holiday_key(:'sF4', date_trunc('week', :'m4'::date)::date, (:'m5'::date - 1))
     FROM public.hr_salary_revision_target_months WHERE request_id = :'req' AND month = :'m4')
  AND public.hr_target_schedule_missing_days(:'sF4', date_trunc('week', :'m4'::date)::date, (:'m5'::date - 1)) = 6);
SELECT public.hr_salary_revision_targets_run_on(:'m7') AS r3 \gset
SELECT t.info('P1 run m7 (M4 stale, not re-recorded): ' || t.dump(:'req'));
SELECT bool_and(met) AS m4_fresh FROM (SELECT * FROM public.hr_salary_revision_target_measure(:'sF4', :'m4', :'T')) x \gset
SELECT t.check('RV3-P1 while an earlier counted missed month waits to be measured again on its new holidays, a later month must not pause (calendar order: M4 met, M5+M6 = 2 misses)',
  (SELECT state = 'released' FROM public.hr_salary_revision_target_plans WHERE request_id = :'req')
  AND (SELECT count(*) FROM public.hr_staff_salaries WHERE staff_id = :'sF4') = :'pay0'::int,
  t.dump(:'req'));
-- the job finally reaches M4's stale days
SELECT count(public.hr_target_schedule_record(n.staff_id, n.day, '[]'::jsonb, 'probe', (:'m7'::date + 1), n.holiday_key)) AS rec
  FROM public.hr_target_schedule_needs((:'m7'::date + 1), 100000) n
 WHERE n.staff_id = :'sF4' AND n.reason = 'holidays_changed' AND n.day BETWEEN :'m4' AND (:'m5'::date - 1) \gset
SELECT public.hr_salary_revision_targets_run_on((:'m7'::date + 1)) AS r4 \gset
SELECT t.info('P1 after re-record (' || :'rec' || ' days), run m8+1: ' || t.dump(:'req'));
SELECT t.check('RV3-P1b once re-recorded: M4 met; net effect must be no pause (no pause+resume rows, no month of the held part lost)',
  (SELECT state = 'released' FROM public.hr_salary_revision_target_plans WHERE request_id = :'req')
  AND (SELECT count(*) FROM public.hr_staff_salaries WHERE staff_id = :'sF4') = :'pay0'::int,
  t.dump(:'req'));
-- Round 8 (U1): a counted missed month with a day no longer in the record (here
-- M5's 10th, removed by hand) is not settled either: the months after it wait.
DELETE FROM public.hr_target_scheduled_periods WHERE staff_id = :'sF4' AND day = (:'m5'::date + 9);
SELECT public.hr_salary_revision_targets_run_on(:'m8') AS r5 \gset
SELECT t.info('P1c M5 day 10 gone, run m8: ' || t.dump(:'req'));
SELECT t.check('R8-U1 a counted missed month with a day no longer in the schedule record is not settled: the month after it is not counted (still "so far")',
  (SELECT status = 'in_progress' FROM public.hr_salary_revision_target_months WHERE request_id = :'req' AND month = :'m7')
  AND (SELECT run_note LIKE 'Counted missed, measured again once every day it reads is in the schedule record again: %'
         FROM public.hr_salary_revision_target_plans WHERE request_id = :'req'),
  t.dump(:'req'));
