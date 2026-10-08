-- Review round 10 (X1, 8 Oct 2026): the reviewer's RV5-A, verbatim.
-- RV5-A: waiting window M4..M5. M4 counted missed. Measurement switched OFF
-- during M5 (M5 written not_measured, acted). ON again. A dept holiday for M4
-- 20-25 approved (M4's days stale, not yet re-recorded). Run in M6: the run
-- stops at M4 (unsettled) but the window check counts M4(acted)+M5(not_measured acted)=2.
\ir probe-settled-common.sql
DELETE FROM public.hr_salary_revision_target_months WHERE request_id = :'req';
UPDATE public.hr_salary_revision_target_plans SET state = 'waiting', window_start = :'m4', window_months = 2, missed_in_row = 0, last_run_on = NULL WHERE request_id = :'req';
UPDATE public.hr_target_scheduled_periods SET resolver = 'probe'
 WHERE staff_id = :'sF4' AND day BETWEEN date_trunc('week', :'m4'::date)::date AND (:'m5'::date - 1);
SELECT t.teach(:'tt', :'F4', :'C4', :'m4',
               (SELECT array_agg(g) FROM generate_series(1, t.days_in(:'m4')) g WHERE g NOT BETWEEN 20 AND 25), NULL, NULL, NULL,
               t.all_days(:'m4'), (SELECT array_agg(g) FROM generate_series(1, t.days_in(:'m4'), 2) g), t.all_days(:'m4'));
SELECT public.hr_salary_revision_targets_run_on(:'m5') AS r1 \gset
SELECT t.info('RV5-A run m5 (ON): ' || t.dump(:'req'));
UPDATE public.platform_policies SET value = 'false'::jsonb WHERE policy_key = 'hr.salary_revision.target_measurement_on';
SELECT public.hr_salary_revision_targets_run_on((:'m5'::date + 3)) AS o1 \gset
SELECT t.info('RV5-A run m5+3 (OFF): ' || t.dump(:'req'));
UPDATE public.platform_policies SET value = 'true'::jsonb WHERE policy_key = 'hr.salary_revision.target_measurement_on';
INSERT INTO public.institution_leaves (institution_id, leave_type_id, leave_name, start_date, end_date, status, requested_by, scope_level, department_ids)
VALUES (:'A', '00000000-0000-0000-0000-0000000001e1', 'Dept closure', (:'m4'::date + 19), (:'m4'::date + 24), 'approved', :'D', 'department', ARRAY[:'DEPT']::uuid[]);
SELECT public.hr_salary_revision_targets_run_on(:'m6') AS r2 \gset
SELECT t.info('RV5-A run m6 (window over, M4 stale, M5 not measured): ' || t.dump(:'req'));
SELECT bool_and(met) AS m4_fresh FROM public.hr_salary_revision_target_measure(:'sF4', :'m4', :'T') \gset
SELECT t.info('RV5-A M4 measured on the new holidays would be met: ' || :'m4_fresh');
SELECT t.check('RV5-A the window must not go back to the Director while M4 (counted missed) waits to be measured again, even when the last window month was closed not measured by an OFF night',
  (SELECT state = 'waiting' FROM public.hr_salary_revision_target_plans WHERE request_id = :'req'), t.dump(:'req'));
SELECT count(*) AS inr FROM public.hr_target_schedule_ranges((:'m6'::date + 1)) WHERE staff_id = :'sF4' \gset
SELECT count(public.hr_target_schedule_record(n.staff_id, n.day, '[]'::jsonb, 'probe', (:'m6'::date + 1), n.holiday_key)) AS rec
  FROM public.hr_target_schedule_needs((:'m6'::date + 1), 100000) n WHERE n.staff_id = :'sF4' AND n.reason = 'holidays_changed' \gset
SELECT public.hr_salary_revision_targets_run_on((:'m6'::date + 1)) AS r3 \gset
SELECT t.info('RV5-A in ranges=' || :'inr' || ' re-recorded=' || :'rec' || ', run m6+1: ' || t.dump(:'req'));
SELECT t.check('RV5-A2 once its stale days are recorded again M4 is met and releases the held part',
  (SELECT state = 'released' FROM public.hr_salary_revision_target_plans WHERE request_id = :'req'), t.dump(:'req'));
