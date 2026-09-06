-- =============================================================================
-- BATTERY — reveal cadence + sealed comments (20260731210000)
-- Runs AFTER the migration in one Mgmt-API batch, then ROLLBACK. Role/GUC
-- discipline as always: elevate to the session user for arranges (ROW_COUNT
-- asserted), impersonate only around the RPC under test, re-assert identity
-- after switches, jsonb_set on the REAL config row, explicit timestamps
-- (now() is txn-frozen).
--
-- The cycle is created through the REAL creation RPC and self-scored through
-- the REAL scoring RPC as the owner — no hand-built cycle rows.
-- =============================================================================

DO $bat$
DECLARE
  v_fac  uuid := '65618434-70bd-4453-a171-f0e13f571bd4';  -- test.faculty
  v_hod  uuid := '88415a49-46f1-4ef1-b43d-70db455aa886';  -- test.hod
  v_stu  uuid := '6382240f-1368-4b9d-a317-5325a579cbdf';  -- test.student
  v_sa   uuid := '1d35bef2-2b62-4f64-b2d0-196eb8047fac';  -- test.superadmin
  v_admin text := current_user;
  v_cycle uuid;
  v_codes text[];
  v_codeA text; v_codeB text; v_codeC text;
  v_wt timestamptz := date_trunc('week',  now());
  v_mt timestamptz := date_trunc('month', now());
  v_mid timestamptz;                 -- inside [min(wt,mt), max(wt,mt)) — the zone
  v_weekly_includes_B boolean;       -- true when weekly cutoff admits the zone
  v_old timestamptz := now() - interval '40 days';  -- before BOTH cutoffs
  j jsonb; itm jsonb; n int; t text;
