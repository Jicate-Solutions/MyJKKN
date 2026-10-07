-- ===========================================================================
-- REHEARSAL for 20270501090100_hr_appraisal_column_guard.sql
--
-- NOT a migration, and deliberately NOT in supabase/migrations/.
--
-- It cannot live there. The deploy wave derives the version from the filename
-- prefix (scripts/ship-wave/apply-migrations.sh greps
-- '^supabase/migrations/[0-9]+_' and keeps the 14-digit stem), so a file named
-- 20270501090100_..._rehearsal.sql would have claimed the SAME version as the
-- real migration and the applier could have resolved the wrong file.
-- It lives with the tests instead. Nothing applies it automatically.
--
-- WHY THIS FILE EXISTS
-- This repo has no pgTAP and no database test runner, so the TypeScript tests
-- beside this migration read the trigger as TEXT — they prove the rule is
-- written, not that it fires. This script actually fires it.
--
-- HOW TO RUN IT
-- Against a BRANCH database, never production. It is wrapped in a transaction
-- that ROLLS BACK, so it leaves nothing behind even on success:
--
--     psql "$BRANCH_DB_URL" -v ON_ERROR_STOP=1 -f <this file>
--
-- Each block below expects to FAIL. A block that succeeds is a hole.
-- Read the NOTICEs: every one should say REFUSED.
-- ===========================================================================

BEGIN;

-- Stand in for a real actor. Replace these with real ids from the branch, or
-- let the script pick the first staff member who has a department head.
DO $$
DECLARE
  v_staff      uuid;
  v_profile    uuid;
  v_hod        uuid;
  v_cycle      uuid;
  v_review     uuid;
  v_other      uuid;
  v_admin      uuid;
  v_failed     int := 0;
  v_expected   int := 0;
