-- Director ruling (a), 8 Oct 2026 (option A): the reviewer's RV6-B variant
-- (M8 closed not measured by an OFF night, so no met month comes after the
-- held month to resume or reset anything). As RV6-B: M4 missed, M5 on target
-- but its 10th never recorded, M6, M7 missed. Before the ruling the run on m9
-- closed the held M5 as not counted and paused (M4 + M6 + M7). Under the
-- ruling M5 keeps waiting: no pause; once recorded, M5 met resets and M6, M7
-- are two in a row: still paid.
\ir probe-settled-common.sql
SELECT (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '9 month')::date AS m9 \gset
DELETE FROM public.hr_salary_revision_target_months WHERE request_id = :'req';
UPDATE public.hr_salary_revision_target_plans SET state = 'released', window_start = LEAST(window_start, :'m4'::date), missed_in_row = 0, last_run_on = NULL WHERE request_id = :'req';
SELECT t.bad_month(:'tt', :'F4', :'C4', :'m4');
SELECT t.good_month(:'tt', :'F4', :'C4', :'m5');
SELECT t.bad_month(:'tt', :'F4', :'C4', :'m6');
SELECT t.bad_month(:'tt', :'F4', :'C4', :'m7');
-- M8: no teaching recorded as met; an OFF night closes it not measured (below)
DELETE FROM public.hr_target_scheduled_periods WHERE staff_id = :'sF4' AND day = (:'m5'::date + 9);
SELECT public.hr_salary_revision_targets_run_on(:'m5') AS r1 \gset
SELECT public.hr_salary_revision_targets_run_on(:'m6') AS r2 \gset
SELECT public.hr_salary_revision_targets_run_on(:'m7') AS r3 \gset
SELECT public.hr_salary_revision_targets_run_on(:'m8') AS r4 \gset
UPDATE public.platform_policies SET value = 'false'::jsonb WHERE policy_key = 'hr.salary_revision.target_measurement_on';
SELECT public.hr_salary_revision_targets_run_on((:'m8'::date + 3)) AS o8 \gset
UPDATE public.platform_policies SET value = 'true'::jsonb WHERE policy_key = 'hr.salary_revision.target_measurement_on';
SELECT t.info('RV6-B3 run m8 (M5 waits for its 10th): ' || t.dump(:'req'));
SELECT count(*) AS pay0 FROM public.hr_staff_salaries WHERE staff_id = :'sF4' \gset
SELECT public.hr_salary_revision_targets_run_on(:'m9') AS r5 \gset
SELECT t.info('RV6-B3 run m9: ' || t.dump(:'req'));
SELECT t.check('RV6-B3 a held month is not closed as not counted even with no met month after it (M8 not measured): no pause',
  (SELECT state = 'released' FROM public.hr_salary_revision_target_plans WHERE request_id = :'req')
  AND (SELECT status = 'in_progress' FROM public.hr_salary_revision_target_months WHERE request_id = :'req' AND month = :'m5')
  AND (SELECT count(*) FROM public.hr_staff_salaries WHERE staff_id = :'sF4') = :'pay0'::int,
  t.dump(:'req'));
SELECT t.mirror_staff(:'sF4');
SELECT public.hr_salary_revision_targets_run_on((:'m9'::date + 1)) AS r6 \gset
SELECT t.info('RV6-B3 recorded, run m9+1: ' || t.dump(:'req'));
SELECT t.check('RV6-B3b once recorded: M5 met resets, M6, M7 = two in a row (M8 not measured, skipped over): still paid, no pay row written',
  (SELECT status = 'met' FROM public.hr_salary_revision_target_months WHERE request_id = :'req' AND month = :'m5')
  AND (SELECT status = 'missed' AND acted FROM public.hr_salary_revision_target_months WHERE request_id = :'req' AND month = :'m7')
  AND (SELECT state = 'released' AND missed_in_row = 2 FROM public.hr_salary_revision_target_plans WHERE request_id = :'req')
  AND (SELECT count(*) FROM public.hr_staff_salaries WHERE staff_id = :'sF4') = :'pay0'::int,
  t.dump(:'req'));
