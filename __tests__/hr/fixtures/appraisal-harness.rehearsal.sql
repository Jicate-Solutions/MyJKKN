-- ===========================================================================
-- REHEARSAL for 20270505090000_hr_appraisal_checks_on_the_appraisal.sql
--
-- NOT a migration, and deliberately NOT in supabase/migrations/: the deploy
-- wave reads a migration's version from the 14-digit filename prefix, so a
-- rehearsal there would claim the real migration's version. Nothing applies
-- this automatically. The earlier rehearsal for 20270501090100
-- (appraisal-column-guard.rehearsal.sql) still stands and must still pass.
--
-- WHAT IT PROVES
-- The TypeScript tests read the migration as TEXT. This fires it:
--   A. conditions-first on the head's review (the replaced 4081 guard)
--   B. the second-rating guard (who may be asked, who may write what, and
--      that a submitted rating is frozen)
--   E. nobody who can read appraisals (the appraisal key, an admin, a super
--      admin — including HR assigning itself) may be the second rater
--   D. same college only: a rater from another college can be neither asked
--      nor reassigned to, and cannot read the evidence even if a request
--      were planted with the guard switched off
--   C. blindness, under row-level security as the `authenticated` role:
--      the first head and the person appraised read no second rating, the
--      evidence function refuses anyone but the rater, and it withholds the
--      first head's ratings until both are in
--
-- HOW TO RUN IT
-- Against a THROWAWAY or BRANCH database, never production. It rolls back:
--
--     psql "$BRANCH_DB_URL" -v ON_ERROR_STOP=1 -f <this file>
--
-- Every numbered check expects a REFUSAL (or, for reads, nothing). The
-- steps marked "must succeed" set the scene; if one fails the script stops.
-- The last line reads PASS only if every check was refused.
-- ===========================================================================

BEGIN;

DO $$
DECLARE
  v_admin    uuid;
  v_staff    uuid;
  v_profile  uuid;
  v_hod      uuid;
  v_rater    uuid;
  v_inst     uuid;
  v_foreign  uuid;
  v_planted  uuid;
  v_role     uuid;
  v_oldrole  text;
  v_cycle    uuid;
  v_cycle2   uuid;
  v_review   uuid;
  v_draft    uuid;
  v_second   uuid;
  v_n        int;
  v_ev       jsonb;
  v_refused  int := 0;
  v_expected int := 0;
  v_me       text := current_user;

  c_below_bare   constant jsonb :=
    '{"ratings":{"teaching":"below","research":"meets","service":"meets","collegiality":"meets"}}';
  c_below_badwhy constant jsonb :=
    '{"ratings":{"teaching":"below","research":"meets","service":"meets","collegiality":"meets"},
      "conditions":{"teaching":{"missing":["bribes"],"note":"a perfectly long note"}}}';
  c_below_short  constant jsonb :=
    '{"ratings":{"teaching":"below","research":"meets","service":"meets","collegiality":"meets"},
      "conditions":{"teaching":{"missing":["time"],"note":"short"}}}';
  c_below_ok     constant jsonb :=
    '{"ratings":{"teaching":"below","research":"meets","service":"meets","collegiality":"meets"},
      "conditions":{"teaching":{"missing":["time","training"],"note":"No free period all term"}}}';
  c_all_meets    constant jsonb :=
    '{"ratings":{"teaching":"meets","research":"meets","service":"meets","collegiality":"meets"}}';
  c_incomplete   constant jsonb :=
    '{"ratings":{"teaching":"meets","research":"meets","service":"meets"}}';
