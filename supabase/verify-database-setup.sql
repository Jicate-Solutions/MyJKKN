-- =====================================================
-- DATABASE SETUP VERIFICATION SCRIPT
-- =====================================================
-- Run this after executing all setup files
-- =====================================================

-- 1. Check if all main tables exist
SELECT
  table_name,
  CASE
    WHEN table_name IN ('profiles', 'institutions', 'departments', 'programs',
                        'sections', 'semesters', 'learners_profiles')
    THEN '✅ Core Table'
    ELSE '📋 Other Table'
  END as table_type
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- 2. Count total tables
SELECT
  COUNT(*) as total_tables,
  CASE
    WHEN COUNT(*) >= 20 THEN '✅ Good - Multiple tables created'
    WHEN COUNT(*) >= 10 THEN '⚠️ Partial - Some tables missing?'
    ELSE '❌ Error - Very few tables'
  END as status
FROM information_schema.tables
WHERE table_schema = 'public';

-- 3. Verify critical tables exist
SELECT
  table_name,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND information_schema.tables.table_name = t.table_name
    ) THEN '✅ EXISTS'
    ELSE '❌ MISSING'
  END as status
FROM (VALUES
  ('profiles'),
  ('institutions'),
  ('departments'),
  ('programs'),
  ('sections'),
  ('semesters'),
  ('learners_profiles'),
  ('staff'),
  ('bills'),
  ('payments')
) AS t(table_name);

-- 4. Check if RLS (Row Level Security) is enabled
SELECT
  tablename,
  rowsecurity as rls_enabled,
  CASE
    WHEN rowsecurity THEN '✅ RLS Enabled'
    ELSE '⚠️ RLS Disabled'
  END as security_status
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('profiles', 'institutions', 'learners_profiles', 'bills', 'payments')
ORDER BY tablename;

-- 5. Check RLS policies on profiles table
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd as operation,
  CASE
    WHEN cmd = 'SELECT' THEN '📖 Read Policy'
    WHEN cmd = 'INSERT' THEN '➕ Create Policy'
    WHEN cmd = 'UPDATE' THEN '✏️ Update Policy'
    WHEN cmd = 'DELETE' THEN '🗑️ Delete Policy'
    ELSE '❓ Other Policy'
  END as policy_type
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY cmd;

-- 6. Check installed extensions
SELECT
  extname as extension_name,
  extversion as version,
  CASE
    WHEN extname = 'uuid-ossp' THEN '✅ UUID Generation'
    WHEN extname = 'pgcrypto' THEN '✅ Encryption Functions'
    ELSE '📦 Other Extension'
  END as purpose
FROM pg_extension
WHERE extname IN ('uuid-ossp', 'pgcrypto', 'pg_stat_statements');

-- 7. Check custom types
SELECT
  typname as type_name,
  CASE
    WHEN typname = 'user_role' THEN '✅ User Roles Enum'
    WHEN typname = 'institution_type' THEN '✅ Institution Types'
    WHEN typname = 'learner_status' THEN '✅ Learner Status'
    ELSE '📋 Other Type'
  END as type_purpose
FROM pg_type
WHERE typname IN ('user_role', 'institution_type', 'learner_status', 'payment_status', 'bill_status')
ORDER BY typname;

-- 8. Check triggers on profiles table
SELECT
  tgname as trigger_name,
  tgrelid::regclass as table_name,
  proname as function_name,
  CASE
    WHEN tgtype & 2 = 2 THEN 'BEFORE'
    WHEN tgtype & 64 = 64 THEN 'INSTEAD OF'
    ELSE 'AFTER'
  END as timing,
  CASE
    WHEN tgtype & 4 = 4 THEN 'INSERT'
    WHEN tgtype & 8 = 8 THEN 'DELETE'
    WHEN tgtype & 16 = 16 THEN 'UPDATE'
    ELSE 'UNKNOWN'
  END as event
FROM pg_trigger
JOIN pg_proc ON pg_trigger.tgfoid = pg_proc.oid
WHERE tgrelid::regclass::text = 'profiles'
AND tgname NOT LIKE 'RI_%'; -- Exclude system triggers

-- 9. Check if profiles table has correct columns
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default,
  CASE
    WHEN column_name IN ('id', 'email', 'role', 'created_at', 'updated_at')
    THEN '✅ Core Column'
    ELSE '📋 Optional Column'
  END as column_type
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'profiles'
ORDER BY ordinal_position;

-- 10. Test query to check if profiles table is accessible
SELECT
  CASE
    WHEN COUNT(*) = 0 THEN '✅ Table accessible (empty, ready for users)'
    ELSE '✅ Table accessible with ' || COUNT(*) || ' profiles'
  END as status
FROM profiles;

-- 11. Check foreign key relationships
SELECT
  tc.table_name as from_table,
  kcu.column_name as from_column,
  ccu.table_name AS to_table,
  ccu.column_name AS to_column,
  '✅ FK Constraint' as status
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
AND tc.table_name IN ('profiles', 'learners_profiles', 'staff', 'sections')
ORDER BY from_table, from_column;

-- 12. Summary Report
SELECT
  '✅ Database Setup Complete!' as status,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public') as total_tables,
  (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'profiles') as profile_policies,
  (SELECT COUNT(*) FROM pg_extension WHERE extname IN ('uuid-ossp', 'pgcrypto')) as extensions_installed,
  CASE
    WHEN (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public') >= 20
    AND (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'profiles') >= 1
    AND (SELECT COUNT(*) FROM pg_extension WHERE extname IN ('uuid-ossp', 'pgcrypto')) >= 2
    THEN '✅ ALL CHECKS PASSED - Ready for use!'
    ELSE '⚠️ SOME CHECKS FAILED - Review errors above'
  END as overall_status;

-- =====================================================
-- QUICK TEST: Try to insert a test profile
-- =====================================================
-- Uncomment below to test profile creation
-- (This will fail if RLS is working and you're not authenticated)

-- INSERT INTO profiles (email, full_name, role)
-- VALUES ('test@example.com', 'Test User', 'student')
-- RETURNING id, email, full_name, role, created_at;

-- =====================================================
-- END OF VERIFICATION
-- =====================================================
