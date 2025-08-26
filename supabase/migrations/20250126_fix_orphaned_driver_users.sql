-- Migration: Fix Orphaned Driver Users
-- Date: 2025-01-26
-- Description: Creates profiles for driver auth users that don't have profiles yet

-- Create profiles for orphaned driver auth users
DO $$
DECLARE
    orphaned_user record;
    driver_data record;
BEGIN
    -- Create a temporary table with driver data for reference
    CREATE TEMP TABLE temp_driver_info (
        email text,
        full_name text,
        phone_number text
    );
    
    INSERT INTO temp_driver_info VALUES
        ('arthanareswaran22@jkkn.ac.in', 'P.ARTHANARESWARAN', '9942488343'),
        ('rajesh18@jkkn.ac.in', 'A.RAJESH', '9434429'),
        ('saravanan6@jkkn.ac.in', 'C.SARAVANAN', '6344846772'),
        ('thirumoorthy11@jkkn.ac.in', 'P.THIRUMOORTHY', '9916829080'),
        ('kannan14@jkkn.ac.in', 'G.KANNAN', '8144436020'),
        ('ramachjandran16@jkkn.ac.in', 'C.RAMACHJANDRAN', '9566340999'),
        ('sakthivel32@jkkn.ac.in', 'C.SAKTHIVEL', '9944273037'),
        ('sivakumar36@jkkn.ac.in', 'N.SIVAKUMAR', '9965033307'),
        ('kathirvel5@jkkn.ac.in', 'N.KATHIRVEL', '9942808863'),
        ('manojkumar12@jkkn.ac.in', 'M.MANOJKUMAR', '9965171516'),
        ('sathiyamoorthy7@jkkn.ac.in', 'P.SATHIYAMOORTHY', '6297930190'),
        ('suthagar29@jkkn.ac.in', 'D.SUTHAGAR', '9952483580'),
        ('devendran31@jkkn.ac.in', 'R.DEVENDRAN', '9578962886'),
        ('gokul19@jkkn.ac.in', 'V.GOKUL', '7373241431'),
        ('muthukumar37@jkkn.ac.in', 'P.MUTHUKUMAR', '9585485891'),
        ('arun24@jkkn.ac.in', 'T.ARUN', '9994501280'),
        ('siva23@jkkn.ac.in', 'G.SIVA', '9360908052'),
        ('selvaraj15@jkkn.ac.in', 'SELVARAJ', '9486190727'),
        ('ravi10@jkkn.ac.in', 'R.RAVI', '9944674296'),
        ('thavasiayappan20@jkkn.ac.in', 'THAVASIAYAPPAN', '9791900193');

    -- Find all orphaned auth users (users in auth.users but not in profiles)
    FOR orphaned_user IN 
        SELECT 
            au.id,
            au.email
        FROM auth.users au
        LEFT JOIN public.profiles p ON au.id = p.id
        WHERE p.id IS NULL
        AND au.email IN (SELECT email FROM temp_driver_info)
    LOOP
        -- Get the driver data for this email
        SELECT * INTO driver_data 
        FROM temp_driver_info 
        WHERE email = orphaned_user.email;
        
        IF driver_data IS NOT NULL THEN
            -- Create the profile for this orphaned user
            INSERT INTO public.profiles (
                id,
                email,
                full_name,
                phone_number,
                role,
                is_active,
                profile_completed,
                created_at,
                updated_at
            ) VALUES (
                orphaned_user.id,
                orphaned_user.email,
                driver_data.full_name,
                driver_data.phone_number,
                'driver',
                true,
                true,
                now(),
                now()
            )
            ON CONFLICT (id) DO NOTHING; -- Skip if profile already exists
            
            RAISE NOTICE 'Created profile for orphaned driver user: %', orphaned_user.email;
        END IF;
    END LOOP;
    
    -- Also check for any other orphaned auth users not in the driver list
    FOR orphaned_user IN 
        SELECT 
            au.id,
            au.email,
            au.raw_user_meta_data->>'full_name' as full_name,
            au.raw_user_meta_data->>'phone_number' as phone_number
        FROM auth.users au
        LEFT JOIN public.profiles p ON au.id = p.id
        WHERE p.id IS NULL
        AND au.email NOT IN (SELECT email FROM temp_driver_info)
    LOOP
        -- Create a basic profile for other orphaned users
        INSERT INTO public.profiles (
            id,
            email,
            full_name,
            phone_number,
            role,
            is_active,
            profile_completed,
            created_at,
            updated_at
        ) VALUES (
            orphaned_user.id,
            orphaned_user.email,
            COALESCE(orphaned_user.full_name, split_part(orphaned_user.email, '@', 1)),
            orphaned_user.phone_number,
            'guest', -- Default role for unknown orphaned users
            true,
            false, -- Mark as incomplete so they can update their profile
            now(),
            now()
        )
        ON CONFLICT (id) DO NOTHING;
        
        RAISE NOTICE 'Created basic profile for orphaned user: %', orphaned_user.email;
    END LOOP;
    
    -- Drop the temporary table
    DROP TABLE temp_driver_info;
END $$;

-- Verify all driver users now have profiles
SELECT 
    au.email,
    au.id,
    CASE 
        WHEN p.id IS NOT NULL THEN 'Has Profile'
        ELSE 'Missing Profile'
    END as profile_status,
    p.role
FROM auth.users au
LEFT JOIN public.profiles p ON au.id = p.id
WHERE au.email LIKE '%@jkkn.ac.in'
AND (au.email LIKE '%driver%' OR au.email IN (
    'arthanareswaran22@jkkn.ac.in',
    'rajesh18@jkkn.ac.in',
    'saravanan6@jkkn.ac.in',
    'thirumoorthy11@jkkn.ac.in',
    'kannan14@jkkn.ac.in',
    'ramachjandran16@jkkn.ac.in',
    'sakthivel32@jkkn.ac.in',
    'sivakumar36@jkkn.ac.in',
    'kathirvel5@jkkn.ac.in',
    'manojkumar12@jkkn.ac.in',
    'sathiyamoorthy7@jkkn.ac.in',
    'suthagar29@jkkn.ac.in',
    'devendran31@jkkn.ac.in',
    'gokul19@jkkn.ac.in',
    'muthukumar37@jkkn.ac.in',
    'arun24@jkkn.ac.in',
    'siva23@jkkn.ac.in',
    'selvaraj15@jkkn.ac.in',
    'ravi10@jkkn.ac.in',
    'thavasiayappan20@jkkn.ac.in'
))
ORDER BY au.email;

-- Add a comment to track this migration
COMMENT ON TABLE public.profiles IS 'User profiles table - fixed orphaned driver users on 2025-01-26';