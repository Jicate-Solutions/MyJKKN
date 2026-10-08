-- 8 Oct 2026, review round 9 (W1): the round-4 money review's probe RV4-B
-- (rv4-b.sql): the natural window from the real classification after an OFF
-- wait; the months written as not measured while OFF are not window months.
\ir probe-settled-common.sql
SELECT (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '9 month')::date AS m9,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '10 month')::date AS m10,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '11 month')::date AS m11 \gset
-- RV4-B: natural window from the real classification (6 months), no hand-set window_months.
DELETE FROM public.hr_salary_revision_target_months WHERE request_id = :'req';
UPDATE public.hr_salary_revision_target_plans SET state = 'awaiting_measurement', missed_in_row = 0, last_run_on = NULL WHERE request_id = :'req';
UPDATE public.platform_policies SET value = 'false'::jsonb WHERE policy_key = 'hr.salary_revision.target_measurement_on';
SELECT public.hr_salary_revision_targets_run_on(:'m4') AS o1 \gset
SELECT public.hr_salary_revision_targets_run_on(:'m5') AS o2 \gset
UPDATE public.platform_policies SET value = 'true'::jsonb WHERE policy_key = 'hr.salary_revision.target_measurement_on';
SELECT public.hr_salary_revision_targets_run_on((:'m5'::date + 5)) AS c1 \gset
SELECT t.info('B classified: ' || t.dump(:'req') || ' ws=' || (SELECT window_start || ' wm=' || window_months FROM public.hr_salary_revision_target_plans WHERE request_id = :'req'));
SELECT t.bad_month(:'tt', :'F4', :'C4', :'m6');
SELECT t.bad_month(:'tt', :'F4', :'C4', :'m7');
SELECT t.bad_month(:'tt', :'F4', :'C4', :'m8');
SELECT t.bad_month(:'tt', :'F4', :'C4', :'m9');
SELECT t.good_month(:'tt', :'F4', :'C4', :'m10');
SELECT t.bad_month(:'tt', :'F4', :'C4', :'m11');
DELETE FROM public.hr_target_scheduled_periods WHERE staff_id = :'sF4' AND day = (:'m10'::date + 9);
SELECT public.hr_salary_revision_targets_run_on(:'m12') AS r1 \gset
SELECT t.info('B run m12 (m10 met, one day missing): ' || t.dump(:'req'));
SELECT t.check('RV4-B natural 6-month window: not back to the Director while m10 (on target, one day not recorded) is uncounted',
  (SELECT state = 'waiting' FROM public.hr_salary_revision_target_plans WHERE request_id = :'req'), t.dump(:'req'));
SELECT count(*) AS inranges FROM public.hr_target_schedule_ranges((:'m12'::date + 1)) WHERE staff_id = :'sF4' \gset
SELECT t.info('B still in schedule ranges: ' || :'inranges');
