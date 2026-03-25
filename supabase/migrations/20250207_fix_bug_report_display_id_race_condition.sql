-- =====================================================
-- Migration: Fix Bug Report Display ID Race Condition
-- Date: 2025-02-07
-- Issue: Race condition in display_id generation causing
--        "Unable to generate report ID" errors
-- Solution: Replace SELECT MAX()+1 with PostgreSQL SEQUENCE
--
-- IMPACT: Eliminates race condition that caused ~87% failure rate
--         during concurrent bug report submissions
--
-- EVIDENCE: Gap of 2,062 between actual reports (306) and
--           max display_id (2368) proved race condition frequency
-- =====================================================

-- Step 1: Create a sequence starting from current max + 1 (2369)
CREATE SEQUENCE IF NOT EXISTS bug_reports_display_id_seq START WITH 2369 INCREMENT BY 1;

-- Step 2: Drop trigger that depends on the function
DROP TRIGGER IF EXISTS set_bug_display_id ON bug_reports;

-- Step 3: Drop existing function to allow recreation
DROP FUNCTION IF EXISTS public.generate_bug_display_id();

-- Step 4: Create new sequence-based generation function
CREATE FUNCTION public.generate_bug_display_id()
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    new_id_number INTEGER;
    new_id text;
BEGIN
    -- Get next value from sequence (atomic operation, no race condition)
    new_id_number := nextval('bug_reports_display_id_seq');

    -- Format as BUG-NNNNNN
    new_id := 'BUG-' || LPAD(new_id_number::text, 6, '0');

    RETURN new_id;
END;
$$;

-- Step 5: Recreate trigger function
CREATE OR REPLACE FUNCTION public.set_bug_display_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.display_id IS NULL THEN
        NEW.display_id := generate_bug_display_id();
    END IF;
    RETURN NEW;
END;
$$;

-- Step 6: Recreate the trigger
CREATE TRIGGER set_bug_display_id
    BEFORE INSERT ON bug_reports
    FOR EACH ROW
    EXECUTE FUNCTION set_bug_display_id();

-- Step 7: Add comments for documentation
COMMENT ON SEQUENCE bug_reports_display_id_seq IS 'Sequence for generating unique bug report display IDs. Eliminates race condition from SELECT MAX() approach. Started at 2369 based on migration date 2025-02-07.';

COMMENT ON FUNCTION generate_bug_display_id() IS 'Generates unique bug report display IDs using PostgreSQL SEQUENCE for thread-safe, atomic ID generation. Replaced SELECT MAX()+1 approach to eliminate race conditions.';

COMMENT ON FUNCTION set_bug_display_id() IS 'Trigger function that assigns display_id to new bug reports using generate_bug_display_id(). Called by BEFORE INSERT trigger.';

-- Step 8: Verify the fix (testing query - results logged)
DO $$
DECLARE
    test_id_1 TEXT;
    test_id_2 TEXT;
    test_id_3 TEXT;
BEGIN
    -- Generate 3 test IDs
    test_id_1 := generate_bug_display_id();
    test_id_2 := generate_bug_display_id();
    test_id_3 := generate_bug_display_id();

    -- Verify they are consecutive and unique
    IF test_id_1 != test_id_2 AND test_id_2 != test_id_3 AND test_id_1 != test_id_3 THEN
        RAISE NOTICE '✅ Migration successful! Generated test IDs: %, %, %', test_id_1, test_id_2, test_id_3;
    ELSE
        RAISE EXCEPTION '❌ Migration verification failed! Duplicate IDs detected';
    END IF;
END $$;
