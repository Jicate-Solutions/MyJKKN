-- =====================================================
-- INSPECT EXISTING DATABASE SCHEMA
-- =====================================================
-- Use this to see what tables and data already exist
-- before creating anything new
-- =====================================================

-- 1. List ALL existing tables
SELECT
  table_name,
  (SELECT COUNT(*)
   FROM information_schema.columns
   WHERE columns.table_name = tables.table_name
   AND columns.table_schema = 'public') as column_count,
  '📋 Existing Table' as status
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- 2. Check specifically for profiles table
SELECT
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'profiles'
    ) THEN '✅ profiles table EXISTS'
    ELSE '❌ profiles table MISSING'
  END as profiles_status;

-- 3. If profiles table exists, show its structure
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'profiles'
ORDER BY ordinal_position;

-- 4. Count records in profiles (if table exists)
-- Uncomment if profiles table exists
-- SELECT COUNT(*) as total_profiles FROM profiles;

-- 5. Check RLS status on profiles (if exists)
SELECT
  tablename,
  rowsecurity as rls_enabled,
  CASE
    WHEN rowsecurity THEN '✅ RLS is enabled'
    ELSE '⚠️ RLS is disabled'
  END as security_status
FROM pg_tables
WHERE schemaname = 'public'
AND tablename = 'profiles';

-- 6. List RLS policies on profiles (if exists)
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd as operation,
  qual as using_expression,
  with_check as with_check_expression
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY cmd;

-- 7. Check for custom types (roles, etc.)
SELECT
  typname as type_name,
  enumlabel as enum_value,
  '📋 Existing Enum Value' as status
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
WHERE typname IN ('user_role', 'institution_type', 'learner_status')
ORDER BY typname, enumlabel;

-- 8. Check what other important tables exist
SELECT
  table_name,
  CASE
    WHEN table_name = 'profiles' THEN '👤 User Profiles'
    WHEN table_name = 'institutions' THEN '🏢 Institutions'
    WHEN table_name = 'departments' THEN '🏫 Departments'
    WHEN table_name = 'programs' THEN '📚 Programs'
    WHEN table_name = 'sections' THEN '📖 Sections'
    WHEN table_name = 'students' THEN '👨‍🎓 Students (OLD)'
    WHEN table_name = 'learners_profiles' THEN '👨‍🎓 Learners (NEW)'
    WHEN table_name = 'staff' THEN '👨‍🏫 Staff'
    WHEN table_name = 'bills' THEN '💰 Bills'
    WHEN table_name = 'payments' THEN '💳 Payments'
    WHEN table_name = 'sales' THEN '🏪 Sales'
    ELSE '📋 Other Table'
  END as table_purpose
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
  'profiles', 'institutions', 'departments', 'programs', 'sections',
  'students', 'learners_profiles', 'staff', 'bills', 'payments', 'sales'
)
ORDER BY table_name;

-- 9. Check table sizes (row counts)
-- Note: This will fail for tables that don't exist
-- Run only for tables that exist

-- SELECT 'profiles' as table_name, COUNT(*) as row_count FROM profiles
-- UNION ALL
-- SELECT 'institutions', COUNT(*) FROM institutions
-- UNION ALL
-- SELECT 'departments', COUNT(*) FROM departments
-- UNION ALL
-- SELECT 'programs', COUNT(*) FROM programs
-- UNION ALL
-- SELECT 'sections', COUNT(*) FROM sections
-- UNION ALL
-- SELECT 'staff', COUNT(*) FROM staff
-- UNION ALL
-- SELECT 'learners_profiles', COUNT(*) FROM learners_profiles
-- ORDER BY row_count DESC;

-- 10. MOST IMPORTANT: Refresh schema cache
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

-- 11. Final summary
SELECT
  '🔍 Database Inspection Complete' as status,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public') as total_tables,
  CASE
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles')
    THEN '✅ profiles table exists - just need to refresh cache'
    ELSE '❌ profiles table missing - need to create it'
  END as profiles_status,
  '🔄 Schema cache has been refreshed' as cache_status;
