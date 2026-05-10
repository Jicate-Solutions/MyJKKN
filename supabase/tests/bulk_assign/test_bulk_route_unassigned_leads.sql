-- supabase/tests/bulk_assign/test_bulk_route_unassigned_leads.sql
-- Tests for bulk_route_unassigned_leads RPC.
-- Run: psql "$DATABASE_URL" -f supabase/tests/bulk_assign/test_bulk_route_unassigned_leads.sql

BEGIN;

CREATE TEMP TABLE _t_results (lead_id uuid, counselor_id uuid, status text, reason text, plan_hash text);

-- Test 1: Empty input returns 0 rows
TRUNCATE _t_results;
INSERT INTO _t_results SELECT * FROM bulk_route_unassigned_leads('{}'::uuid[], false, false, NULL);
DO $$ BEGIN
  IF (SELECT count(*) FROM _t_results) <> 0 THEN
    RAISE EXCEPTION 'TEST 1 FAILED: empty input should return 0 rows';
  END IF;
  RAISE NOTICE 'TEST 1 PASS: empty input returns 0 rows';
END $$;

-- Test 2: Dry-run does not UPDATE admission_leads
DO $$
DECLARE
  v_lead uuid;
  v_initial uuid;
  v_after uuid;
BEGIN
  SELECT id INTO v_lead FROM admission_leads WHERE counselor_id IS NULL LIMIT 1;
  IF v_lead IS NULL THEN
    RAISE NOTICE 'TEST 2 SKIPPED: no unassigned leads available';
    RETURN;
  END IF;
  SELECT counselor_id INTO v_initial FROM admission_leads WHERE id = v_lead;

  TRUNCATE _t_results;
  INSERT INTO _t_results SELECT * FROM bulk_route_unassigned_leads(ARRAY[v_lead], true, false, NULL);

  SELECT counselor_id INTO v_after FROM admission_leads WHERE id = v_lead;
  IF v_initial IS DISTINCT FROM v_after THEN
    RAISE EXCEPTION 'TEST 2 FAILED: dry-run modified admission_leads';
  END IF;
  RAISE NOTICE 'TEST 2 PASS: dry-run leaves admission_leads untouched';
END $$;

-- Test 3: Plan hash drift raises 40001
-- Empty input case: v_plan = '' so v_hash is the SHA256 of empty string;
-- expected hash 'wrong-hash-value' will not match → 40001 raised after the (empty) loop.
DO $$
BEGIN
  BEGIN
    PERFORM * FROM bulk_route_unassigned_leads('{}'::uuid[], false, false, 'wrong-hash-value');
    RAISE EXCEPTION 'TEST 3 FAILED: should have raised 40001';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = '40001' THEN
      RAISE NOTICE 'TEST 3 PASS: plan-hash mismatch raises 40001';
    ELSE
      RAISE EXCEPTION 'TEST 3 FAILED: expected 40001 got %', SQLSTATE;
    END IF;
  END;
END $$;

-- Test 4: Stale lead (already has counselor_id) is silently skipped
DO $$
DECLARE
  v_lead uuid;
BEGIN
  SELECT id INTO v_lead FROM admission_leads WHERE counselor_id IS NOT NULL LIMIT 1;
  IF v_lead IS NULL THEN
    RAISE NOTICE 'TEST 4 SKIPPED: no assigned leads available';
    RETURN;
  END IF;

  TRUNCATE _t_results;
  INSERT INTO _t_results SELECT * FROM bulk_route_unassigned_leads(ARRAY[v_lead], true, false, NULL);

  IF (SELECT count(*) FROM _t_results) <> 0 THEN
    RAISE EXCEPTION 'TEST 4 FAILED: stale lead should not appear in results';
  END IF;
  RAISE NOTICE 'TEST 4 PASS: stale lead silently skipped';
END $$;

ROLLBACK;