BEGIN
  -- The guard trigger fires on the SETUP insert too, and with no JWT claim set
  -- it sees no admin and no subject, so it refuses at line 1 and checks 1-7
  -- never run. Caught in review. Take an admin identity for the setup, then
  -- hand over to each real actor below.
  SELECT id INTO v_admin FROM public.profiles WHERE is_super_admin = true LIMIT 1;
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'No super admin profile found — cannot set up the rehearsal';
  END IF;
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  SELECT s.id, s.profile_id, d.head_of_department_id
    INTO v_staff, v_profile, v_hod
  FROM public.staff s
  JOIN public.departments d ON d.id = s.department_id
  WHERE s.profile_id IS NOT NULL
    AND d.head_of_department_id IS NOT NULL
    AND d.head_of_department_id <> s.profile_id
  LIMIT 1;

  IF v_staff IS NULL THEN
    RAISE EXCEPTION 'No staff member with a department head found — cannot rehearse';
  END IF;

  INSERT INTO public.hr_performance_review_cycles
    (cycle_year, start_date, end_date, status, description)
  VALUES (9999, '2099-07-01', '2100-06-30', 'open', 'REHEARSAL — rolled back')
  RETURNING id INTO v_cycle;

  -- Created under the admin claim set at the top, so the guard permits it.
  INSERT INTO public.hr_performance_reviews (cycle_id, staff_id, status)
  VALUES (v_cycle, v_staff, 'draft')
  RETURNING id INTO v_review;

  -- The round that check 5 will try to move the appraisal into.
  INSERT INTO public.hr_performance_review_cycles
    (cycle_year, start_date, end_date, status, description)
  VALUES (9998, '2098-07-01', '2099-06-30', 'draft', 'REHEARSAL — rolled back')
  RETURNING id INTO v_other;

  -- ── Now act AS THE STAFF MEMBER ────────────────────────────────────────
  PERFORM set_config('request.jwt.claim.sub', v_profile::text, true);

  -- 1. The worst case: writing the committee's verdict on your own draft.
  v_expected := v_expected + 1;
  BEGIN
    UPDATE public.hr_performance_reviews
       SET sedc_review_jsonb = '{"ratings":{"teaching":"exceeds","research":"exceeds","service":"exceeds","collegiality":"exceeds"}}'::jsonb
     WHERE id = v_review;
    RAISE WARNING 'HOLE: a staff member wrote sedc_review_jsonb on their own appraisal';
  EXCEPTION WHEN check_violation THEN
    v_failed := v_failed + 1;
    RAISE NOTICE 'REFUSED (1/7): staff writing sedc_review_jsonb';
  END;

  -- 2. Writing their own final score.
  v_expected := v_expected + 1;
  BEGIN
    UPDATE public.hr_performance_reviews SET final_score = 100 WHERE id = v_review;
    RAISE WARNING 'HOLE: a staff member wrote final_score';
  EXCEPTION WHEN check_violation THEN
    v_failed := v_failed + 1;
    RAISE NOTICE 'REFUSED (2/7): staff writing final_score';
  END;

  -- 3. Writing the supervisor's review.
  v_expected := v_expected + 1;
  BEGIN
    UPDATE public.hr_performance_reviews
       SET supervisor_review_jsonb = '{"ratings":{"teaching":"exceeds"}}'::jsonb
     WHERE id = v_review;
    RAISE WARNING 'HOLE: a staff member wrote supervisor_review_jsonb';
  EXCEPTION WHEN check_violation THEN
    v_failed := v_failed + 1;
    RAISE NOTICE 'REFUSED (3/7): staff writing supervisor_review_jsonb';
  END;

  -- 4. Stamping their own approval.
  v_expected := v_expected + 1;
  BEGIN
    UPDATE public.hr_performance_reviews
       SET final_approved_at = now(), final_approved_by = v_profile
     WHERE id = v_review;
    RAISE WARNING 'HOLE: a staff member stamped their own approval';
  EXCEPTION WHEN check_violation THEN
    v_failed := v_failed + 1;
    RAISE NOTICE 'REFUSED (4/7): staff stamping final_approved_*';
  END;

  -- 5. Moving their appraisal into a different round. (The second round was
  --    created above under the admin claim; creating it here would be done as
  --    the team member, which the cycles write policy refuses.)
  v_expected := v_expected + 1;
  BEGIN
    UPDATE public.hr_performance_reviews SET cycle_id = v_other WHERE id = v_review;
    RAISE WARNING 'HOLE: a staff member moved their appraisal to another round';
  EXCEPTION WHEN check_violation THEN
    v_failed := v_failed + 1;
    RAISE NOTICE 'REFUSED (5/7): staff changing cycle_id';
  END;

  -- 6. Submitting a Collegiality Below with no written example.
  v_expected := v_expected + 1;
  BEGIN
    UPDATE public.hr_performance_reviews
       SET self_appraisal_jsonb = '{"ratings":{"teaching":"meets","research":"meets","service":"meets","collegiality":"below"}}'::jsonb,
           status = 'self_submitted'
     WHERE id = v_review;
    RAISE WARNING 'HOLE: a Below in Collegiality was submitted with no example';
  EXCEPTION WHEN check_violation THEN
    v_failed := v_failed + 1;
    RAISE NOTICE 'REFUSED (6/7): Collegiality Below with no example';
  END;

  -- ── And AS THE HEAD OF DEPARTMENT ──────────────────────────────────────
  PERFORM set_config('request.jwt.claim.sub', v_hod::text, true);

  -- 7. A head writing the committee's verdict.
  v_expected := v_expected + 1;
  BEGIN
    UPDATE public.hr_performance_reviews
       SET sedc_review_jsonb = '{"ratings":{"teaching":"below"}}'::jsonb
     WHERE id = v_review;
    RAISE WARNING 'HOLE: a head of department wrote sedc_review_jsonb';
  EXCEPTION WHEN check_violation THEN
    v_failed := v_failed + 1;
    RAISE NOTICE 'REFUSED (7/7): head writing sedc_review_jsonb';
  END;

  IF v_failed = v_expected THEN
    RAISE NOTICE '--- PASS: all % forbidden writes were refused ---', v_expected;
  ELSE
    RAISE EXCEPTION 'FAIL: only % of % forbidden writes were refused', v_failed, v_expected;
  END IF;
END $$;

-- Nothing is kept, whatever happened above.
ROLLBACK;