BEGIN
  ---------------------------------------------------------------------------
  -- B1: surface + grants.
  ---------------------------------------------------------------------------
  IF (SELECT count(*) FROM public.platform_policies
      WHERE policy_key='classroom_practice.reveal' AND scope_type='global') <> 1 THEN
    RAISE EXCEPTION 'B1 config row missing';
  END IF;
  FOREACH t IN ARRAY ARRAY[
    'public.fn_classroom_practice_window_cutoff(text,timestamptz)',
    'public.fn_classroom_practice_compare(uuid)',
    'public.fn_classroom_practice_sealed_comments(uuid)'
  ] LOOP
    IF to_regprocedure(t) IS NULL THEN RAISE EXCEPTION 'B1 missing %', t; END IF;
    IF has_function_privilege('anon', to_regprocedure(t), 'EXECUTE') THEN
      RAISE EXCEPTION 'B1 anon can execute %', t;
    END IF;
  END LOOP;
  IF has_function_privilege('authenticated',
       to_regprocedure('public.fn_classroom_practice_window_cutoff(text,timestamptz)'), 'EXECUTE') THEN
    RAISE EXCEPTION 'B1 helper callable by authenticated — must be internal';
  END IF;
  IF NOT has_function_privilege('authenticated',
       to_regprocedure('public.fn_classroom_practice_sealed_comments(uuid)'), 'EXECUTE') THEN
    RAISE EXCEPTION 'B1 comments reader not callable by authenticated';
  END IF;
  RAISE NOTICE 'B1 ok — objects + grant surface';

  ---------------------------------------------------------------------------
  -- B2: cycle via the REAL creation RPC (self-open as the owner).
  ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_fac, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  IF auth.uid() IS DISTINCT FROM v_fac THEN RAISE EXCEPTION 'B2 identity'; END IF;

  j := public.fn_carre_create_classroom_audit('Battery Reveal Cycle');
  IF COALESCE(j->>'success','') <> 'true' THEN RAISE EXCEPTION 'B2 create failed: %', j; END IF;
  v_cycle := (j->>'cycle_id')::uuid;

  -- GATE 1 holds before self-scoring, and already names the cadence.
  j := public.fn_classroom_practice_compare(v_cycle);
  IF COALESCE(j->>'reason','') <> 'self_score_incomplete' THEN
    RAISE EXCEPTION 'B2 gate-1 not holding: %', j;
  END IF;
  IF j->>'window_unit' IS NULL THEN RAISE EXCEPTION 'B2 window_unit missing on locked shape'; END IF;

  -- Self-score all 13 through the REAL scoring RPC.
  PERFORM set_config('role', v_admin, true);
  SELECT array_agg(e->>'code') INTO v_codes
  FROM public.audit_cycles c,
       jsonb_array_elements(c.parameter_catalog_snapshot->'parameters') e
  WHERE c.id = v_cycle;
  IF array_length(v_codes,1) <> 13 THEN RAISE EXCEPTION 'B2 snapshot has % codes', array_length(v_codes,1); END IF;
  v_codeA := v_codes[1]; v_codeB := v_codes[2]; v_codeC := v_codes[3];

  PERFORM set_config('role', 'authenticated', true);
  IF auth.uid() IS DISTINCT FROM v_fac THEN RAISE EXCEPTION 'B2 identity lost'; END IF;
  FOREACH t IN ARRAY v_codes LOOP
    PERFORM public.fn_carre_upsert_score(v_cycle, t, 3::smallint, NULL);
  END LOOP;
  j := public.fn_classroom_practice_compare(v_cycle);
  IF (j->>'self_scored')::int <> 13 THEN RAISE EXCEPTION 'B2 self_scored=%', j->>'self_scored'; END IF;
  RAISE NOTICE 'B2 ok — real create + real 13-item self-score';

  ---------------------------------------------------------------------------
  -- B3: impressions. Item A: 3 learners, old (revealable under BOTH cadences,
  -- score 1 vs self 3 => the gap). Item B: 3 learners inside the weekly/monthly
  -- disagreement zone. Item C: 3 answers from ONE learner (k-floor).
  ---------------------------------------------------------------------------
  IF v_wt = v_mt THEN
    v_mid := NULL;  -- month began on a Monday: the zone is empty this week
  ELSE
    v_mid := LEAST(v_wt, v_mt) + ((GREATEST(v_wt, v_mt) - LEAST(v_wt, v_mt)) / 2);
    v_weekly_includes_B := v_wt > v_mt;  -- zone below the weekly cutoff only
  END IF;

  PERFORM set_config('role', v_admin, true);
  -- Backdate the cycle: the compare window opens at snapshot.created_at, and a
  -- cycle created inside this frozen txn would have an EMPTY window (creation
  -- instant is now(), every cutoff is in the past). A 60-day-old cycle is the
  -- honest simulation.
  UPDATE public.audit_cycles
     SET parameter_catalog_snapshot = jsonb_set(parameter_catalog_snapshot,
           '{created_at}', to_jsonb(now() - interval '60 days'))
   WHERE id = v_cycle;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'B3 backdate failed'; END IF;

  INSERT INTO public.carre_micro_impressions
    (institution_id, learner_id, teacher_email, parameter_code,
     attendance_date, timetable_id, period_id, offered_at, answered_at, score)
  SELECT '183847c5-be1b-4903-86eb-bbc20c213071', gen_random_uuid(),
         'test.faculty@jkkn.ac.in', v_codeA,
         v_old::date, gen_random_uuid(), 'BATR-P1', v_old, v_old, 1
  FROM generate_series(1,3);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 3 THEN RAISE EXCEPTION 'B3 arrange A: %', n; END IF;

  IF v_mid IS NOT NULL THEN
    INSERT INTO public.carre_micro_impressions
      (institution_id, learner_id, teacher_email, parameter_code,
       attendance_date, timetable_id, period_id, offered_at, answered_at, score)
    SELECT '183847c5-be1b-4903-86eb-bbc20c213071', gen_random_uuid(),
           'test.faculty@jkkn.ac.in', v_codeB,
           v_mid::date, gen_random_uuid(), 'BATR-P2', v_mid, v_mid, 4
    FROM generate_series(1,3);
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 3 THEN RAISE EXCEPTION 'B3 arrange B: %', n; END IF;
  END IF;

  -- One learner, three answers: must stay sealed (voices = 1).
  INSERT INTO public.carre_micro_impressions
    (institution_id, learner_id, teacher_email, parameter_code,
     attendance_date, timetable_id, period_id, offered_at, answered_at, score)
  SELECT '183847c5-be1b-4903-86eb-bbc20c213071',
         'aaaaaaaa-0000-0000-0000-00000000000a',
         'test.faculty@jkkn.ac.in', v_codeC,
         (v_old - interval '1 day')::date, gen_random_uuid(), 'BATR-P3',
         v_old - (s || ' hours')::interval, v_old, 4
  FROM generate_series(1,3) s;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 3 THEN RAISE EXCEPTION 'B3 arrange C: %', n; END IF;

  ---------------------------------------------------------------------------
  -- B4: SMALL class (7-9 distinct learners < 20) => MONTHLY window.
  ---------------------------------------------------------------------------
  PERFORM set_config('role', 'authenticated', true);
  IF auth.uid() IS DISTINCT FROM v_fac THEN RAISE EXCEPTION 'B4 identity'; END IF;
  j := public.fn_classroom_practice_compare(v_cycle);
  IF COALESCE((j->>'locked')::boolean, true) THEN RAISE EXCEPTION 'B4 locked: %', j; END IF;
  IF j->>'window_unit' <> 'month' THEN RAISE EXCEPTION 'B4 unit=% (small class must be month)', j->>'window_unit'; END IF;

  SELECT x INTO itm FROM jsonb_array_elements(j->'items') x WHERE x->>'code' = v_codeA;
  IF (itm->>'voices')::int <> 3 OR (itm->>'learner_median')::numeric <> 1 THEN
    RAISE EXCEPTION 'B4 item A wrong: %', itm;
  END IF;
  SELECT x INTO itm FROM jsonb_array_elements(j->'items') x WHERE x->>'code' = v_codeC;
  IF (itm->>'voices')::int <> 1 OR itm->>'learner_median' IS NOT NULL THEN
    RAISE EXCEPTION 'B4 k-floor by learner broken: %', itm;
  END IF;
  IF v_mid IS NOT NULL THEN
    SELECT x INTO itm FROM jsonb_array_elements(j->'items') x WHERE x->>'code' = v_codeB;
    -- Under MONTHLY the zone is admitted only when the month cutoff is above it.
    IF v_weekly_includes_B THEN
      IF (itm->>'voices')::int <> 0 THEN RAISE EXCEPTION 'B4 zone leaked into monthly: %', itm; END IF;
    ELSE
      IF (itm->>'voices')::int <> 3 THEN RAISE EXCEPTION 'B4 zone missing from monthly: %', itm; END IF;
    END IF;
  END IF;
  RAISE NOTICE 'B4 ok — monthly window for a small class; k-floor learner-distinct';

  ---------------------------------------------------------------------------
  -- B5: flip the knob (threshold -> 3 via jsonb_set on the REAL row) => WEEKLY.
  ---------------------------------------------------------------------------
  PERFORM set_config('role', v_admin, true);
  UPDATE public.platform_policies
     SET value = jsonb_set(value, '{small_class_threshold}', '3'::jsonb)
   WHERE policy_key='classroom_practice.reveal' AND scope_type='global' AND scope_id IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'B5 config flip failed'; END IF;

  PERFORM set_config('role', 'authenticated', true);
  IF auth.uid() IS DISTINCT FROM v_fac THEN RAISE EXCEPTION 'B5 identity'; END IF;
  j := public.fn_classroom_practice_compare(v_cycle);
  IF j->>'window_unit' <> 'week' THEN RAISE EXCEPTION 'B5 unit=% after flip', j->>'window_unit'; END IF;
  IF v_mid IS NOT NULL THEN
    SELECT x INTO itm FROM jsonb_array_elements(j->'items') x WHERE x->>'code' = v_codeB;
    IF v_weekly_includes_B THEN
      IF (itm->>'voices')::int <> 3 THEN RAISE EXCEPTION 'B5 zone missing from weekly: %', itm; END IF;
    ELSE
      IF (itm->>'voices')::int <> 0 THEN RAISE EXCEPTION 'B5 zone leaked into weekly: %', itm; END IF;
    END IF;
  END IF;

  PERFORM set_config('role', v_admin, true);
  UPDATE public.platform_policies
     SET value = jsonb_set(value, '{small_class_threshold}', '20'::jsonb)
   WHERE policy_key='classroom_practice.reveal' AND scope_type='global' AND scope_id IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'B5 config restore failed'; END IF;
  RAISE NOTICE 'B5 ok — cadence follows the config knob, both directions';

  ---------------------------------------------------------------------------
  -- B6: sealed comments. Two in the completed window, one in the CURRENT
  -- window (must never appear). Owner refused first; hod refused; principal
  -- (same institution) reads; wrong-institution principal refused; Director
  -- (super admin) reads; learner identity absent from the payload.
  ---------------------------------------------------------------------------
  INSERT INTO public.carre_micro_impressions
    (institution_id, learner_id, teacher_email, parameter_code,
     attendance_date, timetable_id, period_id, offered_at, answered_at, score, sealed_comment)
  VALUES
    ('183847c5-be1b-4903-86eb-bbc20c213071', gen_random_uuid(), 'test.faculty@jkkn.ac.in',
     v_codeA, v_old::date, gen_random_uuid(), 'BATR-P4', v_old, v_old, 2,
     'Please slow down in the middle third of the session'),
    ('183847c5-be1b-4903-86eb-bbc20c213071', gen_random_uuid(), 'test.faculty@jkkn.ac.in',
     v_codeB, v_old::date, gen_random_uuid(), 'BATR-P5', v_old, v_old, 2,
     'The examples land, the theory does not'),
    ('183847c5-be1b-4903-86eb-bbc20c213071', gen_random_uuid(), 'test.faculty@jkkn.ac.in',
     v_codeA, (now())::date, gen_random_uuid(), 'BATR-P6', now() - interval '1 hour',
     now() - interval '1 hour', 2, 'CURRENT WINDOW — must stay sealed');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 3 THEN RAISE EXCEPTION 'B6 arrange comments: %', n; END IF;

  -- Owner refused FIRST, whatever else they hold.
  PERFORM set_config('role', 'authenticated', true);
  IF auth.uid() IS DISTINCT FROM v_fac THEN RAISE EXCEPTION 'B6 identity fac'; END IF;
  j := public.fn_classroom_practice_sealed_comments(v_cycle);
  IF COALESCE(j->>'reason','') <> 'owner_never_reads_comments' THEN
    RAISE EXCEPTION 'B6 owner not refused: %', j;
  END IF;

  -- An hod is neither Principal nor Director.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_hod, 'role', 'authenticated')::text, true);
  IF auth.uid() IS DISTINCT FROM v_hod THEN RAISE EXCEPTION 'B6 identity hod'; END IF;
  j := public.fn_classroom_practice_sealed_comments(v_cycle);
  IF COALESCE(j->>'reason','') <> 'principal_or_director_only' THEN
    RAISE EXCEPTION 'B6 hod not refused: %', j;
  END IF;

  -- Same person AS a principal (rolled-back role change), same institution.
  PERFORM set_config('role', v_admin, true);
  UPDATE public.profiles SET role='principal' WHERE id = v_hod;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'B6 role change failed'; END IF;
  PERFORM set_config('role', 'authenticated', true);
  IF auth.uid() IS DISTINCT FROM v_hod THEN RAISE EXCEPTION 'B6 identity principal'; END IF;
  j := public.fn_classroom_practice_sealed_comments(v_cycle);
  IF COALESCE((j->>'locked')::boolean, true) THEN RAISE EXCEPTION 'B6 principal refused: %', j; END IF;
  IF jsonb_array_length(j->'comments') <> 2 THEN
    RAISE EXCEPTION 'B6 comments=% (expected 2 — current window must stay sealed)', jsonb_array_length(j->'comments');
  END IF;
  IF (j->'comments')::text ILIKE '%learner%' OR (j->'comments')::text ILIKE '%CURRENT WINDOW%' THEN
    RAISE EXCEPTION 'B6 payload leaked: %', j->'comments';
  END IF;
  IF j->'comments'->0->>'window_label' IS NULL THEN RAISE EXCEPTION 'B6 window label missing'; END IF;

  -- Wrong institution: the permission is not a passport across tenants.
  PERFORM set_config('role', v_admin, true);
  -- profiles.institution_id is FK-checked: use a REAL other institution.
  UPDATE public.profiles
     SET institution_id = (SELECT i.id FROM public.institutions i
                           WHERE i.id <> '183847c5-be1b-4903-86eb-bbc20c213071' LIMIT 1)
   WHERE id = v_hod;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'B6 inst change failed'; END IF;
  PERFORM set_config('role', 'authenticated', true);
  IF auth.uid() IS DISTINCT FROM v_hod THEN RAISE EXCEPTION 'B6 identity principal-2'; END IF;
  j := public.fn_classroom_practice_sealed_comments(v_cycle);
  IF COALESCE(j->>'reason','') <> 'forbidden' THEN
    RAISE EXCEPTION 'B6 cross-institution principal not refused: %', j;
  END IF;

  -- Director (super admin) reads across.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_sa, 'role', 'authenticated')::text, true);
  IF auth.uid() IS DISTINCT FROM v_sa THEN RAISE EXCEPTION 'B6 identity sa'; END IF;
  j := public.fn_classroom_practice_sealed_comments(v_cycle);
  IF COALESCE((j->>'locked')::boolean, true) OR jsonb_array_length(j->'comments') <> 2 THEN
    RAISE EXCEPTION 'B6 director path wrong: %', j;
  END IF;
  RAISE NOTICE 'B6 ok — comments: owner/hod/cross-inst refused; principal + director read 2; current window sealed';

  ---------------------------------------------------------------------------
  -- B7: a learner gets nothing anywhere.
  ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_stu, 'role', 'authenticated')::text, true);
  IF auth.uid() IS DISTINCT FROM v_stu THEN RAISE EXCEPTION 'B7 identity'; END IF;
  j := public.fn_classroom_practice_compare(v_cycle);
  IF COALESCE(j->>'reason','') <> 'forbidden' THEN RAISE EXCEPTION 'B7 compare: %', j; END IF;
  j := public.fn_classroom_practice_sealed_comments(v_cycle);
  IF COALESCE(j->>'reason','') <> 'principal_or_director_only' THEN RAISE EXCEPTION 'B7 comments: %', j; END IF;
  RAISE NOTICE 'B7 ok — learner shut out of both readers';

  RAISE NOTICE 'BATTERY GREEN — all 7 assert groups passed';
END $bat$;
