\set ON_ERROR_STOP 0
\set D '00000000-0000-0000-0000-000000010001'
\set S '00000000-0000-0000-0000-000000010006'
\set A '00000000-0000-0000-0000-000000010007'
\set H '00000000-0000-0000-0000-000000010005'
\set F '00000000-0000-0000-0000-000000010011'
\set N '00000000-0000-0000-0000-000000010009'
\set R '00000000-0000-0000-0000-00000000e001'
\set OWN '00000000-0000-0000-0000-00000000e002'
\set R3 '00000000-0000-0000-0000-00000000e003'
-- The Director's payload, as the sign-off screen writes it.
\set GOOD '{"ratings":{"research":"meets"},"reason":"Two of the three papers were co-authored elsewhere","set_by":"00000000-0000-0000-0000-000000010001","set_at":"2026-09-30T12:00:00Z"}'
\set SHORT '{"ratings":{"research":"meets"},"reason":"no"}'
\set NORATINGS '{"reason":"A reason long enough to pass"}'
\set EMPTY '{"ratings":{},"reason":"A reason long enough to pass"}'
\set BADAREA '{"ratings":{"foo":"meets"},"reason":"A reason long enough to pass"}'
\set BADBAND '{"ratings":{"research":"outstanding"},"reason":"A reason long enough to pass"}'
-- One full sign-off, as PerformanceReviewService.finalApprove writes it: %1 the
-- Director's payload (or NULL), %2 the approver, %3 the row.
\set SIGNOFF 'UPDATE public.hr_performance_reviews SET status = ''final_approved'', final_score = 55, final_remarks = ''Signed off'', final_approved_at = now(), final_approved_by = %2$L, director_review_jsonb = %1$L::jsonb WHERE id = %3$L'
\set SENDBACK 'UPDATE public.hr_performance_reviews SET status = ''supervisor_reviewed'', sedc_review_jsonb = sedc_review_jsonb || ''{"sent_back_reason":"Please recheck"}'' WHERE id = %L'

