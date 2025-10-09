-- =====================================================
-- Migration: Fix grant_user_institution_access Function Overload
-- Date: 2025-10-09
-- Issue: Two versions of grant_user_institution_access exist with different parameter types
--        causing PostgreSQL function overload resolution error
-- Error: "Could not choose the best candidate function between..."
-- =====================================================

-- =====================================================
-- PART 1: Drop Existing Overloaded Functions
-- =====================================================

-- Drop both versions of the function to resolve the overload
DROP FUNCTION IF EXISTS public.grant_user_institution_access(
    uuid, uuid, text, uuid
);

DROP FUNCTION IF EXISTS public.grant_user_institution_access(
    uuid, uuid, character varying, uuid
);

-- =====================================================
-- PART 2: Create Single Consistent Function
-- =====================================================

-- Create a single, well-defined version using TEXT type
CREATE OR REPLACE FUNCTION public.grant_user_institution_access(
    target_user_id uuid,
    target_institution_id uuid,
    access_type_param text DEFAULT 'full',
    granted_by_param uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Insert or update the access record
    INSERT INTO user_institution_access (
        user_id,
        institution_id,
        access_type,
        granted_by,
        is_active,
        created_at,
        updated_at
    )
    VALUES (
        target_user_id,
        target_institution_id,
        access_type_param,
        COALESCE(granted_by_param, auth.uid()),
        true,
        NOW(),
        NOW()
    )
    ON CONFLICT (user_id, institution_id)
    DO UPDATE SET
        access_type = access_type_param,
        granted_by = COALESCE(granted_by_param, auth.uid()),
        is_active = true,
        updated_at = NOW();
END;
$$;

-- Add function comment
COMMENT ON FUNCTION public.grant_user_institution_access(uuid, uuid, text, uuid) IS
'Grants or updates institution access for a user.
Updated: 2025-10-09 - Fixed function overload issue by using single TEXT type.
Parameters:
- target_user_id: The user to grant access to
- target_institution_id: The institution to grant access to
- access_type_param: Type of access (admin, write, read, billing, full, super_admin)
- granted_by_param: User granting the access (defaults to current user)';

-- =====================================================
-- PART 3: Update 02_functions.sql Reference
-- =====================================================

-- NOTE: After running this migration, update supabase/setup/02_functions.sql
-- to use only TEXT type for the access_type_param parameter

-- =====================================================
-- PART 4: Verification
-- =====================================================

-- Verify only one version exists
DO $$
DECLARE
    function_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO function_count
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'grant_user_institution_access'
    AND n.nspname = 'public';

    RAISE NOTICE '=== Migration Verification ===';
    RAISE NOTICE 'Number of grant_user_institution_access functions: %', function_count;

    IF function_count = 1 THEN
        RAISE NOTICE '✓ Function overload resolved successfully';
    ELSE
        RAISE WARNING 'Still have % versions of the function!', function_count;
    END IF;
END $$;

-- =====================================================
-- ROLLBACK INSTRUCTIONS (if needed)
-- =====================================================

/*
To rollback this migration:

-- Drop the new function
DROP FUNCTION IF EXISTS public.grant_user_institution_access(uuid, uuid, text, uuid);

-- Recreate the previous versions (if needed for compatibility)
-- NOTE: This will recreate the overload issue
*/

-- =====================================================
-- End of Migration
-- =====================================================
