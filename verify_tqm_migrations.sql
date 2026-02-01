-- ============================================================================
-- TQM Migration Verification Script
-- Purpose: Test that all migrations and fixes were applied correctly
-- Run this AFTER applying main migrations and fixes
-- ============================================================================

-- TEST 1: Verify NPS tables exist
SELECT
  'NPS Tables' AS test_category,
  CASE
    WHEN COUNT(*) = 3 THEN '✅ PASS'
    ELSE '❌ FAIL - Expected 3 tables, found ' || COUNT(*)
  END AS result
FROM information_schema.tables
WHERE table_name IN ('nps_surveys', 'nps_responses', 'nps_analytics')
  AND table_schema = 'public';

-- TEST 2: Verify NPS analytics RLS policies (should be 4, not 1)
SELECT
  'NPS Analytics RLS' AS test_category,
  CASE
    WHEN COUNT(*) >= 4 THEN '✅ PASS - Service role policies exist'
    ELSE '❌ FAIL - Expected 4+ policies, found ' || COUNT(*) || '. Fix not applied!'
  END AS result
FROM pg_policies
WHERE tablename = 'nps_analytics';

-- TEST 3: Verify NPS trigger function handles DELETE
SELECT
  'NPS Trigger DELETE Fix' AS test_category,
  CASE
    WHEN pg_get_functiondef(oid) LIKE '%TG_OP = ''DELETE''%' THEN '✅ PASS'
    ELSE '❌ FAIL - Trigger does not handle DELETE'
  END AS result
FROM pg_proc
WHERE proname = 'trigger_update_nps_analytics';

-- TEST 4: Verify grievance tables exist
SELECT
  'Grievance Tables' AS test_category,
  CASE
    WHEN COUNT(*) = 4 THEN '✅ PASS'
    ELSE '❌ FAIL - Expected 4 tables, found ' || COUNT(*)
  END AS result
FROM information_schema.tables
WHERE table_name IN ('grievance_categories', 'grievance_tickets', 'grievance_comments', 'grievance_history')
  AND table_schema = 'public';

-- TEST 5: Verify grievance SLA function uses percentage
SELECT
  'Grievance SLA Fix' AS test_category,
  CASE
    WHEN pg_get_functiondef(oid) LIKE '%v_threshold_pct%' THEN '✅ PASS'
    ELSE '❌ FAIL - SLA function still uses hardcoded hours'
  END AS result
FROM pg_proc
WHERE proname = 'update_grievance_sla_status';

-- TEST 6: Verify parent portal tables exist
SELECT
  'Parent Portal Tables' AS test_category,
  CASE
    WHEN COUNT(*) = 5 THEN '✅ PASS'
    ELSE '❌ FAIL - Expected 5 tables, found ' || COUNT(*)
  END AS result
FROM information_schema.tables
WHERE table_name IN ('parent_profiles', 'parent_learner_links', 'parent_communications', 'parent_activity_log', 'parent_otp_requests')
  AND table_schema = 'public';

-- TEST 7: Verify OTP cleanup trigger was removed
SELECT
  'OTP Cleanup Trigger' AS test_category,
  CASE
    WHEN COUNT(*) = 0 THEN '✅ PASS - Trigger removed'
    ELSE '❌ FAIL - Performance-killing trigger still exists!'
  END AS result
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
WHERE c.relname = 'parent_otp_requests'
  AND t.tgname = 'trigger_cleanup_expired_otps';

-- TEST 8: Verify maturity assessment tables exist
SELECT
  'Maturity Assessment Tables' AS test_category,
  CASE
    WHEN COUNT(*) = 4 THEN '✅ PASS'
    ELSE '❌ FAIL - Expected 4 tables, found ' || COUNT(*)
  END AS result
FROM information_schema.tables
WHERE table_name IN ('maturity_frameworks', 'maturity_assessments', 'maturity_progress', 'maturity_evidence')
  AND table_schema = 'public';

-- TEST 9: Verify maturity RLS uses user_id (not profile_id)
SELECT
  'Maturity RLS Column Fix' AS test_category,
  CASE
    WHEN COUNT(*) = 0 THEN '✅ PASS'
    ELSE '❌ FAIL - ' || COUNT(*) || ' policies still use profile_id'
  END AS result
FROM pg_policies
WHERE tablename LIKE 'maturity_%'
  AND definition LIKE '%profile_id%';

-- TEST 10: Verify maturity calculation function is STABLE
SELECT
  'Maturity Calculation Volatility' AS test_category,
  CASE
    WHEN provolatile = 's' THEN '✅ PASS - Function is STABLE'
    WHEN provolatile = 'i' THEN '⚠️  WARNING - Function still IMMUTABLE (should be STABLE)'
    ELSE '❌ FAIL - Unexpected volatility: ' || provolatile
  END AS result
