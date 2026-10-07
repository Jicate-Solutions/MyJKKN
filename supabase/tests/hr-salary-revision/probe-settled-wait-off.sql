-- 8 Oct 2026, review round 9 (W1): the round-4 money review's probes RV4-A1,
-- RV4-A2, RV4-A2b (rv4-a.sql). Measurement is OFF when this ships: a held part
-- waiting for measurement gets a not measured month (acted) for every month it
-- waits. Those months come BEFORE its window and must never count as window
-- months: counted, the part went back to the Director a month early (the
-- release it earned lost) or, too many, never. Then R9-W3: a finished month
-- final by its status has no keys worked out.
\ir probe-settled-common.sql
SELECT (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '9 month')::date AS m9,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '10 month')::date AS m10 \gset
-- RV4-A1: the shipped state is OFF. A held part waiting for measurement gets a
-- not_measured row (acted) for every month it waits. Then ON: window starts next month.
DELETE FROM public.hr_salary_revision_target_months WHERE request_id = :'req';
UPDATE public.hr_salary_revision_target_plans SET state = 'awaiting_measurement', missed_in_row = 0, last_run_on = NULL WHERE request_id = :'req';
UPDATE public.platform_policies SET value = 'false'::jsonb WHERE policy_key = 'hr.salary_revision.target_measurement_on';
SELECT public.hr_salary_revision_targets_run_on(:'m4') AS o1 \gset
SELECT public.hr_salary_revision_targets_run_on(:'m5') AS o2 \gset
SELECT t.info('A1 after two OFF months: ' || t.dump(:'req'));
UPDATE public.platform_policies SET value = 'true'::jsonb WHERE policy_key = 'hr.salary_revision.target_measurement_on';
SELECT public.hr_salary_revision_targets_run_on((:'m5'::date + 5)) AS c1 \gset
SELECT t.info('A1 ON, classification run m5+5: ' || t.dump(:'req') || ' ws=' || (SELECT window_start || ' wm=' || window_months FROM public.hr_salary_revision_target_plans WHERE request_id = :'req'));
-- whatever classification did, make it the documented outcome: waiting, window from m6, 2 months
UPDATE public.hr_salary_revision_target_plans SET state = 'waiting', window_start = :'m6', window_months = 2 WHERE request_id = :'req';
SELECT t.bad_month(:'tt', :'F4', :'C4', :'m6');
SELECT t.bad_month(:'tt', :'F4', :'C4', :'m7');
SELECT public.hr_salary_revision_targets_run_on(:'m7') AS r1 \gset
SELECT public.hr_salary_revision_targets_run_on(:'m8') AS r2 \gset
SELECT public.hr_salary_revision_targets_run_on((:'m8'::date + 1)) AS r3 \gset
SELECT t.info('A1 window m6..m7 both missed, run m8, m8+1: ' || t.dump(:'req'));
SELECT t.check('RV4-A1 window of 2 months over, both counted missed: back to the Director (pre-window not_measured rows from the OFF wait must not change the count)',
  (SELECT state = 'back_to_director' FROM public.hr_salary_revision_target_plans WHERE request_id = :'req'), t.dump(:'req'));

