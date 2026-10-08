-- Director ruling (a), 8 Oct 2026 (option A): the reviewer's RV6-A (round 6
-- of the money review), with the checks set to the outcome the ruling gives.
-- Released part, pause after 3. M4 counted missed (one in a row). An OFF night
-- in M5 (M5 not measured: neither adds nor resets, skipped over). M6 missed
-- (two in a row). A department holiday for M4 20-25 is approved after the M7
-- run. Run on M8: before the ruling the run looked back only 3 months (M5 on),
-- never at M4, counted M7 missed and paused (3 in a row). Measured on its
-- current holidays M4 is met, so the misses in a row are only M6, M7: no pause
-- is due. Under the ruling the run reaches back to the first month of the run
-- of misses (M4), waits for M4's stale days, and the nightly listing asks for
-- them; once recorded again M4 is met and M6, M7 are two in a row: still paid.
\ir probe-settled-common.sql
SELECT t.info('RV6-A pause rule = ' || (SELECT rules->>'pause_after_missed_months' FROM public.hr_salary_revision_target_plans WHERE request_id = :'req'));
DELETE FROM public.hr_salary_revision_target_months WHERE request_id = :'req';
UPDATE public.hr_salary_revision_target_plans SET state = 'released', window_start = LEAST(window_start, :'m4'::date), missed_in_row = 0, last_run_on = NULL WHERE request_id = :'req';
UPDATE public.hr_target_scheduled_periods SET resolver = 'probe'
 WHERE staff_id = :'sF4' AND day BETWEEN date_trunc('week', :'m4'::date)::date AND (:'m5'::date - 1);
SELECT t.teach(:'tt', :'F4', :'C4', :'m4',
               (SELECT array_agg(g) FROM generate_series(1, t.days_in(:'m4')) g WHERE g NOT BETWEEN 20 AND 25), NULL, NULL, NULL,
               t.all_days(:'m4'), (SELECT array_agg(g) FROM generate_series(1, t.days_in(:'m4'), 2) g), t.all_days(:'m4'));
SELECT t.bad_month(:'tt', :'F4', :'C4', :'m6');
SELECT t.bad_month(:'tt', :'F4', :'C4', :'m7');
SELECT public.hr_salary_revision_targets_run_on(:'m5') AS r1 \gset
SELECT t.info('RV6-A run m5: ' || t.dump(:'req'));
UPDATE public.platform_policies SET value = 'false'::jsonb WHERE policy_key = 'hr.salary_revision.target_measurement_on';
SELECT public.hr_salary_revision_targets_run_on((:'m5'::date + 3)) AS o1 \gset
UPDATE public.platform_policies SET value = 'true'::jsonb WHERE policy_key = 'hr.salary_revision.target_measurement_on';
SELECT t.info('RV6-A run m5+3 (OFF): ' || t.dump(:'req'));
SELECT public.hr_salary_revision_targets_run_on(:'m6') AS r2 \gset
SELECT public.hr_salary_revision_targets_run_on(:'m7') AS r3 \gset
SELECT t.info('RV6-A run m7: ' || t.dump(:'req'));
SELECT t.check('RV6-A setup: M4 and M6 counted missed (two in a row; M5 not measured, skipped over), still paid',
  (SELECT state = 'released' AND missed_in_row = 2 FROM public.hr_salary_revision_target_plans WHERE request_id = :'req')
  AND (SELECT status = 'missed' AND acted FROM public.hr_salary_revision_target_months WHERE request_id = :'req' AND month = :'m4')
  AND (SELECT status = 'not_measured' FROM public.hr_salary_revision_target_months WHERE request_id = :'req' AND month = :'m5')
  AND (SELECT status = 'missed' AND acted FROM public.hr_salary_revision_target_months WHERE request_id = :'req' AND month = :'m6'),
  t.dump(:'req'));
INSERT INTO public.institution_leaves (institution_id, leave_type_id, leave_name, start_date, end_date, status, requested_by, scope_level, department_ids)
VALUES (:'A', '00000000-0000-0000-0000-0000000001e1', 'Dept closure', (:'m4'::date + 19), (:'m4'::date + 24), 'approved', :'D', 'department', ARRAY[:'DEPT']::uuid[]);
SELECT public.hr_salary_revision_target_month_settled(:'req', :'sF4', :'m4') AS m4_settled \gset
SELECT bool_and(met) AS m4_fresh FROM public.hr_salary_revision_target_measure(:'sF4', :'m4', :'T') \gset
SELECT t.info('RV6-A before m8: M4 settled=' || :'m4_settled' || ' M4 measured now met=' || :'m4_fresh');
SELECT count(*) AS pay0 FROM public.hr_staff_salaries WHERE staff_id = :'sF4' \gset
SELECT public.hr_salary_revision_targets_run_on(:'m8') AS r4 \gset
SELECT t.info('RV6-A run m8: ' || t.dump(:'req'));
SELECT t.check('RV6-A no pause while M4 (first month of the run of misses) is not settled: measured now it is met, so only M6, M7 are missed in a row',
  (SELECT state = 'released' FROM public.hr_salary_revision_target_plans WHERE request_id = :'req')
  AND (SELECT count(*) FROM public.hr_staff_salaries WHERE staff_id = :'sF4') = :'pay0'::int
  AND NOT EXISTS (SELECT 1 FROM public.hr_salary_revision_target_months WHERE request_id = :'req' AND month = :'m7' AND acted),
  t.dump(:'req'));
SELECT count(*) AS m4_listed FROM public.hr_target_schedule_needs((:'m8'::date + 1), 100000) n
 WHERE n.staff_id = :'sF4' AND n.reason = 'holidays_changed' AND n.day BETWEEN (:'m4'::date + 19) AND (:'m4'::date + 24) \gset
SELECT t.check('RV6-A the nightly listing reaches back to the run of misses: all six of M4''s stale days are asked for again',
  :'m4_listed'::int = 6, 'listed ' || :'m4_listed' || ' expected 6');
-- The job records them (as the resolver would: the holiday leaves no periods).
SELECT count(public.hr_target_schedule_record(n.staff_id, n.day, '[]'::jsonb, 'probe', (:'m8'::date + 1), n.holiday_key)) AS rec
  FROM public.hr_target_schedule_needs((:'m8'::date + 1), 100000) n
 WHERE n.staff_id = :'sF4' AND n.reason = 'holidays_changed' AND n.day BETWEEN :'m4' AND (:'m5'::date - 1) \gset
SELECT public.hr_salary_revision_targets_run_on((:'m8'::date + 1)) AS r5 \gset
SELECT t.info('RV6-A re-recorded ' || :'rec' || ' M4 days; run m8+1: ' || t.dump(:'req'));
SELECT t.check('RV6-A2 once its days are recorded again M4 is measured again and met; M6, M7 are two misses in a row: still paid, no pay row written',
  (SELECT status = 'met' AND acted FROM public.hr_salary_revision_target_months WHERE request_id = :'req' AND month = :'m4')
  AND (SELECT status = 'missed' AND acted FROM public.hr_salary_revision_target_months WHERE request_id = :'req' AND month = :'m7')
  AND (SELECT state = 'released' AND missed_in_row = 2 FROM public.hr_salary_revision_target_plans WHERE request_id = :'req')
  AND (SELECT count(*) FROM public.hr_staff_salaries WHERE staff_id = :'sF4') = :'pay0'::int,
  t.dump(:'req'));
