-- ============================================
-- MIGRATION: Fix Learner Application ID Generation
-- ============================================
-- Created: 2025-01-19
-- Purpose: Replace incorrect year-based IDs with institution-based IDs (JKKN-COP-xxx)
-- Format: JKKN-{counselling_code}-{seq_num}
-- Example: JKKN-COP-194
-- ============================================

-- Drop the incorrect year-based function and trigger
DROP TRIGGER IF EXISTS trg_set_learner_application_id ON learners_profiles;
DROP FUNCTION IF EXISTS public.generate_learner_application_id();
DROP FUNCTION IF EXISTS public.set_learner_application_id();

-- ============================================
-- FUNCTION: Generate Institution-Based Application ID
-- ============================================
-- Format: JKKN-{counselling_code}-{seq_num}
-- Example: JKKN-COP-194
-- Sequence is per-institution, continuous from existing records
-- ============================================
CREATE OR REPLACE FUNCTION public.generate_learner_application_id(institution_id_param uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    inst_code text;
    seq_num integer;
    app_id text;
BEGIN
    -- Get institution counselling code (e.g., "COP" for JKKN College of Pharmacy)
    SELECT COALESCE(counselling_code, SUBSTRING(name, 1, 3))
    INTO inst_code
    FROM institutions
    WHERE id = institution_id_param;

    IF inst_code IS NULL THEN
        RAISE EXCEPTION 'Institution not found: %', institution_id_param;
    END IF;

    -- Get next sequence number for this institution
    -- Search for existing IDs matching the pattern: JKKN-{inst_code}-xxx
    SELECT COALESCE(
        MAX(
            CASE
                WHEN application_id ~ ('^JKKN-' || inst_code || '-[0-9]+$')
                THEN SUBSTRING(application_id FROM '[0-9]+$')::integer
                ELSE 0
            END
        ),
        0
    ) + 1
    INTO seq_num
    FROM learners_profiles
    WHERE institution_id = institution_id_param;

    -- Format: JKKN-COP-194 (institution prefix + counselling code + sequence)
    app_id := 'JKKN-' || inst_code || '-' || seq_num::text;

    RETURN app_id;
END;
$$;

-- ============================================
-- FUNCTION: Set Learner Application ID Trigger
-- ============================================
-- Auto-generates application ID on INSERT if not provided
-- Only generates for records with valid institution_id
-- ============================================
CREATE OR REPLACE FUNCTION public.set_learner_application_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    -- Only generate if application_id is empty and institution_id exists
    IF (NEW.application_id IS NULL OR NEW.application_id = '') AND NEW.institution_id IS NOT NULL THEN
        NEW.application_id := generate_learner_application_id(NEW.institution_id);
    END IF;

    RETURN NEW;
END;
$$;

-- ============================================
-- TRIGGER: Auto-generate Application ID
-- ============================================
-- Fires BEFORE INSERT to set application_id
-- ============================================
CREATE TRIGGER trg_set_learner_application_id
    BEFORE INSERT ON learners_profiles
    FOR EACH ROW
    EXECUTE FUNCTION set_learner_application_id();

-- ============================================
-- COMMENT
-- ============================================
COMMENT ON FUNCTION generate_learner_application_id(uuid) IS
'Generates institution-based application IDs in format: JKKN-{counselling_code}-{seq_num}.
Sequence is per-institution and continues from existing records.
Example: JKKN-COP-194 (JKKN College of Pharmacy, sequence 194)';

COMMENT ON FUNCTION set_learner_application_id() IS
'Trigger function to auto-generate application_id on INSERT for learners_profiles table.
Only generates if application_id is empty and institution_id is provided.';
