-- Review round 12 (8 Oct 2026; the round-7 money review): a late re-measure
-- turns an OLD missed month met, and the misses after it are ALREADY counted
-- and acted on. Rounds 7-11 released (or resumed) the part on that month and
-- worked the misses in a row out again, but those misses had been acted on
-- before, so nothing paused it: it stayed paid with missed_in_row already at
-- the rule (3). Since round 12 run_one replays every settled month of the
-- plan in calendar order and writes only the change from where the part
-- stands, from the next 1st (never backdated, no pay row undone).
-- Run by run-targets.sh after probe-schedule.sql on the same database (F4's
-- raise). Each line prints PASS or FAIL. Case (ii) of probe-replay.sql (a
-- PAUSED part), on its own database: its months must not be taught twice.
\ir probe-settled-common.sql
SELECT (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '9 month')::date AS m9,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '10 month')::date AS m10,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '11 month')::date AS m11 \gset

-- ── (ii) A PAUSED part ──────────────────────────────────────────────────────
-- Window M4..M9. M4 met (released from M6). M5: on time days 1-19, someone
-- else days 20+: missed. M6, M7 missed: paused from M9. M8, M9, M10 missed.
DELETE FROM public.hr_salary_revision_target_months WHERE request_id = :'req';
UPDATE public.hr_salary_revision_target_plans
   SET state = 'waiting', window_start = :'m4', window_months = 6, missed_in_row = 0,
       held_paid_from = NULL, paused_from = NULL, last_run_on = NULL
 WHERE request_id = :'req';
SELECT t.good_month(:'tt', :'F4', :'C4', :'m4');
SELECT t.teach(:'tt', :'F4', :'C4', :'m5', (SELECT array_agg(g) FROM generate_series(1, 19) g), NULL,
               (SELECT array_agg(g) FROM generate_series(20, t.days_in(:'m5')) g), NULL,
               t.all_days(:'m5'), (SELECT array_agg(g) FROM generate_series(1, t.days_in(:'m5'), 2) g), t.all_days(:'m5'));
SELECT t.bad_month(:'tt', :'F4', :'C4', :'m6');
SELECT t.bad_month(:'tt', :'F4', :'C4', :'m7');
SELECT t.bad_month(:'tt', :'F4', :'C4', :'m8');
SELECT t.bad_month(:'tt', :'F4', :'C4', :'m9');
SELECT t.bad_month(:'tt', :'F4', :'C4', :'m10');
SELECT public.hr_salary_revision_targets_run_on(:'m5') AS b1 \gset
SELECT public.hr_salary_revision_targets_run_on(:'m6') AS b2 \gset
SELECT public.hr_salary_revision_targets_run_on(:'m7') AS b3 \gset
SELECT public.hr_salary_revision_targets_run_on(:'m8') AS b4 \gset
SELECT public.hr_salary_revision_targets_run_on(:'m9') AS b5 \gset
SELECT public.hr_salary_revision_targets_run_on(:'m10') AS b6 \gset
SELECT public.hr_salary_revision_targets_run_on(:'m11') AS b7 \gset
SELECT t.info('R7 (ii) M4 met, M5..M10 missed, run m11: ' || t.dump(:'req'));
SELECT t.check('R7 (ii) setup: released by M4, paused by M5..M7, M8..M10 missed while paused',
  (SELECT state = 'paused' AND paused_from = :'m8'::date FROM public.hr_salary_revision_target_plans WHERE request_id = :'req')
  AND (SELECT action = 'paused' FROM public.hr_salary_revision_target_months WHERE request_id = :'req' AND month = :'m7'),
  t.dump(:'req'));
-- F4's leave for M5 days 20+ is approved now: M5 is measured again, met.
SELECT count(*) AS pay_ii FROM public.hr_staff_salaries WHERE staff_id = :'sF4' \gset
INSERT INTO public.hr_leave_applications (employee_id, start_date, end_date, status)
VALUES (:'sF4', (:'m5'::date + 19), (:'m6'::date - 1), 'approved');
SELECT public.hr_salary_revision_targets_run_on((:'m11'::date + 1)) AS b8 \gset
SELECT t.info('R7 (ii) leave over M5 days 20+, run m11+1: ' || t.dump(:'req'));
SELECT t.check('R7 (ii) a late met month in a paused part whose next three months are already counted missed: it stays PAUSED, not resumed and left paid (no pay row)',
  (SELECT status = 'met' FROM public.hr_salary_revision_target_months WHERE request_id = :'req' AND month = :'m5')
  AND (SELECT state = 'paused' AND missed_in_row = 0 FROM public.hr_salary_revision_target_plans WHERE request_id = :'req')
  AND (SELECT count(*) FROM public.hr_staff_salaries WHERE staff_id = :'sF4') = :'pay_ii'::int,
  t.dump(:'req'));