FROM pg_proc
WHERE proname = 'calculate_maturity_overall_stage';

-- TEST 11: Verify OKR ABCD extension applied
SELECT
  'OKR ABCD Columns' AS test_category,
  CASE
    WHEN COUNT(*) >= 3 THEN '✅ PASS - process_rating, process_notes, abcd_category exist'
    ELSE '❌ FAIL - Expected 3+ new columns, found ' || COUNT(*)
  END AS result
FROM information_schema.columns
WHERE table_name = 'okr_key_results'
  AND column_name IN ('process_rating', 'process_notes', 'abcd_category');

-- TEST 12: Verify progress_percentage constraint exists
SELECT
  'OKR Progress Constraint' AS test_category,
  CASE
    WHEN COUNT(*) > 0 THEN '✅ PASS'
    ELSE '❌ FAIL - progress_percentage range constraint missing'
  END AS result
FROM information_schema.table_constraints tc
JOIN information_schema.constraint_column_usage ccu USING (constraint_name)
WHERE tc.table_name = 'okr_key_results'
  AND ccu.column_name = 'progress_percentage'
  AND tc.constraint_type = 'CHECK';

-- TEST 13: Verify billing COPQ tables exist
SELECT
  'Billing COPQ Tables' AS test_category,
  CASE
    WHEN COUNT(*) = 1 THEN '✅ PASS'
    ELSE '❌ FAIL - Expected 1 table, found ' || COUNT(*)
  END AS result
FROM information_schema.tables
WHERE table_name = 'billing_copq_incidents'
  AND table_schema = 'public';

-- TEST 14: Verify process excellence tables exist
SELECT
  'Process Excellence Tables' AS test_category,
  CASE
    WHEN COUNT(*) = 4 THEN '✅ PASS'
    ELSE '❌ FAIL - Expected 4 tables, found ' || COUNT(*)
  END AS result
FROM information_schema.tables
WHERE table_name IN ('process_definitions', 'process_instances', 'waste_incidents', 'process_audits')
  AND table_schema = 'public';

-- TEST 15: Verify critical indexes exist
SELECT
  'Critical Indexes' AS test_category,
  CASE
    WHEN COUNT(*) >= 4 THEN '✅ PASS - All critical indexes exist'
    ELSE '⚠️  WARNING - Expected 4+ critical indexes, found ' || COUNT(*)
  END AS result
FROM pg_indexes
WHERE indexname IN (
  'idx_nps_surveys_created',
  'idx_grievance_tickets_dashboard',
  'idx_parent_communications_parent_created',
  'idx_maturity_assessments_institution_status'
);

-- ============================================================================
-- Summary
-- ============================================================================

SELECT '============================================' AS separator;
SELECT '📊 VERIFICATION SUMMARY' AS summary;
SELECT '============================================' AS separator;

-- Count passes and fails
WITH results AS (
  SELECT 'NPS Analytics RLS' AS test FROM pg_policies WHERE tablename = 'nps_analytics' HAVING COUNT(*) >= 4
  UNION ALL
  SELECT 'NPS Trigger DELETE' FROM pg_proc WHERE proname = 'trigger_update_nps_analytics' AND pg_get_functiondef(oid) LIKE '%TG_OP = ''DELETE''%'
  UNION ALL
  SELECT 'Grievance SLA Percentage' FROM pg_proc WHERE proname = 'update_grievance_sla_status' AND pg_get_functiondef(oid) LIKE '%v_threshold_pct%'
  UNION ALL
  SELECT 'OTP Trigger Removed' FROM pg_trigger WHERE false -- Should have 0 rows
  UNION ALL
  SELECT 'Maturity RLS Fixed' FROM pg_policies WHERE tablename LIKE 'maturity_%' AND definition NOT LIKE '%profile_id%' LIMIT 1
  UNION ALL
  SELECT 'OKR Progress Constraint' FROM information_schema.table_constraints WHERE table_name = 'okr_key_results' AND constraint_type = 'CHECK' LIMIT 1
)
SELECT
  (SELECT COUNT(*) FROM results) || ' / 6 critical fixes verified' AS status;

-- ============================================================================
-- Next Steps
-- ============================================================================

SELECT '';
SELECT '📋 NEXT STEPS:' AS next_steps;
SELECT '1. Review all test results above';
SELECT '2. If any tests show ❌ FAIL, re-apply TQM_MIGRATION_FIXES.sql';
SELECT '3. Verify billing schema column names (student_id vs learner_id)';
SELECT '4. Run integration tests on NPS, Grievance, Parent Portal';
SELECT '5. Test A/B/C/D matrix calculations on OKR module';
SELECT '6. Deploy to staging environment';
