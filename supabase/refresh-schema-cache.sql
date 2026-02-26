-- =====================================================
-- REFRESH SUPABASE SCHEMA CACHE
-- =====================================================
-- Run this whenever you get "Could not find table in schema cache"
-- This forces PostgREST to reload the database schema
-- =====================================================

-- Method 1: Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

-- Method 2: Alternative - reload config
NOTIFY pgrst, 'reload config';

-- Verify profiles table exists
SELECT
  table_name,
  table_schema,
  '✅ Table exists in database' as status
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name = 'profiles';

-- Check table permissions
SELECT
  grantee,
  privilege_type,
  '✅ Permission granted' as status
FROM information_schema.role_table_grants
WHERE table_name = 'profiles'
AND table_schema = 'public';

-- Quick test: Can we query the table?
SELECT
  COUNT(*) as profile_count,
  CASE
    WHEN COUNT(*) = 0 THEN '✅ Table accessible (empty, ready for data)'
    ELSE '✅ Table accessible with ' || COUNT(*) || ' profiles'
  END as status
FROM profiles;
