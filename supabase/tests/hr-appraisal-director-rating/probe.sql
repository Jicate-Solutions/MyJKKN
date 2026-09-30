\set ON_ERROR_STOP 0
\set D '00000000-0000-0000-0000-000000010001'
\set S '00000000-0000-0000-0000-000000010006'
\set A '00000000-0000-0000-0000-000000010007'
\set H '00000000-0000-0000-0000-000000010005'
\set F '00000000-0000-0000-0000-000000010011'
\set N '00000000-0000-0000-0000-000000010009'
\set R '00000000-0000-0000-0000-00000000e001'
-- The Director's payload, as the sign-off screen writes it.
\set GOOD '{"ratings":{"research":"meets"},"reason":"Two of the three papers were co-authored elsewhere","set_by":"00000000-0000-0000-0000-000000010001","set_at":"2026-09-30T12:00:00Z"}'
\set SHORT '{"ratings":{"research":"meets"},"reason":"no"}'
\set NORATINGS '{"reason":"A reason long enough to pass"}'

RESET ROLE;
SELECT t.check('the column exists', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hr_performance_reviews' AND column_name = 'director_review_jsonb'));
SELECT t.check('anon cannot execute the guard function', NOT has_function_privilege('anon', 'public.fn_hr_performance_review_guard()', 'EXECUTE'));

SET ROLE authenticated;
SELECT t.login(:'S');
SELECT t.check('another super admin cannot change a rating',
  t.try(format('UPDATE public.hr_performance_reviews SET director_review_jsonb = %L WHERE id = %L', :'GOOD', :'R')) LIKE '23514%');
SELECT t.login(:'A');
SELECT t.check('an admin cannot change a rating',
  t.try(format('UPDATE public.hr_performance_reviews SET director_review_jsonb = %L WHERE id = %L', :'GOOD', :'R')) LIKE '23514%');
SELECT t.login(:'H');
SELECT t.check('the head of department cannot change a rating',
  t.try(format('UPDATE public.hr_performance_reviews SET director_review_jsonb = %L WHERE id = %L', :'GOOD', :'R')) LIKE '23514%');
SELECT t.login(:'F');
SELECT t.check('the person appraised cannot change a rating',
  t.try(format('UPDATE public.hr_performance_reviews SET director_review_jsonb = %L WHERE id = %L', :'GOOD', :'R')) LIKE '23514%');
SELECT t.login(:'N');
SELECT t.check('a signed-in nobody cannot change a rating',
  t.try(format('UPDATE public.hr_performance_reviews SET director_review_jsonb = %L WHERE id = %L', :'GOOD', :'R')) LIKE '23514%');
RESET ROLE;
SELECT t.check('nothing was written by the refusals',
  (SELECT director_review_jsonb IS NULL FROM public.hr_performance_reviews WHERE id = :'R'));

SET ROLE authenticated;
SELECT t.login(:'D');
SELECT t.check('a changed rating without a reason is refused',
  t.try(format('UPDATE public.hr_performance_reviews SET director_review_jsonb = %L WHERE id = %L', :'SHORT', :'R')) LIKE '23514%');
SELECT t.check('a payload without ratings is refused',
  t.try(format('UPDATE public.hr_performance_reviews SET director_review_jsonb = %L WHERE id = %L', :'NORATINGS', :'R')) LIKE '23514%');
SELECT t.check('the Director changes a rating, with a reason',
  t.try(format('UPDATE public.hr_performance_reviews SET director_review_jsonb = %L WHERE id = %L', :'GOOD', :'R')) = 'ok');
RESET ROLE;
SELECT t.check('the committee''s rating is untouched beside the Director''s',
  (SELECT sedc_review_jsonb #>> '{ratings,research}' = 'exceeds' AND director_review_jsonb #>> '{ratings,research}' = 'meets'
     FROM public.hr_performance_reviews WHERE id = :'R'));
SET ROLE authenticated;
SELECT t.login(:'D');
SELECT t.check('the Director can clear their own change',
  t.try(format('UPDATE public.hr_performance_reviews SET director_review_jsonb = NULL WHERE id = %L', :'R')) = 'ok');
SELECT t.login(:'F');
SELECT t.check('a new appraisal cannot be created carrying a Director rating',
  t.try(format($q$INSERT INTO public.hr_performance_reviews (cycle_id, staff_id, self_appraisal_jsonb, director_review_jsonb, status)
     VALUES ('00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-000000020005', '{}', %L, 'draft')$q$, :'GOOD')) LIKE '23514%');
RESET ROLE;
