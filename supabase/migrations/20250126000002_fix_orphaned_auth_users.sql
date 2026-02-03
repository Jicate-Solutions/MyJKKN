-- Fix orphaned auth users and link them to pre-registered profiles
-- Date: 2025-01-26
-- Purpose: Handle cases where auth.users exist without profiles or with mismatched profiles

-- Create a temporary function to fix orphaned users
CREATE OR REPLACE FUNCTION fix_orphaned_auth_users()
RETURNS TABLE (
    action TEXT,
    email TEXT,
    auth_id UUID,
    profile_id UUID
) AS $$
DECLARE
    auth_record RECORD;
    profile_record RECORD;
BEGIN
    -- Find all auth users without matching profiles
    FOR auth_record IN 
        SELECT au.id, au.email
        FROM auth.users au
        LEFT JOIN public.profiles p ON au.id = p.id
        WHERE p.id IS NULL
    LOOP
        -- Check if there's a pre-registered profile with the same email
        SELECT * INTO profile_record
        FROM public.profiles p
        WHERE p.email = auth_record.email
        AND p.is_pre_registered = TRUE
        LIMIT 1;
        
        IF FOUND THEN
            -- First, delete the pre-registered profile to avoid email conflict
            DELETE FROM public.profiles WHERE id = profile_record.id;
            
            -- Then create a proper profile for the auth user
            INSERT INTO public.profiles (
                id,
                email,
                full_name,
                role,
                phone_number,
                institution_id,
                profile_completed,
                is_active,
                is_pre_registered,
                created_at,
                updated_at
            )
            VALUES (
                auth_record.id,
                profile_record.email,
                profile_record.full_name,
                profile_record.role,
                profile_record.phone_number,
                profile_record.institution_id,
                profile_record.profile_completed,
                profile_record.is_active,
                FALSE, -- No longer pre-registered
                NOW(),
                NOW()
            )
            ON CONFLICT (id) DO UPDATE SET
                email = EXCLUDED.email,
                full_name = EXCLUDED.full_name,
                role = EXCLUDED.role,
                is_pre_registered = FALSE,
                updated_at = NOW();
            
            RETURN QUERY SELECT 
                'Linked pre-registered profile'::TEXT,
                auth_record.email::TEXT,
                auth_record.id,
                profile_record.id;
        ELSE
            -- No pre-registered profile found, create a basic profile
            INSERT INTO public.profiles (
                id,
                email,
                role,
                profile_completed,
                is_active,
                is_pre_registered,
                created_at,
                updated_at
            )
            VALUES (
                auth_record.id,
                auth_record.email,
                'guest', -- Default role for orphaned users
                FALSE,
                TRUE,
                FALSE,
                NOW(),
                NOW()
            )
            ON CONFLICT (id) DO NOTHING;
            
            RETURN QUERY SELECT 
                'Created basic profile'::TEXT,
                auth_record.email::TEXT,
                auth_record.id,
                auth_record.id;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Execute the fix
SELECT * FROM fix_orphaned_auth_users();

-- Drop the temporary function
DROP FUNCTION fix_orphaned_auth_users();

-- Verify the fix
DO $$
DECLARE
    orphan_count INTEGER;
    fixed_count INTEGER;
BEGIN
    -- Count orphaned auth users
    SELECT COUNT(*) INTO orphan_count
    FROM auth.users au
    LEFT JOIN public.profiles p ON au.id = p.id
    WHERE p.id IS NULL;
    
    -- Count properly linked driver users
    SELECT COUNT(*) INTO fixed_count
    FROM auth.users au
    INNER JOIN public.profiles p ON au.id = p.id
    WHERE p.role = 'driver' AND p.is_pre_registered = FALSE;
    
    RAISE NOTICE 'Orphaned auth users remaining: %', orphan_count;
    RAISE NOTICE 'Active driver users: %', fixed_count;
    
    IF orphan_count = 0 THEN
        RAISE NOTICE 'All auth users have been properly linked to profiles!';
    END IF;
END $$;