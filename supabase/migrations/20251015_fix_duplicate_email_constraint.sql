-- Fix duplicate email constraint preventing pre-registered profile migration
-- Date: 2025-10-15
-- Purpose: Drop the full unique constraint on email, keep only partial index for non-pre-registered profiles

-- The profiles_email_key constraint was preventing migration of pre-registered profiles
-- because it blocks ALL duplicate emails, even during the migration window
-- We already have idx_profiles_email_unique_active which handles uniqueness correctly

DO $$
BEGIN
    -- Drop the old unique constraint on email
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'profiles_email_key'
        AND conrelid = 'public.profiles'::regclass
    ) THEN
        ALTER TABLE public.profiles DROP CONSTRAINT profiles_email_key;
        RAISE NOTICE 'Dropped profiles_email_key constraint';
    ELSE
        RAISE NOTICE 'profiles_email_key constraint not found (already dropped)';
    END IF;
END $$;

-- Verify the partial index exists (should already be there from 20250126_remove_auth_fkey_for_preregistration.sql)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'idx_profiles_email_unique_active'
    ) THEN
        RAISE NOTICE 'Partial unique index idx_profiles_email_unique_active exists - migration emails allowed';
    ELSE
        RAISE WARNING 'Partial unique index idx_profiles_email_unique_active NOT found!';
        -- Create it if missing
        CREATE UNIQUE INDEX idx_profiles_email_unique_active
        ON public.profiles(email)
        WHERE is_pre_registered = FALSE;
        RAISE NOTICE 'Created partial unique index idx_profiles_email_unique_active';
    END IF;
END $$;

-- Add comment explaining the design
COMMENT ON INDEX idx_profiles_email_unique_active IS
'Partial unique index allowing duplicate emails during pre-registered profile migration.
Only enforces email uniqueness for active (non-pre-registered) profiles.
This allows the DELETE + INSERT pattern in callback route to work correctly.';

-- Verify current state
DO $$
DECLARE
    constraint_count INT;
    index_count INT;
BEGIN
    SELECT COUNT(*) INTO constraint_count
    FROM pg_constraint
    WHERE conname = 'profiles_email_key'
    AND conrelid = 'public.profiles'::regclass;

    SELECT COUNT(*) INTO index_count
    FROM pg_indexes
    WHERE indexname = 'idx_profiles_email_unique_active';

    RAISE NOTICE '=== Migration Complete ===';
    RAISE NOTICE 'profiles_email_key constraint: % (should be 0)', constraint_count;
    RAISE NOTICE 'idx_profiles_email_unique_active index: % (should be 1)', index_count;
    RAISE NOTICE 'Pre-registered profile migration is now enabled.';
END $$;
