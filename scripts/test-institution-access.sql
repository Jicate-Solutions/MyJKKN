-- Test script to verify institution access control
-- Run this in your Supabase SQL editor to test the implementation

-- First, let's check what institutions exist
SELECT id, name, counselling_code FROM institutions ORDER BY name;

-- Check what users exist and their roles
SELECT 
  id, 
  email, 
  role, 
  institution_id,
  is_super_admin
FROM profiles 
WHERE email IS NOT NULL 
ORDER BY role, email;

-- Check user institution access records
SELECT 
  uia.user_id,
  p.email,
  p.role,
  i.name as institution_name,
  uia.access_type,
  uia.is_active
FROM user_institution_access uia
JOIN profiles p ON p.id = uia.user_id
JOIN institutions i ON i.id = uia.institution_id
ORDER BY p.email, i.name;

-- Test the user_has_institution_access function
-- Replace these UUIDs with actual values from your database
DO $$
DECLARE
    test_user_id UUID;
    test_institution_id UUID;
    has_access BOOLEAN;
BEGIN
    -- Get a test user (replace with actual user ID)
    SELECT id INTO test_user_id FROM profiles WHERE role = 'faculty' LIMIT 1;
    
    -- Get a test institution
    SELECT id INTO test_institution_id FROM institutions LIMIT 1;
    
    IF test_user_id IS NOT NULL AND test_institution_id IS NOT NULL THEN
        SELECT user_has_institution_access(test_user_id, test_institution_id) INTO has_access;
        RAISE NOTICE 'User % has access to institution %: %', test_user_id, test_institution_id, has_access;
    ELSE
        RAISE NOTICE 'No test data available';
    END IF;
END $$;

-- Test RLS by switching to different users (this would need to be done in application context)
-- The following queries would return different results based on current authenticated user:
-- SELECT * FROM institutions; -- Should only show accessible institutions
-- SELECT count(*) FROM institutions; -- Count should vary by user 