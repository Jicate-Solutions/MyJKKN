-- Migration: Fix booking_type enum or convert to VARCHAR
-- Date: 2025-09-30
-- Description: Fix the booking_type column to accept 'reservation', 'walk_in', 'both' values

-- Option 1: If booking_type is an enum, drop and recreate it with correct values
DO $$ 
BEGIN
    -- Check if booking_type is an enum type
    IF EXISTS (
        SELECT 1 
        FROM pg_type 
        WHERE typname = 'booking_type'
    ) THEN
        -- Drop the enum constraint first
        ALTER TABLE public.resources 
        ALTER COLUMN booking_type TYPE VARCHAR(50);
        
        -- Drop the old enum type
        DROP TYPE IF EXISTS booking_type CASCADE;
    END IF;
END $$;

-- Option 2: Ensure booking_type is VARCHAR(50) and can accept our values
ALTER TABLE public.resources 
ALTER COLUMN booking_type TYPE VARCHAR(50);

-- Add a check constraint for valid values
ALTER TABLE public.resources
DROP CONSTRAINT IF EXISTS resources_booking_type_check;

ALTER TABLE public.resources
ADD CONSTRAINT resources_booking_type_check 
CHECK (booking_type IN ('reservation', 'walk_in', 'both'));

-- Set default value
ALTER TABLE public.resources
ALTER COLUMN booking_type SET DEFAULT 'reservation';

-- Update any NULL values to default
UPDATE public.resources
SET booking_type = 'reservation'
WHERE booking_type IS NULL;

COMMENT ON COLUMN public.resources.booking_type IS 'Type of booking: reservation (advance booking), walk_in (immediate), or both';
