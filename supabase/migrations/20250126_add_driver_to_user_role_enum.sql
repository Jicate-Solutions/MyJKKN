-- Migration: Add driver to user_role enum
-- Date: 2025-01-26
-- Description: Adds 'driver' to the user_role enum type to allow proper user creation through API

-- Add 'driver' to the user_role enum if it doesn't exist
DO $$
BEGIN
    -- Check if 'driver' already exists in the enum
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_enum 
        JOIN pg_type ON pg_enum.enumtypid = pg_type.oid 
        WHERE pg_type.typname = 'user_role' 
        AND pg_enum.enumlabel = 'driver'
    ) THEN
        -- Add 'driver' to the enum
        ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'driver';
    END IF;
END $$;

-- Verify the enum now includes driver
SELECT enumlabel 
FROM pg_enum 
JOIN pg_type ON pg_enum.enumtypid = pg_type.oid 
WHERE pg_type.typname = 'user_role'
ORDER BY enumsortorder;

-- Add a comment to track this migration
COMMENT ON TYPE user_role IS 'User role enum - added driver role on 2025-01-26';