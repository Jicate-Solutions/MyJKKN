-- ================================================================================
-- VERIFY TEST USER ROLE IN STAGING DATABASE
-- Run this in Supabase Dashboard SQL Editor
-- URL: https://supabase.com/dashboard/project/hhprjbgknupaplivtoib/sql/new
-- ================================================================================

-- 1. Check if test user exists in profiles table
SELECT
    'Test User Profile' as check_name,
    id,
    email,
    role,
    department_id,
    institution_id,
    created_at
FROM profiles
WHERE email = 'test-superadmin@jkkn.local';

-- 2. Check if test user exists in auth.users
SELECT
    'Test User Auth' as check_name,
    id,
    email,
    created_at,
    email_confirmed_at,
    last_sign_in_at
FROM auth.users
WHERE email = 'test-superadmin@jkkn.local';

-- 3. Test if sh_is_admin() works for this user
-- First get the user's UUID
DO $$
DECLARE
    user_uuid uuid;
BEGIN
    SELECT id INTO user_uuid FROM auth.users WHERE email = 'test-superadmin@jkkn.local';
    RAISE NOTICE 'Test user UUID: %', user_uuid;
END $$;

-- 4. Count all profiles with super_admin role
SELECT
    'Super Admin Count' as check_name,
    COUNT(*) as count
FROM profiles
WHERE role = 'super_admin';

-- 5. List all super_admin users
SELECT
    'All Super Admins' as check_name,
    email,
    role
FROM profiles
WHERE role = 'super_admin'
ORDER BY email;

-- ================================================================================
-- EXPECTED RESULTS
-- ================================================================================
-- Test User Profile: Should show role = 'super_admin'
-- Test User Auth: Should have email_confirmed_at set
-- Super Admin Count: Should be at least 1
-- All Super Admins: Should include test-superadmin@jkkn.local

-- ================================================================================
-- IF TEST USER DOESN'T HAVE SUPER_ADMIN ROLE, RUN THIS FIX:
-- ================================================================================
-- UPDATE profiles
-- SET role = 'super_admin'
-- WHERE email = 'test-superadmin@jkkn.local';
-- ================================================================================
