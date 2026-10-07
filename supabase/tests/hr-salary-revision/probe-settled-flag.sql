\ir probe-settled-common.sql
-- Round 8 (U4, 8 Oct 2026): a FLAGGED month the Director has not decided, OLDER
-- than the months the run still measures once the held part is paid (the last
-- pause_after_missed_months finished months): nothing after it is counted or
-- acted on (round 7, B3), and the note says so. Calendar order: once decided,
-- the months after it are counted after it.
SELECT (rules->>'pause_after_missed_months')::int AS pam FROM public.hr_salary_revision_target_plans WHERE request_id = :'req' \gset
INSERT INTO public.hr_salary_revision_target_months (request_id, month, status) VALUES (:'req', :'m5', 'flagged')
ON CONFLICT (request_id, month) DO UPDATE SET status = 'flagged';
SELECT t.bad_month(:'tt', :'F4', :'C4', :'m6');
SELECT t.bad_month(:'tt', :'F4', :'C4', :'m7');
SELECT t.bad_month(:'tt', :'F4', :'C4', :'m8');
SELECT count(*) AS pay0 FROM public.hr_staff_salaries WHERE staff_id = :'sF4' \gset
SELECT public.hr_salary_revision_targets_run_on((:'m8'::date + interval '1 month')::date) AS r1 \gset
SELECT t.info('U4a M5 flagged (older than the pause months), M6-M8 missed, run M9: ' || t.dump(:'req'));
SELECT t.check('R8-U4a a flagged month older than the months measured once paid, not yet decided, stops every later month: M6-M8 not counted, no pause, and the note says so',
  :'pam'::int = 3
  AND (SELECT state = 'released' AND run_note LIKE 'Flagged, waiting for the Director''s decision: %'
         FROM public.hr_salary_revision_target_plans WHERE request_id = :'req')
  AND NOT EXISTS (SELECT 1 FROM public.hr_salary_revision_target_months
                   WHERE request_id = :'req' AND month >= :'m6' AND status <> 'in_progress')
  AND (SELECT count(*) FROM public.hr_staff_salaries WHERE staff_id = :'sF4') = :'pay0'::int,
  t.dump(:'req'));
UPDATE public.hr_salary_revision_target_months SET status = 'decided_met' WHERE request_id = :'req' AND month = :'m5';
SELECT public.hr_salary_revision_targets_run_on((:'m8'::date + interval '1 month')::date + 1) AS r2 \gset
SELECT t.info('U4a Director decides M5 met, run M9+1: ' || t.dump(:'req'));
SELECT t.check('R8-U4a once decided, the months after it are counted in calendar order: M5 met resets, M6-M8 are three misses in a row, the held part is paused',
  (SELECT state = 'paused' FROM public.hr_salary_revision_target_plans WHERE request_id = :'req'),
  t.dump(:'req'));
