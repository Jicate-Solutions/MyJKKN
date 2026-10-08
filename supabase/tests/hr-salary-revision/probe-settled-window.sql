\ir probe-settled-common.sql
-- P4: WAITING part, window M4..M5. M4 counted missed, then a dept holiday for M4 20-25 approved;
-- the job has not re-recorded those days when the window closes.
DELETE FROM public.hr_salary_revision_target_months WHERE request_id = :'req';
UPDATE public.hr_salary_revision_target_plans SET state = 'waiting', window_start = :'m4', window_months = 2, missed_in_row = 0 WHERE request_id = :'req';
UPDATE public.hr_target_scheduled_periods SET resolver = 'probe'
 WHERE staff_id = :'sF4' AND day BETWEEN date_trunc('week', :'m4'::date)::date AND (:'m5'::date - 1);
SELECT t.teach(:'tt', :'F4', :'C4', :'m4',
               (SELECT array_agg(g) FROM generate_series(1, t.days_in(:'m4')) g WHERE g NOT BETWEEN 20 AND 25), NULL, NULL, NULL,
               t.all_days(:'m4'), (SELECT array_agg(g) FROM generate_series(1, t.days_in(:'m4'), 2) g), t.all_days(:'m4'));
SELECT public.hr_salary_revision_targets_run_on(:'m5') AS r1 \gset
SELECT t.info('P4 run m5: ' || t.dump(:'req'));
INSERT INTO public.institution_leaves (institution_id, leave_type_id, leave_name, start_date, end_date, status, requested_by, scope_level, department_ids)
VALUES (:'A', '00000000-0000-0000-0000-0000000001e1', 'Dept closure', (:'m4'::date + 19), (:'m4'::date + 24), 'approved', :'D', 'department', ARRAY[:'DEPT']::uuid[]);
SELECT t.bad_month(:'tt', :'F4', :'C4', :'m5');
SELECT public.hr_salary_revision_targets_run_on(:'m6') AS r2 \gset
SELECT t.info('P4 run m6 (window over, M4 stale): ' || t.dump(:'req'));
SELECT bool_and(met) AS m4_fresh FROM public.hr_salary_revision_target_measure(:'sF4', :'m4', :'T') \gset
SELECT t.check('RV3-P4 the window must not go back to the Director while a missed month in it waits to be measured again (re-recorded it would release)',
  (SELECT state = 'waiting' FROM public.hr_salary_revision_target_plans WHERE request_id = :'req'), t.dump(:'req'));
SELECT count(public.hr_target_schedule_record(n.staff_id, n.day, '[]'::jsonb, 'probe', (:'m6'::date + 1), n.holiday_key)) AS rec
  FROM public.hr_target_schedule_needs((:'m6'::date + 1), 100000) n WHERE n.staff_id = :'sF4' AND n.reason = 'holidays_changed' \gset
SELECT public.hr_salary_revision_targets_run_on((:'m6'::date + 1)) AS r3 \gset
SELECT t.info('P4 re-recorded (' || :'rec' || '), run m6+1: ' || t.dump(:'req'));
-- Round 8 (U1): while it waits the plan stays in the schedule ranges, so the
-- stale days were asked for again above; once recorded again, M4 is met on
-- what was scheduled and releases the held part from the next 1st.
SELECT t.check('RV3-P4b the waiting plan stays in the schedule ranges: its stale days are asked for again, and once recorded again M4 is met and releases the held part from the next 1st (never backdated)',
  :'rec'::int = 6
  AND (SELECT state = 'released' FROM public.hr_salary_revision_target_plans WHERE request_id = :'req')
  AND (SELECT status = 'met' AND action = 'released' AND action_effective_from = (:'m6'::date + interval '1 month')::date
         FROM public.hr_salary_revision_target_months WHERE request_id = :'req' AND month = :'m4'),
  t.dump(:'req'));
