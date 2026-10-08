-- Review round 12 (8 Oct 2026; the round-7 money review): a late re-measure
-- turns an OLD missed month met, and the misses after it are ALREADY counted
-- and acted on. Rounds 7-11 released (or resumed) the part on that month and
-- worked the misses in a row out again, but those misses had been acted on
-- before, so nothing paused it: it stayed paid with missed_in_row already at
-- the rule (3). Since round 12 run_one replays every settled month of the
-- plan in calendar order and writes only the change from where the part
-- stands, from the next 1st (never backdated, no pay row undone).
-- Run by run-targets.sh after probe-schedule.sql on the same database (F4's
-- raise). Each line prints PASS or FAIL.
\ir probe-settled-common.sql
SELECT (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '9 month')::date AS m9,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '10 month')::date AS m10,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '11 month')::date AS m11 \gset

-- ── (i) A WAITING part ──────────────────────────────────────────────────────
-- Window M4..M9. M4: on time days 1-19, someone else days 20+ (F4 away, leave
-- not yet approved): missed. M5, M6, M7 missed. All four counted and acted on.
DELETE FROM public.hr_salary_revision_target_months WHERE request_id = :'req';
UPDATE public.hr_salary_revision_target_plans
   SET state = 'waiting', window_start = :'m4', window_months = 6, missed_in_row = 0,
       held_paid_from = NULL, paused_from = NULL, last_run_on = NULL
 WHERE request_id = :'req';
SELECT t.teach(:'tt', :'F4', :'C4', :'m4', (SELECT array_agg(g) FROM generate_series(1, 19) g), NULL,
               (SELECT array_agg(g) FROM generate_series(20, t.days_in(:'m4')) g), NULL,
               t.all_days(:'m4'), (SELECT array_agg(g) FROM generate_series(1, t.days_in(:'m4'), 2) g), t.all_days(:'m4'));
SELECT t.bad_month(:'tt', :'F4', :'C4', :'m5');
SELECT t.bad_month(:'tt', :'F4', :'C4', :'m6');
SELECT t.bad_month(:'tt', :'F4', :'C4', :'m7');
SELECT public.hr_salary_revision_targets_run_on(:'m5') AS a1 \gset
SELECT public.hr_salary_revision_targets_run_on(:'m6') AS a2 \gset
SELECT public.hr_salary_revision_targets_run_on(:'m7') AS a3 \gset
SELECT public.hr_salary_revision_targets_run_on(:'m8') AS a4 \gset
SELECT t.info('R7 (i) M4..M7 missed, run m8: ' || t.dump(:'req'));
SELECT t.check('R7 (i) setup: a waiting part, M4..M7 counted missed and acted on: still waiting, nothing paid',
  (SELECT state = 'waiting' FROM public.hr_salary_revision_target_plans WHERE request_id = :'req')
  AND (SELECT count(*) = 4 FROM public.hr_salary_revision_target_months
        WHERE request_id = :'req' AND month BETWEEN :'m4' AND :'m7' AND status = 'missed' AND acted),
  t.dump(:'req'));
-- F4's leave for M4 days 20+ is approved now: M4 is measured again, met.
SELECT count(*) AS pay_i FROM public.hr_staff_salaries WHERE staff_id = :'sF4' \gset
INSERT INTO public.hr_leave_applications (employee_id, start_date, end_date, status)
VALUES (:'sF4', (:'m4'::date + 19), (:'m5'::date - 1), 'approved');
SELECT public.hr_salary_revision_targets_run_on((:'m8'::date + 1)) AS a5 \gset
SELECT t.info('R7 (i) leave over M4 days 20+, run m8+1: ' || t.dump(:'req'));
SELECT t.check('R7 (i) a late met month releases a waiting part whose next three months are already counted missed: it is PAUSED from the next 1st, never left paid (no pay row: the held part was never paid)',
  (SELECT status = 'met' FROM public.hr_salary_revision_target_months WHERE request_id = :'req' AND month = :'m4')
  AND (SELECT state = 'paused' AND paused_from = :'m9'::date AND held_paid_from IS NULL AND missed_in_row = 0
         FROM public.hr_salary_revision_target_plans WHERE request_id = :'req')
  AND (SELECT action = 'paused' AND action_effective_from = :'m9'::date
         FROM public.hr_salary_revision_target_months WHERE request_id = :'req' AND month = :'m7')
  AND (SELECT count(*) FROM public.hr_staff_salaries WHERE staff_id = :'sF4') = :'pay_i'::int,
  t.dump(:'req'));
-- M8 on target: the part paused this way is paid from the next 1st.
SELECT t.good_month(:'tt', :'F4', :'C4', :'m8');
SELECT public.hr_salary_revision_targets_run_on((:'m9'::date + 1)) AS a6 \gset
SELECT t.info('R7 (i) M8 met, run m9+1: ' || t.dump(:'req'));
SELECT t.check('R7 (i) then a month on target pays it: resumed from the next 1st, one pay row (pay + held)',
  (SELECT state = 'released' AND held_paid_from = :'m10'::date AND missed_in_row = 0
     FROM public.hr_salary_revision_target_plans WHERE request_id = :'req')
  AND (SELECT action = 'resumed' AND action_effective_from = :'m10'::date
         FROM public.hr_salary_revision_target_months WHERE request_id = :'req' AND month = :'m8')
  AND (SELECT count(*) FROM public.hr_staff_salaries WHERE staff_id = :'sF4') = :'pay_i'::int + 1,
  t.dump(:'req'));
