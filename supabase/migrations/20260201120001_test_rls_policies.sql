-- ============================================================================
-- RLS Policy Testing Suite
-- Migration: 20260201120001_test_rls_policies.sql
-- Created: 2026-02-01
-- Purpose: Test RLS policies to ensure cross-institution isolation
-- ============================================================================

-- This file contains SQL tests to verify RLS policies work correctly.
-- Run these manually in Supabase SQL Editor to verify security.

-- ============================================================================
-- Test Setup: Create Test Data
-- ============================================================================

DO $$
DECLARE
  v_institution_1 UUID;
  v_institution_2 UUID;
  v_user_1 UUID;
  v_user_2 UUID;
  v_survey_1 UUID;
  v_survey_2 UUID;
  v_parent_1 UUID;
  v_parent_2 UUID;
BEGIN
  -- Create test institutions
  INSERT INTO institutions (id, name, subdomain)
  VALUES
    (gen_random_uuid(), 'Test Institution 1', 'test1'),
    (gen_random_uuid(), 'Test Institution 2', 'test2')
  ON CONFLICT (subdomain) DO NOTHING
  RETURNING id INTO v_institution_1;

  SELECT id INTO v_institution_2 FROM institutions WHERE subdomain = 'test2';

  -- Create test users
  -- Note: In real testing, use actual auth.users IDs
  -- This is just to demonstrate the test structure

  RAISE NOTICE 'Test institutions created: % and %', v_institution_1, v_institution_2;
  RAISE NOTICE 'RLS test data setup complete';
  RAISE NOTICE 'Run the verification tests below manually with real user sessions';
END $$;

-- ============================================================================
-- Test 1: NPS Survey Cross-Institution Isolation
-- ============================================================================

-- Create surveys in both institutions
-- Expected: User from institution 1 should ONLY see institution 1 surveys

-- Test query (run as user from institution 1):
-- SELECT COUNT(*) FROM nps_surveys WHERE institution_id = 'institution_1_id';
-- Should return: 1 or more

-- SELECT COUNT(*) FROM nps_surveys WHERE institution_id = 'institution_2_id';
-- Should return: 0 (blocked by RLS)

-- ============================================================================
-- Test 2: Parent Portal Data Isolation
-- ============================================================================

-- Test query (run as parent user):
-- SELECT COUNT(*) FROM parent_profiles WHERE user_id = auth.uid();
-- Should return: 1 (their own profile)

-- SELECT COUNT(*) FROM parent_profiles WHERE user_id != auth.uid();
-- Should return: 0 (cannot see other parents)

-- Test query (run as staff user in institution 1):
-- SELECT COUNT(*) FROM parent_profiles WHERE institution_id = 'institution_1_id';
-- Should return: All parents in institution 1

-- SELECT COUNT(*) FROM parent_profiles WHERE institution_id = 'institution_2_id';
-- Should return: 0 (blocked by RLS)

-- ============================================================================
-- Test 3: Grievance Ticket Access Control
-- ============================================================================

-- Test query (run as student who raised ticket):
-- SELECT COUNT(*) FROM grievance_tickets WHERE raised_by_id = auth.uid();
-- Should return: Their tickets only

