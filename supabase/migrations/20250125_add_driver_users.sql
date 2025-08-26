-- Migration: Add Driver Users to Profiles Table
-- Date: 2025-01-25
-- Description: Creates driver user profiles with default driver role
-- Note: This creates users in auth.users table first, then creates profiles

-- First, create users in auth.users table
-- Using a DO block to handle the creation
DO $$
DECLARE
    driver_data record;
    new_user_id uuid;
BEGIN
    -- Create a temporary table with driver data
    CREATE TEMP TABLE temp_drivers (
        email text,
        full_name text,
        phone_number text
    );
    
    INSERT INTO temp_drivers VALUES
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

    -- Loop through each driver and create auth user and profile
    FOR driver_data IN SELECT * FROM temp_drivers LOOP
        -- Check if user already exists in auth.users
        SELECT id INTO new_user_id FROM auth.users WHERE email = driver_data.email;
        
        IF new_user_id IS NULL THEN
            -- User doesn't exist, create new one
            new_user_id := gen_random_uuid();
            
            -- Insert into auth.users table
            INSERT INTO auth.users (
                id,
                email,
                encrypted_password,
                email_confirmed_at,
                created_at,
                updated_at,
                raw_app_meta_data,
                raw_user_meta_data,
                aud,
                role
            ) VALUES (
                new_user_id,
                driver_data.email,
                crypt('Driver@123', gen_salt('bf')), -- Default password
                now(),
                now(),
                now(),
                '{"provider":"email","providers":["email"]}',
                jsonb_build_object(
                    'full_name', driver_data.full_name,
                    'phone_number', driver_data.phone_number
                ),
                'authenticated',
                'authenticated'
            );
            
            -- Insert into profiles table (only if not exists)
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
                new_user_id,
                driver_data.email,
                driver_data.full_name,
                driver_data.phone_number,
                'driver',
                true,
                true,
                now(),
                now()
            )
            ON CONFLICT (id) DO UPDATE SET
                email = EXCLUDED.email,
                full_name = EXCLUDED.full_name,
                phone_number = EXCLUDED.phone_number,
                role = EXCLUDED.role,
                updated_at = now();
        ELSE
            -- User exists, update or insert profile
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
                new_user_id,
                driver_data.email,
                driver_data.full_name,
                driver_data.phone_number,
                'driver',
                true,
                true,
                now(),
                now()
            )
            ON CONFLICT (id) DO UPDATE SET
                full_name = EXCLUDED.full_name,
                phone_number = EXCLUDED.phone_number,
                role = EXCLUDED.role,
                updated_at = now();
        END IF;
        
        -- Reset new_user_id for next iteration
        new_user_id := NULL;
    END LOOP;
    
    -- Drop the temporary table
    DROP TABLE temp_drivers;
END $$;

-- Grant RLS permissions for driver role (if needed)
-- Note: Drivers should only be able to view their own profile and transport-related data

-- Add a comment to track this migration
COMMENT ON TABLE public.profiles IS 'User profiles table - includes driver users added on 2025-01-25';