RESET ROLE;
SELECT t.check('the column exists', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hr_performance_reviews' AND column_name = 'director_review_jsonb'));
SELECT t.check('anon cannot execute the guard function', NOT has_function_privilege('anon', 'public.fn_hr_performance_review_guard()', 'EXECUTE'));

-- ── Who may sign off (panel HIGH) ─────────────────────────────────────────
SET ROLE authenticated;
SELECT t.login(:'S');
SELECT t.check('another super admin cannot sign off',
  t.try(format(:'SIGNOFF', NULL, :'S', :'R')) LIKE '23514%');
SELECT t.check('another super admin cannot write the score alone',
  t.try(format('UPDATE public.hr_performance_reviews SET final_score = 90 WHERE id = %L', :'R')) LIKE '23514%');
SELECT t.check('another super admin cannot change a rating',
  t.try(format('UPDATE public.hr_performance_reviews SET director_review_jsonb = %L WHERE id = %L', :'GOOD', :'R')) LIKE '23514%');
SELECT t.login(:'A');
SELECT t.check('an admin cannot sign off',
  t.try(format(:'SIGNOFF', NULL, :'A', :'R')) LIKE '23514%');
SELECT t.check('an admin cannot change a rating',
  t.try(format('UPDATE public.hr_performance_reviews SET director_review_jsonb = %L WHERE id = %L', :'GOOD', :'R')) LIKE '23514%');
SELECT t.check('an admin cannot send back from the Director''s step',
  t.try(format(:'SENDBACK', :'R3')) LIKE '23514%');
SELECT t.check('an admin cannot write the remarks alone',
  t.try(format('UPDATE public.hr_performance_reviews SET final_remarks = %L WHERE id = %L', 'Fine', :'R')) LIKE '23514%');
SELECT t.login(:'H');
SELECT t.check('the head of department cannot change a rating',
  t.try(format('UPDATE public.hr_performance_reviews SET director_review_jsonb = %L WHERE id = %L', :'GOOD', :'R')) LIKE '23514%');
SELECT t.login(:'F');
SELECT t.check('the person appraised cannot change a rating',
  t.try(format('UPDATE public.hr_performance_reviews SET director_review_jsonb = %L WHERE id = %L', :'GOOD', :'R')) LIKE '23514%');
SELECT t.login(:'N');
SELECT t.check('a signed-in person with no role cannot sign off',
  t.try(format(:'SIGNOFF', NULL, :'N', :'R')) LIKE '23514%');
SELECT t.check('a signed-in nobody cannot change a rating',
  t.try(format('UPDATE public.hr_performance_reviews SET director_review_jsonb = %L WHERE id = %L', :'GOOD', :'R')) LIKE '23514%');
RESET ROLE;
SET ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', false);
SELECT t.check('anon cannot sign off',
  t.try(format(:'SIGNOFF', NULL, NULL, :'R')) LIKE '23514%');
RESET ROLE;
SELECT t.login(NULL);
SELECT t.check('nothing was written by the refusals',
  (SELECT director_review_jsonb IS NULL AND final_score IS NULL AND final_remarks IS NULL AND status = 'sedc_reviewed'
     FROM public.hr_performance_reviews WHERE id = :'R')
  AND (SELECT status = 'sedc_reviewed' FROM public.hr_performance_reviews WHERE id = :'R3'));

-- ── The Director ──────────────────────────────────────────────────────────
SET ROLE authenticated;
SELECT t.login(:'D');
SELECT t.check('the Director cannot write his change outside a sign-off',
  t.try(format('UPDATE public.hr_performance_reviews SET director_review_jsonb = %L WHERE id = %L', :'GOOD', :'R')) LIKE '23514%');
SELECT t.check('a changed rating without a reason is refused',
  t.try(format(:'SIGNOFF', :'SHORT', :'D', :'R')) LIKE '23514%');
SELECT t.check('a payload without ratings is refused',
  t.try(format(:'SIGNOFF', :'NORATINGS', :'D', :'R')) LIKE '23514%');
SELECT t.check('a change naming no area is refused',
  t.try(format(:'SIGNOFF', :'EMPTY', :'D', :'R')) LIKE '23514%');
SELECT t.check('an unknown area is refused',
  t.try(format(:'SIGNOFF', :'BADAREA', :'D', :'R')) LIKE '23514%');
SELECT t.check('an unknown band is refused',
  t.try(format(:'SIGNOFF', :'BADBAND', :'D', :'R')) LIKE '23514%');
SELECT t.check('the Director cannot sign off his own appraisal',
  t.try(format(:'SIGNOFF', NULL, :'D', :'OWN')) LIKE '23514%');
SELECT t.check('the Director signs off, changing a rating with a reason',
  t.try(format(:'SIGNOFF', :'GOOD', :'D', :'R')) = 'ok');
RESET ROLE;
SELECT t.login(NULL);
SELECT t.check('the committee''s rating is untouched beside the Director''s',
  (SELECT sedc_review_jsonb #>> '{ratings,research}' = 'exceeds' AND director_review_jsonb #>> '{ratings,research}' = 'meets'
          AND status = 'final_approved'
     FROM public.hr_performance_reviews WHERE id = :'R'));
SET ROLE authenticated;
SELECT t.login(:'D');
SELECT t.check('the Director cannot clear his change after sign-off',
  t.try(format('UPDATE public.hr_performance_reviews SET director_review_jsonb = NULL WHERE id = %L', :'R')) LIKE '23514%');
SELECT t.check('the Director cannot change the score after sign-off',
  t.try(format('UPDATE public.hr_performance_reviews SET final_score = 90 WHERE id = %L', :'R')) LIKE '23514%');
SELECT t.check('the Director cannot reopen a signed-off appraisal',
  t.try(format('UPDATE public.hr_performance_reviews SET status = ''sedc_reviewed'' WHERE id = %L', :'R')) LIKE '23514%');
SELECT t.login(:'S');
SELECT t.check('another super admin cannot reopen a signed-off appraisal',
  t.try(format('UPDATE public.hr_performance_reviews SET status = ''sedc_reviewed'' WHERE id = %L', :'R')) LIKE '23514%');
SELECT t.login(:'D');
SELECT t.check('the Director sends an appraisal back from his step',
  t.try(format(:'SENDBACK', :'R3')) = 'ok');
SELECT t.login(:'A');
SELECT t.check('the committee (an admin) still passes it to the Director again',
  t.try(format('UPDATE public.hr_performance_reviews SET status = ''sedc_reviewed'', sedc_reviewed_at = now() WHERE id = %L', :'R3')) = 'ok');
RESET ROLE;
SELECT t.login(NULL);
SELECT t.check('the signed-off row still holds the Director''s sign-off',
  (SELECT director_review_jsonb IS NOT NULL AND final_score = 55 AND status = 'final_approved'
     FROM public.hr_performance_reviews WHERE id = :'R'));

-- ── service_role and the database console: main's answer, unchanged ─────
-- The sign-off rule does not apply to them; they reach main's own guard as
-- before this migration, which refuses a write from a session with no user
-- ("not a party"). Nothing is widened.
SET ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
SELECT t.check('service_role gets main''s own answer, not the sign-off rule',
  t.try(format('UPDATE public.hr_performance_reviews SET final_remarks = %L WHERE id = %L', 'Corrected by a job', :'R')) LIKE '23514%not a party%');
RESET ROLE;
SELECT t.login(NULL);
SELECT t.check('a direct database session gets main''s own answer, not the sign-off rule',
  t.try(format('UPDATE public.hr_performance_reviews SET final_remarks = %L WHERE id = %L', 'Corrected at the console', :'R')) LIKE '23514%not a party%');

SET ROLE authenticated;
SELECT t.login(:'F');
SELECT t.check('a new appraisal cannot be created carrying a Director rating',
  t.try(format($q$INSERT INTO public.hr_performance_reviews (cycle_id, staff_id, self_appraisal_jsonb, director_review_jsonb, status)
     VALUES ('00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-000000020011', '{}', %L, 'draft')$q$, :'GOOD')) LIKE '23514%');
SELECT t.login(:'S');
SELECT t.check('a super admin cannot create an appraisal already signed off',
  t.try($q$INSERT INTO public.hr_performance_reviews (cycle_id, staff_id, self_appraisal_jsonb, status, final_score)
     VALUES ('00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-000000020011', '{}', 'final_approved', 80)$q$) LIKE '23514%');
RESET ROLE;

-- Main's own rules survive the rebuild (20270501090100 is not reverted).
SET ROLE authenticated;
SELECT t.login(:'F');
SELECT t.check('main''s rule holds: the person appraised still cannot write the committee''s verdict',
  t.try(format($q$UPDATE public.hr_performance_reviews SET sedc_review_jsonb = '{"ratings":{"teaching":"exceeds"}}' WHERE id = %L$q$, :'R')) LIKE '23514%');
RESET ROLE;
