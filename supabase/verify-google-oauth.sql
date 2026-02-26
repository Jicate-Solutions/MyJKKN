-- ============================================
-- Google OAuth Verification Queries
-- Run these in Supabase SQL Editor after setup
-- ============================================

-- 1. Check if Google provider is enabled
-- Expected: Should return a row with provider = 'google' if enabled
SELECT *
FROM auth.providers
WHERE id = 'google';

-- 2. Verify your test user profile was created
-- Replace 'your-email@gmail.com' with your actual test email
SELECT
  id,
  email,
  role,
  full_name,
  profile_completed,
  institution_id,
  created_at,
  updated_at
FROM profiles
WHERE email = 'your-email@gmail.com';

-- 3. Check auth.users table for OAuth user
-- Replace 'your-email@gmail.com' with your actual test email
SELECT
  id,
  email,
  raw_app_meta_data->>'provider' as provider,
  raw_user_meta_data->>'avatar_url' as avatar,
  raw_user_meta_data->>'full_name' as name,
  email_confirmed_at,
  created_at,
  last_sign_in_at
FROM auth.users
WHERE email = 'your-email@gmail.com';

-- 4. List all OAuth identities for a user
-- Replace 'your-email@gmail.com' with your actual test email
SELECT
  u.email,
  i.provider,
  i.provider_id,
  i.created_at as linked_at
FROM auth.identities i
JOIN auth.users u ON u.id = i.user_id
WHERE u.email = 'your-email@gmail.com';

-- 5. Count all users by authentication provider
SELECT
  raw_app_meta_data->>'provider' as auth_provider,
  COUNT(*) as user_count
FROM auth.users
GROUP BY auth_provider
ORDER BY user_count DESC;

-- 6. Recent Google OAuth sign-ins (last 24 hours)
SELECT
  email,
  created_at,
  last_sign_in_at,
  raw_user_meta_data->>'full_name' as name
FROM auth.users
WHERE raw_app_meta_data->>'provider' = 'google'
  AND created_at >= NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- 7. Check RLS policies on profiles table
-- Ensures authenticated users can read/write their own profile
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'profiles';

-- 8. Verify institution access (if applicable)
-- Replace 'your-email@gmail.com' with your actual test email
SELECT
  p.email,
  p.institution_id,
  i.name as institution_name,
  i.code as institution_code
FROM profiles p
LEFT JOIN institutions i ON i.id = p.institution_id
WHERE p.email = 'your-email@gmail.com';

-- ============================================
-- Troubleshooting Queries
-- ============================================

-- If user can't sign in, check for duplicate emails
SELECT
  email,
  COUNT(*) as duplicate_count
FROM auth.users
GROUP BY email
HAVING COUNT(*) > 1;

-- Check for orphaned profiles (profile without auth.user)
SELECT p.*
FROM profiles p
LEFT JOIN auth.users u ON u.id = p.id
WHERE u.id IS NULL;

-- Check auth logs for errors (if auth.logs exists)
-- This may require enabling auth logs in Supabase dashboard
-- SELECT *
-- FROM auth.audit_log_entries
-- WHERE created_at >= NOW() - INTERVAL '1 hour'
-- ORDER BY created_at DESC
-- LIMIT 50;

-- ============================================
-- Quick Test Setup
-- ============================================

-- Add a test institution if needed (optional)
-- Only run this if you need to test institution-based access
-- INSERT INTO institutions (name, code, type)
-- VALUES ('Test Institution', 'TEST', 'college')
-- ON CONFLICT (code) DO NOTHING
-- RETURNING id, name, code;
