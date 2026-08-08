-- =============================================================================
-- BATTERY — two-sided close for re-explanation asks (20260731190000)
-- Runs AFTER the migration SQL in the SAME Mgmt-API batch, followed by ROLLBACK.
-- Nothing here survives. Every assert RAISEs on failure, which aborts the txn
-- and rolls the rehearsal back automatically.
--
-- Role discipline (the 07-30 GUC traps):
--   • ARRANGE writes run as postgres (RLS-bypassing owner) with ROW_COUNT
--     asserted on every write — a silent no-op is a failed arrange.
--   • Impersonation = set_config(role/request.jwt.claims, is_local=true) ONLY
--     around the RPC under test; identity is asserted after every switch.
--   • A caught exception rolls back its subtransaction's GUCs — identity is
--     RE-ESTABLISHED AND ASSERTED after every EXCEPTION block.
--   • now() is TXN-FROZEN: rows that must be "newer than an act recorded in
--     this txn" carry explicit now()+interval timestamps.
--   • Kill-switch tests drive the REAL product value shape via jsonb_set
--     (literal casts constant-fold at plan time — never test a guard with a
--     hand-built literal).
--
-- Identities (real prod test accounts, same institution):
--   test.faculty  65618434-70bd-4453-a171-f0e13f571bd4  (the session lead)
--   test.hod      88415a49-46f1-4ef1-b43d-70db455aa886  (NOT the lead)
--   test.student  6382240f-1368-4b9d-a317-5325a579cbdf  learner ef63c330-…
--   institution   183847c5-be1b-4903-86eb-bbc20c213071
-- =============================================================================

