\ir probe-settled-common.sql
-- Round 8 (U4, 8 Oct 2026): the per-call month cap is a stop like any other.
-- M4 (met) and M5 (missed) are finished and not counted yet. M6 stands for a
-- later month already counted and not acted on (as one counted before an
-- earlier month became unsettled would be). One call with a cap of ONE month:
-- M4 is counted and acted on; M5 is left for the next call; nothing at or
-- after M5 is acted on, so M6 is not.
UPDATE public.hr_salary_revision_target_plans SET missed_in_row = 2 WHERE request_id = :'req';
SELECT t.good_month(:'tt', :'F4', :'C4', :'m4');
SELECT t.bad_month(:'tt', :'F4', :'C4', :'m5');
INSERT INTO public.hr_salary_revision_target_months (request_id, month, status, results, measured_at)
VALUES (:'req', :'m6', 'missed', '[]'::jsonb, now());
SELECT count(*) AS pay0 FROM public.hr_staff_salaries WHERE staff_id = :'sF4' \gset
SELECT public.hr_salary_revision_targets_run_one(:'req', (:'m7'::date + 2), 1) AS r1 \gset
SELECT t.info('U4b cap 1, run M7+2: ' || t.dump(:'req'));
SELECT t.check('R8-U4b with a cap of one month per call only M4 is counted (met, the misses in a row reset); M5 after it is left for the next call',
  (SELECT status = 'met' AND acted FROM public.hr_salary_revision_target_months WHERE request_id = :'req' AND month = :'m4')
  AND NOT EXISTS (SELECT 1 FROM public.hr_salary_revision_target_months
                   WHERE request_id = :'req' AND month = :'m5' AND status <> 'in_progress')
  AND (SELECT state = 'released' AND missed_in_row = 0 FROM public.hr_salary_revision_target_plans WHERE request_id = :'req'),
  t.dump(:'req'));
SELECT t.check('R8-U4b nothing at or after the month the cap left is acted on: M6, already counted, is not acted on',
  (SELECT NOT acted FROM public.hr_salary_revision_target_months WHERE request_id = :'req' AND month = :'m6')
  AND (SELECT missed_in_row = 0 FROM public.hr_salary_revision_target_plans WHERE request_id = :'req')
  AND (SELECT count(*) FROM public.hr_staff_salaries WHERE staff_id = :'sF4') = :'pay0'::int,
  t.dump(:'req'));
SELECT public.hr_salary_revision_targets_run_one(:'req', (:'m7'::date + 3), 1) AS r2 \gset
SELECT t.info('U4b cap 1, run M7+3: ' || t.dump(:'req'));
SELECT t.check('R8-U4b the next call counts M5 (missed: one in a row), still paid',
  (SELECT status = 'missed' AND acted FROM public.hr_salary_revision_target_months WHERE request_id = :'req' AND month = :'m5')
  AND (SELECT state = 'released' AND missed_in_row = 1 FROM public.hr_salary_revision_target_plans WHERE request_id = :'req')
  AND (SELECT count(*) FROM public.hr_staff_salaries WHERE staff_id = :'sF4') = :'pay0'::int,
  t.dump(:'req'));
