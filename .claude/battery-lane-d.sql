-- ============================================================================
-- battery-lane-d.sql — Lane D (CARRE sealed-lane participation line)
-- ============================================================================
-- Run AFTER applying 20260725153000_carre_participant_activity_line.sql.
-- Single BEGIN .. (NO COMMIT) transaction: every write below rolls back when
-- the session ends. Results come from the final SELECT * FROM _r.
--
-- Covers every gate/deny/allow path of fn_carre_participant_activity:
--   d1  k-floor: 2 seeded scorers -> leadership caller gets NOTHING
--   d2  3rd scorer -> exactly ONE row with correct counts
--       (scorers=3, items_scored=2, last_activity=current_date)
--   d3  non-leadership caller (learner identity) -> NOTHING
--   d4  authenticated but no JWT (auth.uid() NULL) -> NOTHING
--   d5  anon EXECUTE locked (insufficient_privilege)
--
-- Hermetic: seeds its OWN CARRE cycle + synthetic scorer ids inside the txn,
-- so pre-existing real sealed rows can never skew the counts.
-- ============================================================================
BEGIN;

CREATE TEMP TABLE _r (test text, pass boolean, detail text);
GRANT ALL ON _r TO authenticated;

DO $do$
DECLARE
  v_lead    uuid;  -- leadership identity (is_super_admin -> gate allow)
  v_learner uuid;  -- non-leadership identity (gate deny)
  v_cycle   uuid;
  s1 uuid := gen_random_uuid();
  s2 uuid := gen_random_uuid();
  s3 uuid := gen_random_uuid();
  r record;
  n int;
  v_anon_locked boolean;
BEGIN
  SELECT id INTO v_lead    FROM profiles WHERE email = 'test.superadmin@jkkn.ac.in';
  SELECT id INTO v_learner FROM profiles WHERE email = 'test.student@jkkn.ac.in';
  IF v_lead IS NULL OR v_learner IS NULL THEN
    RAISE EXCEPTION 'battery preflight: test identities missing';
  END IF;

  -- Hermetic CARRE cycle (rolls back with the txn).
  INSERT INTO audit_cycles
    (name, frameworks, start_date, end_date, lead_auditor_id,
     phase, participant_scoring_open)
  VALUES
    ('[BATTERY lane-d] sealed participation line', ARRAY['CARRE']::text[],
     current_date, current_date + 30, v_lead, 'in-progress', true)
  RETURNING id INTO v_cycle;

  -- ── d1: 2 scorers -> leadership sees NOTHING (k-floor on the count itself)
  INSERT INTO carre_participant_scores (cycle_id, parameter_code, lane, score, scorer_id)
  VALUES (v_cycle, 'CARRE-A1', 'own', 3, s1),
         (v_cycle, 'CARRE-A1', 'own', 2, s2);

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_lead, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);   -- SET LOCAL role
  SELECT count(*) INTO n FROM fn_carre_participant_activity(v_cycle);
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES ('d1_k_floor_2_scorers_nothing', n = 0, format('rows=%s', n));

  -- ── d2: 3rd scorer (different item) -> one row, scorers=3 items=2 last=today
  INSERT INTO carre_participant_scores (cycle_id, parameter_code, lane, score, scorer_id)
  VALUES (v_cycle, 'CARRE-A2', 'observer', 4, s3);

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_lead, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*) INTO n FROM fn_carre_participant_activity(v_cycle);
  SELECT * INTO r FROM fn_carre_participant_activity(v_cycle);
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES ('d2_k3_row_correct_counts',
    n = 1 AND r.scorers = 3 AND r.items_scored = 2 AND r.last_activity = current_date,
    format('rows=%s scorers=%s items=%s last=%s', n, r.scorers, r.items_scored, r.last_activity));

  -- ── d3: non-leadership caller -> NOTHING (gate deny; same cycle, k satisfied)
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_learner, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*) INTO n FROM fn_carre_participant_activity(v_cycle);
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES ('d3_non_leadership_nothing', n = 0, format('rows=%s', n));

  -- ── d4: authenticated but NO JWT claims (auth.uid() NULL) -> NOTHING
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*) INTO n FROM fn_carre_participant_activity(v_cycle);
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES ('d4_no_jwt_nothing', n = 0, format('rows=%s', n));

  -- ── d5: anon EXECUTE locked (subtransaction rolls the role switch back)
  BEGIN
    PERFORM set_config('role', 'anon', true);
    PERFORM count(*) FROM fn_carre_participant_activity(v_cycle);
    RAISE EXCEPTION 'ANON_NOT_LOCKED';
  EXCEPTION
    WHEN insufficient_privilege THEN v_anon_locked := true;
    WHEN raise_exception       THEN v_anon_locked := false;
  END;
  INSERT INTO _r VALUES ('d5_anon_execute_locked', v_anon_locked,
    CASE WHEN v_anon_locked THEN 'permission denied as expected'
         ELSE 'LEAK: anon executed the function' END);
END $do$;

SELECT * FROM _r ORDER BY test;

-- NO COMMIT — the coordinator's session rollback discards every seed above.