-- SELECT COUNT(*) FROM grievance_tickets WHERE raised_by_id != auth.uid();
-- Should return: 0 (cannot see others' tickets)

-- Test query (run as staff in institution 1):
-- SELECT COUNT(*) FROM grievance_tickets WHERE institution_id = 'institution_1_id';
-- Should return: All tickets in institution 1

-- ============================================================================
-- Test 4: Maturity Assessment Data Isolation
-- ============================================================================

-- Test query (run as staff in institution 1):
-- SELECT COUNT(*) FROM maturity_assessments WHERE institution_id = 'institution_1_id';
-- Should return: Assessments in institution 1

-- SELECT COUNT(*) FROM maturity_assessments WHERE institution_id = 'institution_2_id';
-- Should return: 0 (blocked by RLS)

-- ============================================================================
-- Test 5: Billing COPQ Cross-Institution Isolation
-- ============================================================================

-- Test query (run as user in institution 1):
-- SELECT COUNT(*) FROM billing_copq_incidents WHERE institution_id = 'institution_1_id';
-- Should return: COPQ incidents in institution 1

-- SELECT COUNT(*) FROM billing_copq_incidents WHERE institution_id = 'institution_2_id';
-- Should return: 0 (blocked by RLS)

-- ============================================================================
-- Test 6: Process Excellence Data Isolation
-- ============================================================================

-- Test query (run as user in institution 1):
-- SELECT COUNT(*) FROM process_definitions WHERE institution_id = 'institution_1_id';
-- Should return: Process definitions in institution 1

-- SELECT COUNT(*) FROM process_definitions WHERE institution_id = 'institution_2_id';
-- Should return: 0 (blocked by RLS)

-- ============================================================================
-- Test 7: Role-Based Access Control
-- ============================================================================

-- Test INSERT permission (run as student):
-- INSERT INTO nps_surveys (institution_id, title, stakeholder_type, start_date, end_date, status)
-- VALUES ('institution_1_id', 'Test Survey', 'student', NOW(), NOW() + INTERVAL '7 days', 'draft');
-- Should FAIL: Students cannot create surveys

-- Test INSERT permission (run as admin):
-- INSERT INTO nps_surveys (institution_id, title, stakeholder_type, start_date, end_date, status)
-- VALUES ('institution_1_id', 'Test Survey', 'student', NOW(), NOW() + INTERVAL '7 days', 'draft');
-- Should SUCCESS: Admins can create surveys

-- ============================================================================
-- Test 8: DELETE Permission Control
-- ============================================================================

-- Test DELETE (run as regular staff):
-- DELETE FROM nps_surveys WHERE id = 'some_survey_id';
-- Should FAIL: Only super_admin can delete surveys

-- Test DELETE (run as super_admin):
-- DELETE FROM nps_surveys WHERE id = 'some_survey_id';
-- Should SUCCESS: Super admins can delete

-- ============================================================================
-- Automated RLS Verification Function
-- ============================================================================

CREATE OR REPLACE FUNCTION verify_rls_enabled()
RETURNS TABLE (
  table_name TEXT,
  rls_enabled BOOLEAN,
  policy_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.tablename::TEXT,
    t.rowsecurity,
    COUNT(p.policyname)
  FROM pg_tables t
  LEFT JOIN pg_policies p ON p.tablename = t.tablename AND p.schemaname = t.schemaname
  WHERE t.schemaname = 'public'
    AND (
      t.tablename LIKE '%nps%'
      OR t.tablename LIKE '%parent%'
      OR t.tablename LIKE '%grievance%'
      OR t.tablename LIKE '%maturity%'
      OR t.tablename LIKE '%copq%'
      OR t.tablename LIKE '%process%'
      OR t.tablename LIKE '%waste%'
    )
  GROUP BY t.tablename, t.rowsecurity
  ORDER BY t.tablename;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Run verification:
-- SELECT * FROM verify_rls_enabled();
-- Expected: All tables should show rls_enabled = TRUE and policy_count > 0

GRANT EXECUTE ON FUNCTION verify_rls_enabled TO authenticated;

-- ============================================================================
-- Function: Test Cross-Institution Access
-- ============================================================================

CREATE OR REPLACE FUNCTION test_cross_institution_access(
  p_table_name TEXT,
  p_user_institution_id UUID,
  p_other_institution_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_own_count INTEGER;
  v_other_count INTEGER;
  v_result JSONB;
BEGIN
  -- This function tests if RLS properly blocks cross-institution access
  -- Note: This is a template - actual implementation would need dynamic SQL

  v_result := jsonb_build_object(
    'table', p_table_name,
    'user_institution', p_user_institution_id,
    'other_institution', p_other_institution_id,
    'test_status', 'Manual testing required',
    'instructions', 'Run SELECT queries as different users to verify isolation'
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION test_cross_institution_access TO authenticated;

-- ============================================================================
-- Manual Testing Instructions
-- ============================================================================

/*
MANUAL TESTING PROCEDURE:

1. Create Test Users:
   - Create 2 users in Supabase Auth
   - Assign user 1 to institution A
   - Assign user 2 to institution B

2. Create Test Data:
   - Insert NPS survey in institution A
   - Insert NPS survey in institution B
   - Insert grievance ticket in institution A
   - Insert grievance ticket in institution B

3. Test as User 1 (Institution A):
   -- Should see data from institution A
   SELECT * FROM nps_surveys;
   SELECT * FROM grievance_tickets;

   -- Should return empty (RLS blocks institution B data)
   SELECT * FROM nps_surveys WHERE institution_id = 'institution_B_id';

4. Test as User 2 (Institution B):
   -- Should see data from institution B
   SELECT * FROM nps_surveys;
   SELECT * FROM grievance_tickets;

   -- Should return empty (RLS blocks institution A data)
   SELECT * FROM nps_surveys WHERE institution_id = 'institution_A_id';

5. Test Parent Access:
   -- As parent user
   SELECT * FROM parent_profiles; -- Should see own profile only
   SELECT * FROM parent_learner_links; -- Should see own children only

6. Test Staff Access:
   -- As staff user
   SELECT * FROM nps_surveys; -- Should see all surveys in their institution
   SELECT * FROM grievance_tickets; -- Should see all tickets in their institution

7. Test Admin Permissions:
   -- As admin user
   INSERT INTO nps_surveys (...); -- Should succeed
   UPDATE nps_surveys SET status = 'active' WHERE id = '...'; -- Should succeed

8. Test Student Restrictions:
   -- As student user
   INSERT INTO nps_surveys (...); -- Should FAIL
   UPDATE nps_surveys SET status = 'active' WHERE id = '...'; -- Should FAIL

9. Verify with Function:
   SELECT * FROM verify_rls_enabled();
   -- Should show all tables have RLS enabled and policies

10. Test Role-Based Access:
    -- Test each role (super_admin, admin, staff, faculty, student, parent)
    -- Verify appropriate access levels

EXPECTED RESULTS:
- ✅ Users can only access data from their institution
- ✅ Parents can only see their own data
- ✅ Students cannot create/update sensitive data
- ✅ Staff can view/manage institution data
- ✅ Admins have elevated permissions
- ✅ Super admins have full permissions
- ✅ Cross-institution queries return empty results (not errors)
- ✅ All tables show RLS enabled
- ✅ All tables have at least 1 policy (usually 2-4)

FAILURE SCENARIOS (SHOULD NEVER HAPPEN):
- ❌ User from institution A sees institution B data
- ❌ Student can update NPS surveys
- ❌ Parent sees other parents' data
- ❌ Non-admin can delete records
- ❌ RLS disabled on any table
- ❌ Table has no policies
*/

-- ============================================================================
-- Security Audit Report
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_rls_audit_report()
RETURNS TABLE (
  audit_item TEXT,
  status TEXT,
  details TEXT
) AS $$
BEGIN
  -- Check 1: All TQM tables have RLS enabled
  RETURN QUERY
  SELECT
    'RLS Enabled Check'::TEXT,
    CASE WHEN COUNT(*) = 0 THEN '✅ PASS' ELSE '❌ FAIL' END::TEXT,
    'Tables without RLS: ' || COALESCE(STRING_AGG(tablename, ', '), 'None')::TEXT
  FROM pg_tables
  WHERE schemaname = 'public'
    AND (
      tablename LIKE '%nps%'
      OR tablename LIKE '%parent%'
      OR tablename LIKE '%grievance%'
      OR tablename LIKE '%maturity%'
      OR tablename LIKE '%copq%'
      OR tablename LIKE '%process%'
    )
    AND rowsecurity = false;

  -- Check 2: All tables have policies
  RETURN QUERY
  SELECT
    'Policy Existence Check'::TEXT,
    CASE WHEN COUNT(*) = 0 THEN '✅ PASS' ELSE '⚠️ WARNING' END::TEXT,
    'Tables without policies: ' || COALESCE(STRING_AGG(tablename, ', '), 'None')::TEXT
  FROM pg_tables t
  WHERE schemaname = 'public'
    AND (
      tablename LIKE '%nps%'
      OR tablename LIKE '%parent%'
      OR tablename LIKE '%grievance%'
      OR tablename LIKE '%maturity%'
      OR tablename LIKE '%copq%'
      OR tablename LIKE '%process%'
    )
    AND rowsecurity = true
    AND NOT EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.tablename = t.tablename
        AND p.schemaname = t.schemaname
    );

  -- Summary
  RETURN QUERY
  SELECT
    'SUMMARY'::TEXT,
    '📊 Report Generated'::TEXT,
    'Run manual tests to verify policy effectiveness'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION generate_rls_audit_report TO authenticated;

-- Run the audit:
-- SELECT * FROM generate_rls_audit_report();

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON FUNCTION verify_rls_enabled IS 'Checks which tables have RLS enabled and counts their policies';
COMMENT ON FUNCTION generate_rls_audit_report IS 'Generates a security audit report for RLS implementation';
COMMENT ON FUNCTION test_cross_institution_access IS 'Template function for testing cross-institution data isolation';

-- End of RLS testing suite