DO $bat$
DECLARE
  v_fac  uuid := '65618434-70bd-4453-a171-f0e13f571bd4';
  v_hod  uuid := '88415a49-46f1-4ef1-b43d-70db455aa886';
  v_stu  uuid := '6382240f-1368-4b9d-a317-5325a579cbdf';
  v_lrn  uuid := 'ef63c330-6611-4176-a595-2ed5339d7e38';
  v_inst uuid := '183847c5-be1b-4903-86eb-bbc20c213071';
  v_tt   uuid := gen_random_uuid();
  d_recent date := (now() AT TIME ZONE 'Asia/Kolkata')::date - 3;
  d_old    date := (now() AT TIME ZONE 'Asia/Kolkata')::date - 20;
  -- 20d: an old-backlog ask that is still inside the card's 30-day window
  -- (the act RPC itself reaches the view's full 90 days; the card shows 30).
  d_ended  date := date '1999-09-15';
  -- 65 quiet days: deliberately BETWEEN academic years (before the Jun 1 start
  -- of the current year, after the Mar 31 end of the last), so ONLY the quiet
  -- arm can close it — proving the two arms are independent.
  d_quiet  date := (now() AT TIME ZONE 'Asia/Kolkata')::date - 65;
  n int; j jsonb; r record; t text;
  v_ask_ended uuid;
  v_ask_quiet uuid;
  v_caught boolean := false;
  v_admin text := current_user;  -- the Mgmt-API session user; elevate back to THIS, not a hardcoded name
BEGIN
  ---------------------------------------------------------------------------
  -- ARRANGE (postgres). session_feedback + session_clarification_requests
  -- carry no FKs (verified 2026-07-30), so stubs are plain rows.
  ---------------------------------------------------------------------------
  INSERT INTO public.session_feedback
    (institution_id, student_id, attendance_date, timetable_id, period_id,
     understood, faculty_email, course_code, course_name)
  VALUES
    (v_inst, v_lrn, d_recent, v_tt, 'BAT-P1', 3, 'test.faculty@jkkn.ac.in', 'BAT-C1', 'Battery Course One'),
    (v_inst, v_lrn, d_old,    v_tt, 'BAT-P2', 3, 'test.faculty@jkkn.ac.in', 'BAT-C2', 'Battery Course Two'),
    (v_inst, v_lrn, d_ended,  v_tt, 'BAT-P3', 3, 'test.faculty@jkkn.ac.in', 'BAT-C3', 'Battery Course Three');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 3 THEN RAISE EXCEPTION 'ARRANGE session_feedback: % rows', n; END IF;

  INSERT INTO public.session_clarification_requests
    (institution_id, student_id, attendance_date, period_id, course_code, asked_at)
  VALUES
    (v_inst, v_lrn, d_recent, 'BAT-P1', 'BAT-C1', now() - interval '2 days'),
    (v_inst, v_lrn, d_old,    'BAT-P2', 'BAT-C2', now() - interval '20 days');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 2 THEN RAISE EXCEPTION 'ARRANGE asks: % rows', n; END IF;

  -- Ended academic year + an ask inside it (for term close). Outside the
  -- attribution view's 90-day horizon by design — term close reads the TABLE.
  INSERT INTO public.academic_years
    (institution_id, academic_year_name, start_date, end_date, is_active)
  VALUES (v_inst, 'BAT-1999-2000', date '1999-06-01', date '2000-04-30', false);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'ARRANGE academic_years: % rows', n; END IF;

  INSERT INTO public.session_clarification_requests
    (institution_id, student_id, attendance_date, period_id, course_code, asked_at)
  VALUES (v_inst, gen_random_uuid(), d_ended, 'BAT-P3', 'BAT-C3', d_ended::timestamptz)
  RETURNING id INTO v_ask_ended;
  IF v_ask_ended IS NULL THEN RAISE EXCEPTION 'ARRANGE ended-year ask failed'; END IF;

  -- Quiet ask: 65 days unanswered, no covering act, no matching academic year.
  INSERT INTO public.session_clarification_requests
    (institution_id, student_id, attendance_date, period_id, course_code, asked_at)
  VALUES (v_inst, gen_random_uuid(), d_quiet, 'BAT-P5', 'BAT-C5', now() - interval '65 days')
  RETURNING id INTO v_ask_quiet;
  IF v_ask_quiet IS NULL THEN RAISE EXCEPTION 'ARRANGE quiet ask failed'; END IF;

  ---------------------------------------------------------------------------
  -- A1: CHECK widened with both new values.
  ---------------------------------------------------------------------------
  SELECT pg_get_constraintdef(oid) INTO t FROM pg_constraint
  WHERE conrelid = 'public.session_clarification_requests'::regclass
    AND conname = 'session_clarification_requests_outcome_check';
  IF t NOT LIKE '%not_helped%' OR t NOT LIKE '%term_ended_unreported%' THEN
    RAISE EXCEPTION 'A1 CHECK not widened: %', t;
  END IF;
  RAISE NOTICE 'A1 ok — outcome CHECK carries both new values';

  ---------------------------------------------------------------------------
  -- A2: grants. anon revoked everywhere; term_close is service_role-only;
  -- to_regprocedure first (privilege checks RAISE on a missing object).
  ---------------------------------------------------------------------------
  FOREACH t IN ARRAY ARRAY[
    'public.fn_scf_clarification_act(date,text,text,text,text)',
    'public.fn_scf_clarification_sessions_for_me()',
    'public.fn_clarification_followup_pending()',
    'public.fn_clarification_term_close()',
    'public.fn_clarification_outcome(date,text,text)',
    'public.fn_work_signals_for(date,date)'
  ] LOOP
    IF to_regprocedure(t) IS NULL THEN RAISE EXCEPTION 'A2 missing fn %', t; END IF;
    IF has_function_privilege('anon', to_regprocedure(t), 'EXECUTE') THEN
      RAISE EXCEPTION 'A2 anon can execute %', t;
    END IF;
  END LOOP;
  IF has_function_privilege('authenticated',
       to_regprocedure('public.fn_clarification_term_close()'), 'EXECUTE') THEN
    RAISE EXCEPTION 'A2 authenticated can execute term_close';
  END IF;
  IF NOT has_function_privilege('service_role',
       to_regprocedure('public.fn_clarification_term_close()'), 'EXECUTE') THEN
    RAISE EXCEPTION 'A2 service_role cannot execute term_close';
  END IF;
  IF NOT has_function_privilege('authenticated',
       to_regprocedure('public.fn_scf_clarification_act(date,text,text,text,text)'), 'EXECUTE') THEN
    RAISE EXCEPTION 'A2 authenticated cannot execute act fn';
  END IF;
  IF has_table_privilege('anon', 'public.clarification_acts', 'SELECT') THEN
    RAISE EXCEPTION 'A2 anon can read clarification_acts';
  END IF;
  IF has_table_privilege('authenticated', 'public.clarification_acts', 'INSERT') THEN
    RAISE EXCEPTION 'A2 authenticated can INSERT clarification_acts directly';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.clarification_acts', 'SELECT') THEN
    RAISE EXCEPTION 'A2 authenticated cannot SELECT clarification_acts';
  END IF;
  RAISE NOTICE 'A2 ok — grant surface exact';

  ---------------------------------------------------------------------------
  -- A3: count-only shape — the card RPC's row type must never name a learner.
  ---------------------------------------------------------------------------
  SELECT pg_get_function_result(to_regprocedure('public.fn_scf_clarification_sessions_for_me()')) INTO t;
  IF t ILIKE '%student%' OR t ILIKE '%learner%' THEN
    RAISE EXCEPTION 'A3 row type leaks identity: %', t;
  END IF;
  RAISE NOTICE 'A3 ok — count-only row shape';

  ---------------------------------------------------------------------------
  -- A4: attributed lead records an act (recent) + a BACKLOG act (20d old ask,
  -- decision 6). Impersonate ONLY around the RPCs under test.
  ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_fac, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  IF auth.uid() IS DISTINCT FROM v_fac THEN RAISE EXCEPTION 'A4 identity not established'; END IF;

  j := public.fn_scf_clarification_act(d_recent, 'BAT-P1', 'BAT-C1',
        're_explained_in_session', 'Went over the tricky part again at the start');
  IF COALESCE(j->>'success','') <> 'true' THEN RAISE EXCEPTION 'A4 recent act refused: %', j; END IF;
  IF (j->>'acts')::int <> 1 THEN RAISE EXCEPTION 'A4 acts count: %', j; END IF;
  IF COALESCE((j->>'open_after_act')::boolean, true) THEN
    RAISE EXCEPTION 'A4 open_after_act should be false (ask predates act): %', j;
  END IF;

  j := public.fn_scf_clarification_act(d_old, 'BAT-P2', 'BAT-C2', 'helped_one_on_one', NULL);
  IF COALESCE(j->>'success','') <> 'true' THEN RAISE EXCEPTION 'A4 backlog act refused: %', j; END IF;

  -- Defensive path: bad act type returns a reason, never raises.
  j := public.fn_scf_clarification_act(d_recent, 'BAT-P1', 'BAT-C1', 'waved_hands', NULL);
  IF COALESCE(j->>'reason','') <> 'invalid_act_type' THEN RAISE EXCEPTION 'A4 bad type: %', j; END IF;
  RAISE NOTICE 'A4 ok — lead act, backlog act, defensive refusal';

  ---------------------------------------------------------------------------
  -- A5: a NON-lead is refused (attribution via the shared view).
  ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_hod, 'role', 'authenticated')::text, true);
  IF auth.uid() IS DISTINCT FROM v_hod THEN RAISE EXCEPTION 'A5 identity not established'; END IF;
  j := public.fn_scf_clarification_act(d_recent, 'BAT-P1', 'BAT-C1', 're_explained_in_session', NULL);
  IF COALESCE(j->>'reason','') <> 'not_your_session' THEN RAISE EXCEPTION 'A5 non-lead not refused: %', j; END IF;
  RAISE NOTICE 'A5 ok — non-lead refused';

  ---------------------------------------------------------------------------
  -- A6: reopen derivation (decision 5). A pending ask NEWER than the act
  -- flips open_after_act. now() is txn-frozen, so the newer ask carries an
  -- explicit +1 minute timestamp. Second learner = fresh uuid (no FK).
  ---------------------------------------------------------------------------
  PERFORM set_config('role', v_admin, true);
  INSERT INTO public.session_clarification_requests
    (institution_id, student_id, attendance_date, period_id, course_code, asked_at)
  VALUES (v_inst, gen_random_uuid(), d_recent, 'BAT-P1', 'BAT-C1', now() + interval '1 minute');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'A6 arrange failed'; END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_fac, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  IF auth.uid() IS DISTINCT FROM v_fac THEN RAISE EXCEPTION 'A6 identity not established'; END IF;
  SELECT * INTO r FROM public.fn_scf_clarification_sessions_for_me() f
   WHERE f.course_code = 'BAT-C1';
  IF NOT FOUND THEN RAISE EXCEPTION 'A6 BAT-C1 row missing'; END IF;
  IF r.acts <> 1 OR r.last_act_type <> 're_explained_in_session' THEN
    RAISE EXCEPTION 'A6 act state wrong: acts=% type=%', r.acts, r.last_act_type;
  END IF;
  IF NOT r.open_after_act THEN RAISE EXCEPTION 'A6 reopen not derived'; END IF;
  IF r.asks <> 2 OR r.still_open <> 2 THEN
    RAISE EXCEPTION 'A6 counts wrong: asks=% open=%', r.asks, r.still_open;
  END IF;
  RAISE NOTICE 'A6 ok — reopen derived, per-session act state correct';

  ---------------------------------------------------------------------------
  -- A7: follow-up returns the OLDEST eligible ask only (decision 3), and the
  -- practice-question RPC is simultaneously servable (the two-taps day —
  -- component isolation covers the rest; SQL proves both sides have content).
  ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_stu, 'role', 'authenticated')::text, true);
  IF auth.uid() IS DISTINCT FROM v_stu THEN RAISE EXCEPTION 'A7 identity not established'; END IF;
  j := public.fn_clarification_followup_pending();
  IF j->'ask' IS NULL OR j->'ask' = 'null'::jsonb THEN RAISE EXCEPTION 'A7 no follow-up returned'; END IF;
  IF j->'ask'->>'course_code' <> 'BAT-C2' THEN
    RAISE EXCEPTION 'A7 not the oldest eligible: %', j->'ask';
  END IF;
  IF j->'ask'->>'act_type' <> 'helped_one_on_one' THEN
    RAISE EXCEPTION 'A7 act_type wrong: %', j->'ask';
  END IF;
  IF to_regprocedure('public.fn_scf_micro_next_item(date,uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'A7 practice-question RPC missing';
  END IF;
  PERFORM 1 FROM public.platform_policies
   WHERE policy_key = 'classroom_practice.l2' AND scope_type = 'global'
     AND COALESCE((value->>'enabled')::boolean, false);
  IF NOT FOUND THEN RAISE EXCEPTION 'A7 practice drip not enabled — two-taps day unprovable'; END IF;

  -- The serve was RECORDED (cap accounting) — verify as admin, then restore.
  PERFORM set_config('role', v_admin, true);
  SELECT followup_prompts INTO n FROM public.session_clarification_requests
   WHERE attendance_date = d_old AND period_id = 'BAT-P2' AND student_id = v_lrn;
  IF n <> 1 THEN RAISE EXCEPTION 'A7 serve not recorded: prompts=%', n; END IF;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_stu, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  IF auth.uid() IS DISTINCT FROM v_stu THEN RAISE EXCEPTION 'A7 identity not re-established'; END IF;
  RAISE NOTICE 'A7 ok — oldest eligible follow-up; serve recorded; both taps servable';

  ---------------------------------------------------------------------------
  -- A8: the not_helped write path, and term_ended_unreported REJECTED from
  -- the learner writer (system-only). Exception subtransaction rolls back the
  -- GUCs — identity re-established and asserted after.
  ---------------------------------------------------------------------------
  j := to_jsonb(public.fn_clarification_outcome(d_old, 'BAT-P2', 'not_helped'));
  IF j->>'outcome' <> 'not_helped' THEN RAISE EXCEPTION 'A8 not_helped write failed: %', j; END IF;

  BEGIN
    PERFORM public.fn_clarification_outcome(d_recent, 'BAT-P1', 'term_ended_unreported');
    RAISE EXCEPTION 'A8 term_ended_unreported was accepted from a learner';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%was accepted%' THEN RAISE; END IF;
    v_caught := true;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'A8 rejection not exercised'; END IF;
  -- GUCs rolled back with the subtransaction — re-establish AND assert.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_stu, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  IF auth.uid() IS DISTINCT FROM v_stu THEN RAISE EXCEPTION 'A8 identity lost after exception'; END IF;

  -- With the old ask closed, the follow-up re-derives to the RECENT ask.
  j := public.fn_clarification_followup_pending();
  IF j->'ask'->>'course_code' IS DISTINCT FROM 'BAT-C1' THEN
    RAISE EXCEPTION 'A8 follow-up did not advance to next eligible: %', j->'ask';
  END IF;

  -- CAP: "ask at most twice, then stop" (Director interview). Serve #2 still
  -- shows the same ask; serve #3 must return null forever after.
  j := public.fn_clarification_followup_pending();
  IF j->'ask'->>'course_code' IS DISTINCT FROM 'BAT-C1' THEN
    RAISE EXCEPTION 'A8 second serve should still show the ask: %', j->'ask';
  END IF;
  j := public.fn_clarification_followup_pending();
  IF j->'ask' IS NOT NULL AND j->'ask' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'A8 cap not enforced — third serve returned: %', j->'ask';
  END IF;
  PERFORM set_config('role', v_admin, true);
  SELECT followup_prompts INTO n FROM public.session_clarification_requests
   WHERE attendance_date = d_recent AND period_id = 'BAT-P1' AND student_id = v_lrn;
  IF n <> 2 THEN RAISE EXCEPTION 'A8 cap accounting wrong: prompts=%', n; END IF;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_stu, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  IF auth.uid() IS DISTINCT FROM v_stu THEN RAISE EXCEPTION 'A8 identity not re-established'; END IF;
  RAISE NOTICE 'A8 ok — not_helped path; system-only value rejected; queue advances; twice-then-stop cap holds';

  ---------------------------------------------------------------------------
  -- A9: the lead's card now buckets not_helped explicitly (mismatch substrate).
  ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_fac, 'role', 'authenticated')::text, true);
  IF auth.uid() IS DISTINCT FROM v_fac THEN RAISE EXCEPTION 'A9 identity not established'; END IF;
  SELECT * INTO r FROM public.fn_scf_clarification_sessions_for_me() f
   WHERE f.course_code = 'BAT-C2';
  IF NOT FOUND THEN RAISE EXCEPTION 'A9 BAT-C2 row missing'; END IF;
  IF r.not_helped <> 1 OR r.still_open <> 0 THEN
    RAISE EXCEPTION 'A9 buckets wrong: not_helped=% open=%', r.not_helped, r.still_open;
  END IF;
  RAISE NOTICE 'A9 ok — not_helped bucketed, no longer open';

  ---------------------------------------------------------------------------
  -- A10: work-signal regression — all 12 pre-existing emitted keys + the 13th
  -- (clarifications_open) + the NEW clarification_acts_recorded (value >= 2:
  -- both acts recorded in this txn fall inside the 30-day window).
  -- 2026-08-08: sessions_marked_same_day (20260816020000) is checked in A10b
  -- BELOW, and deliberately NOT added to this mandatory list — that migration
  -- is FILE ONLY / NOT APPLIED, so on any database that has not had it applied
  -- the key is legitimately absent and requiring it here would RAISE and abort
  -- the whole block before A11 ever runs.
  --
  -- ⚠️ THIS HARDCODED LIST IS THE WEAK PART OF THIS CHECK, and it is the exact
  -- reason marks_coverage went dark: a list can only confirm the keys someone
  -- remembered to add to it, which is precisely the set that was never at risk.
  -- The real guard is __tests__/work-signals/registry-values-parity.test.ts,
  -- which DERIVES both sides from the migrations and fails on any registered
  -- key with no emitter. Keep this loop as a runtime smoke test; do not treat
  -- it as coverage.
  ---------------------------------------------------------------------------
  j := public.fn_work_signals_for();
  FOREACH t IN ARRAY ARRAY[
    'sessions_marked','sessions_witnessed',
    'pulses_run','lessons_linked',
    'notes_received','verdicts_given','votes_received','od_requests_handled',
    'od_requests_waiting','correctives_open','carre_audits_scored',
    'clarifications_open','clarification_acts_recorded'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(j->'signals') s WHERE s->>'key' = t
    ) THEN
      RAISE EXCEPTION 'A10 signal % missing from fn_work_signals_for', t;
    END IF;
  END LOOP;
  SELECT (s->>'value')::int INTO n FROM jsonb_array_elements(j->'signals') s
   WHERE s->>'key' = 'clarification_acts_recorded';
  IF n < 2 THEN RAISE EXCEPTION 'A10 acts_recorded=% (expected >=2)', n; END IF;

  -- A10b: the same-day count is a SUBSET of the personal count, never a rival
  -- number. Asserted as a RELATIONSHIP between the two values in one response —
  -- never against a literal, because these are live counts written by many
  -- concurrent sessions and two such literals in this repo drifted within three
  -- hours. Both are read from the SAME jsonb so they cannot race each other.
  --
  -- CONDITIONAL BY DESIGN: 20260816020000 is FILE ONLY / NOT APPLIED, so this
  -- skips rather than demanding the key. A battery that fails on a database
  -- where the migration was never applied is testing the deployment, not the
  -- behaviour.
  --
  -- ⚠️ THE SKIP IS GATED ON THE REGISTRY, NOT ON THE RESPONSE — and that
  -- distinction is the whole point. Probing the response for the key would make
  -- "never applied" and "registered but dropped by the emitter's inner join"
  -- look identical, so a typo'd or deleted VALUES row would print
  -- "skipped, not applied" and PASS — reproducing marks_coverage, the exact
  -- failure this check exists to detect. Registered ⇒ it MUST be emitted.
  -- …and the registry read itself is proved VISIBLE before its answer is
  -- trusted. work_signal_types is read through a direct SELECT while the RPC it
  -- is compared against is SECURITY DEFINER, so a role that can call the RPC but
  -- cannot see the table (RLS, missing grant) would read zero rows, conclude
  -- "not applied", and PASS — the same silent green, entered through a different
  -- door. The table is never legitimately empty.
  SELECT count(*)::int INTO n FROM public.work_signal_types;
  IF n = 0 THEN
    RAISE EXCEPTION 'A10b cannot see public.work_signal_types (0 rows visible) — this is an access problem, not an empty registry; the skip below would be a false pass';
  END IF;

  IF EXISTS (SELECT 1 FROM public.work_signal_types
              WHERE signal_key = 'sessions_marked_same_day' AND is_active) THEN
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(j->'signals') s
                    WHERE s->>'key' = 'sessions_marked_same_day') THEN
      RAISE EXCEPTION 'A10b sessions_marked_same_day is registered + active but ABSENT from fn_work_signals_for — the emitter inner-join is dropping it (this is the marks_coverage failure)';
    END IF;
    IF (SELECT (s->>'value')::int FROM jsonb_array_elements(j->'signals') s
         WHERE s->>'key' = 'sessions_marked_same_day')
       > COALESCE((SELECT (s->>'value_personal')::int FROM jsonb_array_elements(j->'signals') s
         WHERE s->>'key' = 'sessions_marked'), 0)
    THEN
      RAISE EXCEPTION 'A10b same_day exceeds personally-marked — the FILTER is no longer a subset of its own scan';
    END IF;
    RAISE NOTICE 'A10b ok — registered, emitted, and the subset holds';
  ELSE
    RAISE NOTICE 'A10b skipped — 20260816020000 not applied on this database';
  END IF;
  RAISE NOTICE 'A10 ok — 13 signals regressed';

  ---------------------------------------------------------------------------
  -- A11: term close (service_role only), BOTH arms, whichever comes first:
  -- the ended-YEAR ask closes via arm 1, the 65-day QUIET ask (in no academic
  -- year at all) closes via arm 2, and everything recent stays untouched —
  -- including the reopen ask and the acted-on recent ask (its covering act is
  -- newer than the quiet horizon, so the act correctly restarts the clock).
  ---------------------------------------------------------------------------
  PERFORM set_config('role', 'service_role', true);
  j := public.fn_clarification_term_close();
  IF (j->>'closed')::int <> 2 THEN RAISE EXCEPTION 'A11 closed=% (expected 2)', j; END IF;
  IF (j->>'by_year_end')::int <> 1 OR (j->>'by_quiet')::int <> 1 THEN
    RAISE EXCEPTION 'A11 arm split wrong: %', j;
  END IF;

  PERFORM set_config('role', v_admin, true);
  SELECT outcome INTO t FROM public.session_clarification_requests WHERE id = v_ask_ended;
  IF t <> 'term_ended_unreported' THEN RAISE EXCEPTION 'A11 ended ask outcome=%', t; END IF;
  SELECT outcome INTO t FROM public.session_clarification_requests WHERE id = v_ask_quiet;
  IF t <> 'term_ended_unreported' THEN RAISE EXCEPTION 'A11 quiet ask outcome=%', t; END IF;
  SELECT count(*) INTO n FROM public.session_clarification_requests
   WHERE attendance_date IN (d_recent, d_old) AND period_id LIKE 'BAT-%' AND outcome = 'pending';
  IF n <> 2 THEN RAISE EXCEPTION 'A11 current-year pendings touched: % remain', n; END IF;
  RAISE NOTICE 'A11 ok — both close arms scoped exactly';

  ---------------------------------------------------------------------------
  -- A12: kill switch — flip the REAL config row via jsonb_set (product value
  -- shape), assert all three gates close, then restore.
  ---------------------------------------------------------------------------
  UPDATE public.platform_policies
     SET value = jsonb_set(value, '{enabled}', 'false'::jsonb)
   WHERE policy_key = 'classroom_practice.acts' AND scope_type = 'global' AND scope_id IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'A12 config row not found'; END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_fac, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  IF auth.uid() IS DISTINCT FROM v_fac THEN RAISE EXCEPTION 'A12 identity not established'; END IF;
  j := public.fn_scf_clarification_act(d_recent, 'BAT-P1', 'BAT-C1', 'shared_material', NULL);
  IF COALESCE(j->>'reason','') <> 'disabled' THEN RAISE EXCEPTION 'A12 act not gated: %', j; END IF;

  -- The follow-up gate must be proven on a FRESH ask (BAT-C1's serve cap is
  -- already exhausted, which would make a null return prove nothing). New
  -- session + ask + covering act, prompts = 0, all as admin.
  PERFORM set_config('role', v_admin, true);
  INSERT INTO public.session_feedback
    (institution_id, student_id, attendance_date, timetable_id, period_id,
     understood, faculty_email, course_code, course_name)
  VALUES (v_inst, v_lrn, d_recent, v_tt, 'BAT-P4', 3, 'test.faculty@jkkn.ac.in', 'BAT-C4', 'Battery Course Four');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'A12 arrange sf failed'; END IF;
  INSERT INTO public.session_clarification_requests
    (institution_id, student_id, attendance_date, period_id, course_code, asked_at)
  VALUES (v_inst, v_lrn, d_recent, 'BAT-P4', 'BAT-C4', now() - interval '1 hour');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'A12 arrange ask failed'; END IF;
  INSERT INTO public.clarification_acts
    (institution_id, attendance_date, period_id, course_code, lead_email, acted_by, act_type)
  VALUES (v_inst, d_recent, 'BAT-P4', 'BAT-C4', 'test.faculty@jkkn.ac.in', v_fac, 'shared_material');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'A12 arrange act failed'; END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_stu, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  IF auth.uid() IS DISTINCT FROM v_stu THEN RAISE EXCEPTION 'A12 identity not established'; END IF;
  j := public.fn_clarification_followup_pending();
  IF j->'ask' IS NOT NULL AND j->'ask' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'A12 follow-up not gated: %', j;
  END IF;

  PERFORM set_config('role', 'service_role', true);
  j := public.fn_clarification_term_close();
  IF COALESCE(j->>'skipped','') <> 'disabled' THEN RAISE EXCEPTION 'A12 term close not gated: %', j; END IF;

  PERFORM set_config('role', v_admin, true);
  UPDATE public.platform_policies
     SET value = jsonb_set(value, '{enabled}', 'true'::jsonb)
   WHERE policy_key = 'classroom_practice.acts' AND scope_type = 'global' AND scope_id IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'A12 config restore failed'; END IF;

  -- Gate re-opened: the SAME fresh ask must now serve — proving the null
  -- above came from the kill switch, not the cap.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_stu, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  IF auth.uid() IS DISTINCT FROM v_stu THEN RAISE EXCEPTION 'A12 identity not re-established'; END IF;
  j := public.fn_clarification_followup_pending();
  IF j->'ask'->>'course_code' IS DISTINCT FROM 'BAT-C4' THEN
    RAISE EXCEPTION 'A12 gate did not reopen: %', j->'ask';
  END IF;
  RAISE NOTICE 'A12 ok — kill switch closes all three gates and reopens cleanly';

  RAISE NOTICE 'BATTERY GREEN — all 12 assert groups passed';
END $bat$;
