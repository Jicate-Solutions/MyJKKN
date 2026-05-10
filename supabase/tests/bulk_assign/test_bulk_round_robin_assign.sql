-- supabase/tests/bulk_assign/test_bulk_round_robin_assign.sql
-- Tests for bulk_round_robin_assign RPC.

BEGIN;

CREATE TEMP TABLE _t_results (lead_id uuid, counselor_id uuid, status text, reason text, plan_hash text);

-- Test 1: Empty counselor list raises an exception
DO $$
BEGIN
  BEGIN
    PERFORM * FROM bulk_round_robin_assign('{}'::uuid[], '{}'::uuid[], false, false, NULL);
    RAISE EXCEPTION 'TEST 1 FAILED: empty counselor list should raise';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%counselor list cannot be empty%' THEN
      RAISE NOTICE 'TEST 1 PASS: empty counselor list correctly rejected';
    ELSE
      RAISE EXCEPTION 'TEST 1 FAILED: unexpected error: %', SQLERRM;
    END IF;
  END;
END $$;

-- Test 2: Empty lead list returns 0 rows (with valid counselor list)
DO $$
DECLARE
  v_counselor uuid;
BEGIN
  SELECT id INTO v_counselor FROM admission_counselors LIMIT 1;
  IF v_counselor IS NULL THEN
    RAISE NOTICE 'TEST 2 SKIPPED: no counselors available';
    RETURN;
  END IF;

  TRUNCATE _t_results;
  INSERT INTO _t_results SELECT * FROM bulk_round_robin_assign('{}'::uuid[], ARRAY[v_counselor], false, false, NULL);

  IF (SELECT count(*) FROM _t_results) <> 0 THEN
    RAISE EXCEPTION 'TEST 2 FAILED';
  END IF;
  RAISE NOTICE 'TEST 2 PASS: empty leads returns 0 rows';
END $$;

-- Test 3: Cyclic distribution (3 leads × 3 counselors = 1 each) with override
DO $$
DECLARE
  v_counselors uuid[];
  v_leads uuid[];
BEGIN
  SELECT array_agg(id) INTO v_counselors FROM (SELECT id FROM admission_counselors LIMIT 3) c;
  SELECT array_agg(id) INTO v_leads FROM (SELECT id FROM admission_leads WHERE counselor_id IS NULL LIMIT 3) l;
  IF array_length(v_counselors, 1) < 3 OR array_length(v_leads, 1) < 3 THEN
    RAISE NOTICE 'TEST 3 SKIPPED: need 3+ counselors and 3+ unassigned leads';
    RETURN;
  END IF;

  TRUNCATE _t_results;
  INSERT INTO _t_results
    SELECT * FROM bulk_round_robin_assign(v_leads, v_counselors, true, true, NULL);

  -- With override=true, paused/cap shouldn't matter; expect 3 'assigned' rows
  IF (SELECT count(*) FROM _t_results WHERE status = 'assigned') <> 3 THEN
    RAISE EXCEPTION 'TEST 3 FAILED: expected 3 assigned, got %',
      (SELECT count(*) FROM _t_results WHERE status = 'assigned');
  END IF;

  -- Each counselor should have exactly 1
  IF (SELECT count(DISTINCT counselor_id) FROM _t_results WHERE status = 'assigned') <> 3 THEN
    RAISE EXCEPTION 'TEST 3 FAILED: expected 3 distinct counselors';
  END IF;

  RAISE NOTICE 'TEST 3 PASS: cyclic distribution 1 each';
END $$;

ROLLBACK;
