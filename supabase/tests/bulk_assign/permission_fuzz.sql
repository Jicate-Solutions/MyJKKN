-- supabase/tests/bulk_assign/permission_fuzz.sql
-- Per-persona permission boundary tests for bulk-assign RPCs.
-- Per-persona JWT impersonation requires fixtures (test users per role).
-- This v1 scaffold checks the anonymous case which exercises the door check.

BEGIN;

-- Anonymous call — no auth.uid() — should be rejected with 42501
-- because is_super_admin()/is_admin() return false and user_has_permission(...)
-- requires a valid auth.uid().
DO $$
BEGIN
  BEGIN
    PERFORM * FROM bulk_route_unassigned_leads('{}'::uuid[], false, false, NULL);
    RAISE EXCEPTION 'FUZZ FAILED: anonymous call should have raised 42501';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'FUZZ PASS: anonymous call rejected with 42501';
    WHEN OTHERS THEN
      IF SQLSTATE = '42501' THEN
        RAISE NOTICE 'FUZZ PASS: anonymous call rejected with 42501';
      ELSE
        RAISE EXCEPTION 'FUZZ FAILED: unexpected SQLSTATE % (%)', SQLSTATE, SQLERRM;
      END IF;
  END;
END $$;

-- Same for round-robin
DO $$
DECLARE
  v_counselor uuid;
BEGIN
  SELECT id INTO v_counselor FROM admission_counselors LIMIT 1;
  IF v_counselor IS NULL THEN
    RAISE NOTICE 'FUZZ SKIPPED (rr): no counselor fixture';
    RETURN;
  END IF;

  BEGIN
    PERFORM * FROM bulk_round_robin_assign('{}'::uuid[], ARRAY[v_counselor], false, false, NULL);
    RAISE EXCEPTION 'FUZZ FAILED (rr): anonymous call should have raised 42501';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'FUZZ PASS (rr): anonymous call rejected with 42501';
    WHEN OTHERS THEN
      IF SQLSTATE = '42501' THEN
        RAISE NOTICE 'FUZZ PASS (rr): anonymous call rejected with 42501';
      ELSE
        RAISE EXCEPTION 'FUZZ FAILED (rr): unexpected SQLSTATE % (%)', SQLSTATE, SQLERRM;
      END IF;
  END;
END $$;

ROLLBACK;
