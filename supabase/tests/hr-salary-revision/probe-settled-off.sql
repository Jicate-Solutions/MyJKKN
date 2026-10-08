\ir probe-settled-common.sql
-- P3: measurement switched OFF for one night while a FINISHED month waits for a schedule day.
UPDATE public.hr_salary_revision_target_plans SET missed_in_row = 2 WHERE request_id = :'req';
-- 8 Oct 2026 (round 12): the run works the misses in a row out from the
-- months (a replay), so the two misses in a row are made in the months too:
-- M2 and M3 (met and not counted in probe-schedule.sql) put back as two
-- counted misses, settled on today's keys. The hand-set count alone no longer
-- says anything, and the control R4 (OFF closes every month left so far) could
-- not be seen: M4 thrown away, M6 was one miss, not a third.
SELECT (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '2 month')::date AS m2,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '3 month')::date AS m3 \gset
UPDATE public.hr_salary_revision_target_months mo
   SET status = 'missed', acted = true, action = 'none', action_effective_from = NULL,
       leave_key = public.hr_salary_revision_target_leave_key(:'sF4', date_trunc('week', mo.month)::date,
                     (mo.month + interval '1 month' - interval '1 day')::date),
       holiday_key = public.hr_salary_revision_target_holiday_key(:'sF4', date_trunc('week', mo.month)::date,
                     (mo.month + interval '1 month' - interval '1 day')::date)
 WHERE mo.request_id = :'req' AND mo.month IN (:'m2', :'m3');
SELECT t.info('P3 start, M2 and M3 two misses in a row: ' || t.dump(:'req'));
SELECT t.good_month(:'tt', :'F4', :'C4', :'m4');
DELETE FROM public.hr_target_scheduled_periods WHERE staff_id = :'sF4' AND day = (:'m4'::date + 9);
SELECT public.hr_salary_revision_targets_run_on(:'m5') AS r1 \gset
SELECT t.info('P3 run m5 (a day of M4 not recorded): ' || t.dump(:'req'));
UPDATE public.platform_policies SET value = 'false'::jsonb WHERE policy_key = 'hr.salary_revision.target_measurement_on';
SELECT public.hr_salary_revision_targets_run_on((:'m5'::date + 1)) AS r2 \gset
SELECT t.info('P3 OFF run m5+1: ' || t.dump(:'req'));
UPDATE public.platform_policies SET value = 'true'::jsonb WHERE policy_key = 'hr.salary_revision.target_measurement_on';
SELECT count(public.hr_target_schedule_record(n.staff_id, n.day, '[]'::jsonb, 'probe', (:'m5'::date + 2), n.holiday_key)) AS rec
  FROM public.hr_target_schedule_needs((:'m5'::date + 2), 100000) n
 WHERE n.staff_id = :'sF4' AND n.day = (:'m4'::date + 9) \gset
SELECT bool_and(met) AS m4_met FROM public.hr_salary_revision_target_measure(:'sF4', :'m4', :'T') \gset
SELECT public.hr_salary_revision_targets_run_on((:'m5'::date + 2)) AS r3 \gset
SELECT t.info('P3 ON again, day recorded (' || :'rec' || '), M4 would be met=' || :'m4_met' || ', run m5+2: ' || t.dump(:'req'));
SELECT t.bad_month(:'tt', :'F4', :'C4', :'m5');
SELECT t.bad_month(:'tt', :'F4', :'C4', :'m6');
SELECT count(*) AS pay0 FROM public.hr_staff_salaries WHERE staff_id = :'sF4' \gset
SELECT public.hr_salary_revision_targets_run_on(:'m6') AS r4 \gset
SELECT public.hr_salary_revision_targets_run_on(:'m7') AS r5 \gset
SELECT t.info('P3 run m6 (M5 missed): ' || t.dump(:'req'));
SELECT t.check('RV3-P3 a one-night OFF must not throw away a finished, met month that was only waiting for a day (calendar: M4 met resets, M5 not measured (OFF night), M6 = 1 miss, no pause)',
  (SELECT state = 'released' FROM public.hr_salary_revision_target_plans WHERE request_id = :'req')
  AND (SELECT count(*) FROM public.hr_staff_salaries WHERE staff_id = :'sF4') = :'pay0'::int,
  t.dump(:'req'));