BEGIN
  -- ── Setup, as a super admin ─────────────────────────────────────────────
  SELECT id INTO v_admin FROM public.profiles WHERE is_super_admin = true LIMIT 1;
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'No super admin profile found — cannot set up the rehearsal';
  END IF;
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);

  SELECT s.id, s.profile_id, d.head_of_department_id, s.institution_id
    INTO v_staff, v_profile, v_hod, v_inst
  FROM public.staff s
  JOIN public.departments d ON d.id = s.department_id
  WHERE s.profile_id IS NOT NULL
    AND d.head_of_department_id IS NOT NULL
    AND d.head_of_department_id <> s.profile_id
    AND d.head_of_department_id <> v_admin
    AND s.profile_id <> v_admin
    AND s.institution_id IS NOT NULL
  LIMIT 1;
  IF v_staff IS NULL THEN
    RAISE EXCEPTION 'No staff member with a department head found — cannot rehearse';
  END IF;

  -- The second rater: another team member of the SAME college, not the
  -- person, not their head, not a super admin.
  SELECT s.profile_id INTO v_rater
  FROM public.staff s
  JOIN public.profiles p ON p.id = s.profile_id
  WHERE s.institution_id = v_inst
    AND s.profile_id NOT IN (v_profile, v_hod, v_admin)
    AND COALESCE(p.is_super_admin, false) = false
  LIMIT 1;
  IF v_rater IS NULL THEN
    RAISE EXCEPTION 'No same-college profile available to act as second rater — cannot rehearse';
  END IF;

  -- Someone from ANOTHER college, with no team-member record in this one.
  SELECT s.profile_id INTO v_foreign
  FROM public.staff s
  JOIN public.profiles p ON p.id = s.profile_id
  WHERE s.institution_id IS NOT NULL AND s.institution_id <> v_inst
    AND COALESCE(p.is_super_admin, false) = false
    AND NOT EXISTS (SELECT 1 FROM public.staff x WHERE x.profile_id = s.profile_id AND x.institution_id = v_inst)
  LIMIT 1;
  IF v_foreign IS NULL THEN
    RAISE EXCEPTION 'No profile from another college found — cannot rehearse the college rule';
  END IF;

  INSERT INTO public.hr_performance_review_cycles (cycle_year, start_date, end_date, status, description)
  VALUES (9996, '2096-07-01', '2097-06-30', 'open', 'REHEARSAL — rolled back')
  RETURNING id INTO v_cycle;
  INSERT INTO public.hr_performance_review_cycles (cycle_year, start_date, end_date, status, description)
  VALUES (9995, '2095-07-01', '2096-06-30', 'draft', 'REHEARSAL — rolled back')
  RETURNING id INTO v_cycle2;

  -- A submitted appraisal (must succeed), and a draft one in another round.
  INSERT INTO public.hr_performance_reviews
    (cycle_id, staff_id, status, self_appraisal_jsonb, self_submitted_at)
  VALUES (v_cycle, v_staff, 'self_submitted', c_all_meets, now())
  RETURNING id INTO v_review;
  INSERT INTO public.hr_performance_reviews (cycle_id, staff_id, status)
  VALUES (v_cycle2, v_staff, 'draft')
  RETURNING id INTO v_draft;

  -- ════════════════════════════════════════════════════════════════════════
  -- A. Conditions first, on the head's review
  -- ════════════════════════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_hod::text, true);

  v_expected := v_expected + 1;
  BEGIN
    UPDATE public.hr_performance_reviews
       SET supervisor_review_jsonb = c_below_bare, status = 'supervisor_reviewed',
           supervisor_reviewed_at = now()
     WHERE id = v_review;
    RAISE WARNING 'HOLE (1): a head rated Below without saying what the college did not provide';
  EXCEPTION WHEN check_violation THEN
    v_refused := v_refused + 1;
    RAISE NOTICE 'REFUSED (1): head Below with no conditions';
  END;

  v_expected := v_expected + 1;
  BEGIN
    UPDATE public.hr_performance_reviews
       SET supervisor_review_jsonb = c_below_badwhy, status = 'supervisor_reviewed',
           supervisor_reviewed_at = now()
     WHERE id = v_review;
    RAISE WARNING 'HOLE (2): a Below was accepted with an unknown reason';
  EXCEPTION WHEN check_violation THEN
    v_refused := v_refused + 1;
    RAISE NOTICE 'REFUSED (2): head Below with an unknown reason';
  END;

  v_expected := v_expected + 1;
  BEGIN
    UPDATE public.hr_performance_reviews
       SET supervisor_review_jsonb = c_below_short, status = 'supervisor_reviewed',
           supervisor_reviewed_at = now()
     WHERE id = v_review;
    RAISE WARNING 'HOLE (3): a Below was accepted with a note under 10 characters';
  EXCEPTION WHEN check_violation THEN
    v_refused := v_refused + 1;
    RAISE NOTICE 'REFUSED (3): head Below with a too-short note';
  END;

  -- ════════════════════════════════════════════════════════════════════════
  -- B. Asking for a second rating (as HR)
  -- ════════════════════════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);

  v_expected := v_expected + 1;
  BEGIN
    INSERT INTO public.hr_performance_review_second_ratings (review_id, rater_id)
    VALUES (v_review, v_profile);
    RAISE WARNING 'HOLE (4): the person appraised was made their own second rater';
  EXCEPTION WHEN check_violation THEN
    v_refused := v_refused + 1;
    RAISE NOTICE 'REFUSED (4): subject as own second rater';
  END;

  v_expected := v_expected + 1;
  BEGIN
    INSERT INTO public.hr_performance_review_second_ratings (review_id, rater_id)
    VALUES (v_review, v_hod);
    RAISE WARNING 'HOLE (5): the first head was made the second rater';
  EXCEPTION WHEN check_violation THEN
    v_refused := v_refused + 1;
    RAISE NOTICE 'REFUSED (5): first head as second rater';
  END;

  v_expected := v_expected + 1;
  BEGIN
    INSERT INTO public.hr_performance_review_second_ratings (review_id, rater_id, rating_jsonb)
    VALUES (v_review, v_rater, c_all_meets);
    RAISE WARNING 'HOLE (6): a request arrived already carrying a rating';
  EXCEPTION WHEN check_violation THEN
    v_refused := v_refused + 1;
    RAISE NOTICE 'REFUSED (6): request pre-filled with a rating';
  END;

  v_expected := v_expected + 1;
  BEGIN
    INSERT INTO public.hr_performance_review_second_ratings (review_id, rater_id)
    VALUES (v_draft, v_rater);
    RAISE WARNING 'HOLE (7): a second rating was asked for on a draft';
  EXCEPTION WHEN check_violation THEN
    v_refused := v_refused + 1;
    RAISE NOTICE 'REFUSED (7): second rating on a draft';
  END;

  v_expected := v_expected + 1;
  BEGIN
    INSERT INTO public.hr_performance_review_second_ratings (review_id, rater_id)
    VALUES (v_review, v_foreign);
    RAISE WARNING 'HOLE (21): a rater from another college was asked';
  EXCEPTION WHEN check_violation THEN
    v_refused := v_refused + 1;
    RAISE NOTICE 'REFUSED (21): second rater from another college';
  END;

  -- ── Nobody who can read appraisals may be the second rater ─────────────
  -- Each refusal must be for THIS reason (checked on the message), not a
  -- different rule that happens to fire first.

  -- 24. A holder of the appraisal-manage key (given through a role).
  INSERT INTO public.custom_roles (role_key, role_name, permissions)
  VALUES ('rehearsal_appraisal_hr', 'REHEARSAL — rolled back',
          '{"hr.performance_reviews.manage": true}'::jsonb)
  RETURNING id INTO v_role;
  INSERT INTO public.user_roles (user_id, role_id) VALUES (v_rater, v_role);
  v_expected := v_expected + 1;
  BEGIN
    INSERT INTO public.hr_performance_review_second_ratings (review_id, rater_id)
    VALUES (v_review, v_rater);
    RAISE WARNING 'HOLE (24): a holder of the appraisal key was made second rater';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM LIKE '%can read appraisals%' THEN
      v_refused := v_refused + 1;
      RAISE NOTICE 'REFUSED (24): key holder as second rater';
    ELSE
      RAISE WARNING 'HOLE (24): refused, but for another reason: %', SQLERRM;
    END IF;
  END;
  DELETE FROM public.user_roles WHERE user_id = v_rater AND role_id = v_role;

  -- 25. An admin.
  SELECT role INTO v_oldrole FROM public.profiles WHERE id = v_rater;
  UPDATE public.profiles SET role = 'administrator' WHERE id = v_rater;
  v_expected := v_expected + 1;
  BEGIN
    INSERT INTO public.hr_performance_review_second_ratings (review_id, rater_id)
    VALUES (v_review, v_rater);
    RAISE WARNING 'HOLE (25): an admin was made second rater';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM LIKE '%can read appraisals%' THEN
      v_refused := v_refused + 1;
      RAISE NOTICE 'REFUSED (25): admin as second rater';
    ELSE
      RAISE WARNING 'HOLE (25): refused, but for another reason: %', SQLERRM;
    END IF;
  END;
  UPDATE public.profiles SET role = v_oldrole WHERE id = v_rater;

  -- 26. HR assigning itself (the caller here is the super admin).
  v_expected := v_expected + 1;
  BEGIN
    INSERT INTO public.hr_performance_review_second_ratings (review_id, rater_id)
    VALUES (v_review, v_admin);
    RAISE WARNING 'HOLE (26): the assigner made themselves second rater';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM LIKE '%can read appraisals%' THEN
      v_refused := v_refused + 1;
      RAISE NOTICE 'REFUSED (26): assigner assigning themselves';
    ELSE
      RAISE WARNING 'HOLE (26): refused, but for another reason: %', SQLERRM;
    END IF;
  END;

  -- must succeed
  INSERT INTO public.hr_performance_review_second_ratings (review_id, rater_id)
  VALUES (v_review, v_rater)
  RETURNING id INTO v_second;

  -- 27. Nor can HR switch an existing request to itself.
  v_expected := v_expected + 1;
  BEGIN
    UPDATE public.hr_performance_review_second_ratings SET rater_id = v_admin WHERE id = v_second;
    RAISE WARNING 'HOLE (27): HR reassigned the request to itself';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM LIKE '%can read appraisals%' THEN
      v_refused := v_refused + 1;
      RAISE NOTICE 'REFUSED (27): reassigning to someone who can read appraisals';
    ELSE
      RAISE WARNING 'HOLE (27): refused, but for another reason: %', SQLERRM;
    END IF;
  END;

  v_expected := v_expected + 1;
  BEGIN
    UPDATE public.hr_performance_review_second_ratings SET rater_id = v_foreign WHERE id = v_second;
    RAISE WARNING 'HOLE (22): HR reassigned the request to someone from another college';
  EXCEPTION WHEN check_violation THEN
    v_refused := v_refused + 1;
    RAISE NOTICE 'REFUSED (22): reassigning to another college';
  END;

  -- Defence in depth: plant a cross-college request with the guard switched
  -- off (owner-only, rolled back with everything else), then read the
  -- evidence AS that other-college rater. The evidence function must refuse
  -- on its own.
  EXECUTE 'ALTER TABLE public.hr_performance_review_second_ratings DISABLE TRIGGER trg_hr_second_rating_guard';
  INSERT INTO public.hr_performance_review_second_ratings (review_id, rater_id, institution_id)
  VALUES (v_draft, v_foreign, v_inst)
  RETURNING id INTO v_planted;
  EXECUTE 'ALTER TABLE public.hr_performance_review_second_ratings ENABLE TRIGGER trg_hr_second_rating_guard';

  -- ════════════════════════════════════════════════════════════════════════
  -- C1. Blindness before either is in (row-level security, as authenticated)
  -- ════════════════════════════════════════════════════════════════════════
  -- The head hands on properly first (must succeed), so only the second
  -- rating is outstanding: the first head's ratings now EXIST and must still
  -- be withheld from the rater.
  PERFORM set_config('request.jwt.claim.sub', v_hod::text, true);
  UPDATE public.hr_performance_reviews
     SET supervisor_review_jsonb = c_below_ok, status = 'supervisor_reviewed',
         supervisor_reviewed_at = now()
   WHERE id = v_review;

  PERFORM set_config('role', 'authenticated', true);

  v_expected := v_expected + 1;
  SELECT count(*) INTO v_n FROM public.hr_performance_review_second_ratings WHERE review_id = v_review;
  IF v_n = 0 THEN
    v_refused := v_refused + 1;
    RAISE NOTICE 'REFUSED (8): first head reads no second rating';
  ELSE
    RAISE WARNING 'HOLE (8): the first head can read the second rating';
  END IF;

  v_expected := v_expected + 1;
  BEGIN
    v_ev := public.fn_hr_second_rating_evidence(v_second);
    RAISE WARNING 'HOLE (9): the first head got the second rater''s evidence view';
  EXCEPTION WHEN insufficient_privilege THEN
    v_refused := v_refused + 1;
    RAISE NOTICE 'REFUSED (9): evidence refused to the first head';
  END;

  PERFORM set_config('request.jwt.claim.sub', v_profile::text, true);
  v_expected := v_expected + 1;
  SELECT count(*) INTO v_n FROM public.hr_performance_review_second_ratings WHERE review_id = v_review;
  IF v_n = 0 THEN
    v_refused := v_refused + 1;
    RAISE NOTICE 'REFUSED (10): the person appraised reads no second rating';
  ELSE
    RAISE WARNING 'HOLE (10): the person appraised can read the second rating';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_foreign::text, true);
  v_expected := v_expected + 1;
  BEGIN
    v_ev := public.fn_hr_second_rating_evidence(v_planted);
    RAISE WARNING 'HOLE (23): a rater from another college read the self-appraisal';
  EXCEPTION WHEN insufficient_privilege THEN
    v_refused := v_refused + 1;
    RAISE NOTICE 'REFUSED (23): evidence refused to a rater from another college';
  END;

  -- 28. A rater given the appraisal key AFTER being asked is refused the
  --     evidence too: they can read the head's rating elsewhere now.
  PERFORM set_config('role', v_me, true);
  INSERT INTO public.user_roles (user_id, role_id) VALUES (v_rater, v_role);
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_rater::text, true);
  v_expected := v_expected + 1;
  BEGIN
    v_ev := public.fn_hr_second_rating_evidence(v_second);
    RAISE WARNING 'HOLE (28): a rater who can read appraisals got the evidence view';
  EXCEPTION WHEN insufficient_privilege THEN
    v_refused := v_refused + 1;
    RAISE NOTICE 'REFUSED (28): evidence refused to a rater who holds the appraisal key';
  END;
  PERFORM set_config('role', v_me, true);
  DELETE FROM public.user_roles WHERE user_id = v_rater AND role_id = v_role;
  PERFORM set_config('role', 'authenticated', true);

  PERFORM set_config('request.jwt.claim.sub', v_rater::text, true);
  v_expected := v_expected + 1;
  v_ev := public.fn_hr_second_rating_evidence(v_second);
  IF (v_ev -> 'first_head_ratings') IS NULL OR jsonb_typeof(v_ev -> 'first_head_ratings') = 'null' THEN
    v_refused := v_refused + 1;
    RAISE NOTICE 'REFUSED (11): first head''s ratings withheld from the rater before both are in';
  ELSE
    RAISE WARNING 'HOLE (11): the rater saw the first head''s ratings before submitting';
  END IF;
  IF (v_ev -> 'self_appraisal') IS NULL THEN
    RAISE EXCEPTION 'SETUP: the rater did not receive the self-appraisal evidence';
  END IF;

  PERFORM set_config('role', v_me, true);

  -- ════════════════════════════════════════════════════════════════════════
  -- B2. Writing the second rating
  -- ════════════════════════════════════════════════════════════════════════
  -- As the rater:
  v_expected := v_expected + 1;
  BEGIN
    UPDATE public.hr_performance_review_second_ratings
       SET rating_jsonb = c_below_bare, submitted_at = now()
     WHERE id = v_second;
    RAISE WARNING 'HOLE (12): the second rater submitted a Below without conditions';
  EXCEPTION WHEN check_violation THEN
    v_refused := v_refused + 1;
    RAISE NOTICE 'REFUSED (12): second rater Below with no conditions';
  END;

  v_expected := v_expected + 1;
  BEGIN
    UPDATE public.hr_performance_review_second_ratings
       SET rating_jsonb = c_incomplete, submitted_at = now()
     WHERE id = v_second;
    RAISE WARNING 'HOLE (13): an incomplete second rating was submitted';
  EXCEPTION WHEN check_violation THEN
    v_refused := v_refused + 1;
    RAISE NOTICE 'REFUSED (13): incomplete second rating';
  END;

  v_expected := v_expected + 1;
  BEGIN
    UPDATE public.hr_performance_review_second_ratings SET rater_id = v_admin WHERE id = v_second;
    RAISE WARNING 'HOLE (14): the rater handed the rating to someone else';
  EXCEPTION WHEN check_violation THEN
    v_refused := v_refused + 1;
    RAISE NOTICE 'REFUSED (14): rater reassigning';
  END;

  -- As HR, who may not write the rating itself:
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  v_expected := v_expected + 1;
  BEGIN
    UPDATE public.hr_performance_review_second_ratings SET rating_jsonb = c_all_meets WHERE id = v_second;
    RAISE WARNING 'HOLE (15): HR wrote the second rating';
  EXCEPTION WHEN check_violation THEN
    v_refused := v_refused + 1;
    RAISE NOTICE 'REFUSED (15): HR writing the rating';
  END;

  v_expected := v_expected + 1;
  BEGIN
    UPDATE public.hr_performance_review_second_ratings SET submitted_at = now() WHERE id = v_second;
    RAISE WARNING 'HOLE (16): HR submitted on the rater''s behalf';
  EXCEPTION WHEN check_violation THEN
    v_refused := v_refused + 1;
    RAISE NOTICE 'REFUSED (16): HR submitting';
  END;

  -- As the first head, who is not the rater and not HR:
  PERFORM set_config('request.jwt.claim.sub', v_hod::text, true);
  v_expected := v_expected + 1;
  BEGIN
    UPDATE public.hr_performance_review_second_ratings SET rating_jsonb = c_all_meets WHERE id = v_second;
    RAISE WARNING 'HOLE (17): the first head wrote the second rating';
  EXCEPTION WHEN check_violation THEN
    v_refused := v_refused + 1;
    RAISE NOTICE 'REFUSED (17): first head writing the second rating';
  END;

  -- The rater submits properly (must succeed).
  PERFORM set_config('request.jwt.claim.sub', v_rater::text, true);
  UPDATE public.hr_performance_review_second_ratings
     SET rating_jsonb = c_below_ok, submitted_at = now()
   WHERE id = v_second;

  -- ════════════════════════════════════════════════════════════════════════
  -- B3. A submitted rating is frozen
  -- ════════════════════════════════════════════════════════════════════════
  v_expected := v_expected + 1;
  BEGIN
    UPDATE public.hr_performance_review_second_ratings SET rating_jsonb = c_all_meets WHERE id = v_second;
    RAISE WARNING 'HOLE (18): the rater changed a submitted rating';
  EXCEPTION WHEN check_violation THEN
    v_refused := v_refused + 1;
    RAISE NOTICE 'REFUSED (18): rater editing after submit';
  END;

  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  v_expected := v_expected + 1;
  BEGIN
    UPDATE public.hr_performance_review_second_ratings SET rater_id = v_admin WHERE id = v_second;
    RAISE WARNING 'HOLE (19): HR swapped the rater after submit';
  EXCEPTION WHEN check_violation THEN
    v_refused := v_refused + 1;
    RAISE NOTICE 'REFUSED (19): HR reassigning after submit';
  END;

  -- HR cannot delete a submitted rating to improve the report (RLS).
  PERFORM set_config('role', 'authenticated', true);
  v_expected := v_expected + 1;
  DELETE FROM public.hr_performance_review_second_ratings WHERE id = v_second;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    v_refused := v_refused + 1;
    RAISE NOTICE 'REFUSED (20): HR deleting a submitted second rating';
  ELSE
    RAISE WARNING 'HOLE (20): HR deleted a submitted second rating';
  END IF;

  -- Once both are in, the rater may see the first head's ratings (must succeed).
  PERFORM set_config('request.jwt.claim.sub', v_rater::text, true);
  v_ev := public.fn_hr_second_rating_evidence(v_second);
  IF jsonb_typeof(v_ev -> 'first_head_ratings') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'SETUP: once both were in, the rater still could not see the first head''s ratings';
  END IF;
  RAISE NOTICE 'ALLOWED: both in, the rater sees the first head''s ratings';

  PERFORM set_config('role', v_me, true);

  IF v_refused = v_expected THEN
    RAISE NOTICE '--- PASS: all % forbidden actions were refused ---', v_expected;
  ELSE
    RAISE EXCEPTION 'FAIL: only % of % forbidden actions were refused', v_refused, v_expected;
  END IF;
END $$;

-- Nothing is kept, whatever happened above.
ROLLBACK;
