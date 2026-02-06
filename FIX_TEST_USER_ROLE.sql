-- ================================================================================
-- FIX TEST USER ROLE - Set to super_admin
-- Run this in Supabase Dashboard SQL Editor if test user doesn't have super_admin role
-- URL: https://supabase.com/dashboard/project/hhprjbgknupaplivtoib/sql/new
-- ================================================================================

-- Update test user to have super_admin role
UPDATE profiles
SET
    role = 'super_admin',
    updated_at = NOW()
WHERE email = 'test-superadmin@jkkn.local';

-- Verify the update
SELECT
    'Updated User' as status,
    id,
    email,
    role,
    updated_at
FROM profiles
WHERE email = 'test-superadmin@jkkn.local';

-- Test if sh_is_admin() now returns true
-- Note: This requires an active session with the user's JWT token
-- You'll need to test this by logging into the app and checking console
