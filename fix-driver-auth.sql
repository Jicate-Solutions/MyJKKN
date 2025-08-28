-- Fix Driver Authentication Issue
-- Problem: arthanareswaran22@jkkn.ac.in was created with email provider instead of Google OAuth
-- Solution: Delete the email-based auth user and update profile for Google OAuth

-- Step 1: Check the current state before deletion
SELECT 
    au.id as auth_id,
    au.email,
    au.raw_app_meta_data->>'provider' as provider,
    p.id as profile_id,
    p.role,
    p.full_name,
    p.is_pre_registered
FROM auth.users au
LEFT JOIN profiles p ON au.id = p.id
WHERE au.email = 'arthanareswaran22@jkkn.ac.in';

-- Step 2: Store the profile data for re-creation
-- Note: You may need to note down the profile details before deletion
SELECT * FROM profiles WHERE id = '5df7ab0a-4a0c-4d89-b84c-d67f5cef2d5e';

-- Step 3: Delete from auth.users (this will cascade delete any identities)
-- This only deletes the auth user, not the profile
DELETE FROM auth.users 
WHERE id = '5df7ab0a-4a0c-4d89-b84c-d67f5cef2d5e';

-- Step 4: Update the profile to be pre-registered for Google OAuth
UPDATE profiles 
SET 
    is_pre_registered = true,
    id = gen_random_uuid(), -- Generate new UUID for pre-registration
    updated_at = NOW()
WHERE email = 'arthanareswaran22@jkkn.ac.in';

-- Step 5: Verify the changes
SELECT 
    id,
    email,
    full_name,
    role,
    is_pre_registered,
    is_active
FROM profiles 
WHERE email = 'arthanareswaran22@jkkn.ac.in';

-- After running this script:
-- 1. The driver should sign in using "Continue with Google" button
-- 2. Use the Google account: arthanareswaran22@jkkn.ac.in
-- 3. The system will automatically link the Google auth to the existing profile
-- 4. The driver role will be preserved
-- 5. No need to re-enter profile information