-- RV4-A2: same, window m6..m9 (4 months). m6, m7 missed; m8 met but one day not in the record.
DELETE FROM public.hr_salary_revision_target_months WHERE request_id = :'req';
UPDATE public.hr_salary_revision_target_plans SET state = 'awaiting_measurement', missed_in_row = 0, last_run_on = NULL WHERE request_id = :'req';
UPDATE public.platform_policies SET value = 'false'::jsonb WHERE policy_key = 'hr.salary_revision.target_measurement_on';
SELECT public.hr_salary_revision_targets_run_on(:'m4') AS o1 \gset
SELECT public.hr_salary_revision_targets_run_on(:'m5') AS o2 \gset
UPDATE public.platform_policies SET value = 'true'::jsonb WHERE policy_key = 'hr.salary_revision.target_measurement_on';
UPDATE public.hr_salary_revision_target_plans SET state = 'waiting', window_start = :'m6', window_months = 4, last_run_on = NULL WHERE request_id = :'req';
SELECT t.good_month(:'tt', :'F4', :'C4', :'m8');
SELECT t.bad_month(:'tt', :'F4', :'C4', :'m9');
DELETE FROM public.hr_target_scheduled_periods WHERE staff_id = :'sF4' AND day = (:'m8'::date + 9);
SELECT count(*) AS pay0 FROM public.hr_staff_salaries WHERE staff_id = :'sF4' \gset
SELECT public.hr_salary_revision_targets_run_on(:'m10') AS r4 \gset
SELECT t.info('A2 window m6..m9, m8 waits for a day, run m10: ' || t.dump(:'req'));
SELECT t.check('RV4-A2 the window must not go back to the Director while m8 (on target, one day not yet recorded) is not counted',
  (SELECT state = 'waiting' FROM public.hr_salary_revision_target_plans WHERE request_id = :'req'), t.dump(:'req'));
SELECT count(public.hr_target_schedule_record(n.staff_id, n.day, '[]'::jsonb, 'probe', (:'m10'::date + 1), n.holiday_key)) AS rec
  FROM public.hr_target_schedule_needs((:'m10'::date + 1), 100000) n WHERE n.staff_id = :'sF4' AND n.day = (:'m8'::date + 9) \gset
SELECT public.hr_salary_revision_targets_run_on((:'m10'::date + 1)) AS r5 \gset
SELECT t.info('A2 day recorded (' || :'rec' || '), run m10+1: ' || t.dump(:'req'));
SELECT t.check('RV4-A2b once the day is recorded, m8 is met and releases the held part',
  (SELECT state = 'released' FROM public.hr_salary_revision_target_plans WHERE request_id = :'req'), t.dump(:'req'));

-- R9-W3 (8 Oct 2026, round 9): a paid part whose finished months are all final
-- by status (met): the run works out the keys only for the month in progress,
-- not for each final month (each key reads every day of the month).
DELETE FROM public.hr_salary_revision_target_months WHERE request_id = :'req';
UPDATE public.hr_salary_revision_target_plans
   SET state = 'released', window_start = :'m6', window_months = 4, missed_in_row = 0, last_run_on = NULL, run_note = NULL
 WHERE request_id = :'req';
INSERT INTO public.hr_salary_revision_target_months (request_id, month, status, results, measured_at, acted, action)
SELECT :'req', g::date, 'met', '[]'::jsonb, now(), true, 'none'
  FROM generate_series(:'m6'::date, :'m8'::date, interval '1 month') g;
BEGIN;
SET LOCAL track_functions = 'all';
SELECT public.hr_salary_revision_targets_run_one(:'req', (:'m9'::date + 1), 12) AS w3 \gset
SELECT COALESCE((SELECT calls FROM pg_stat_xact_user_functions WHERE schemaname = 'public' AND funcname = 'hr_salary_revision_target_holiday_key'), 0) AS w3_h,
       COALESCE((SELECT calls FROM pg_stat_xact_user_functions WHERE schemaname = 'public' AND funcname = 'hr_salary_revision_target_leave_key'), 0) AS w3_l \gset
COMMIT;
SELECT t.info('W3 run m9+1: ' || t.dump(:'req') || ' holiday_key calls=' || :'w3_h' || ' leave_key calls=' || :'w3_l');
SELECT t.check('R9-W3 finished months final by their status (met) are passed over before their keys are worked out: the keys are worked out once, for the month in progress only',
  :'w3_h'::int = 1 AND :'w3_l'::int = 1
  AND (SELECT status = 'in_progress' FROM public.hr_salary_revision_target_months WHERE request_id = :'req' AND month = :'m9'),
  'holiday_key calls ' || :'w3_h' || ', leave_key calls ' || :'w3_l' || ' | ' || t.dump(:'req'));
