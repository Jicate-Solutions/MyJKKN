-- ================================================================================
-- LEARNER APPLICATION ID GENERATION
-- Created: 2025-01-19
-- Purpose: Auto-generate application IDs for learner profiles in format JKKN-YYYY-####
-- ================================================================================

-- Function to generate application ID for learners
-- Format: JKKN-YYYY-#### (e.g., JKKN-2025-0001)
CREATE OR REPLACE FUNCTION public.generate_learner_application_id()
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    year_code text;
    seq_num integer;
    app_id text;
BEGIN
    -- Get current year (4 digits)
    year_code := TO_CHAR(NOW(), 'YYYY');

    -- Get next sequence number for this year
    -- Count existing learner profiles with application_id starting with JKKN-YYYY
    SELECT COALESCE(MAX(SUBSTRING(application_id FROM '[0-9]+$')::integer), 0) + 1
    INTO seq_num
    FROM learners_profiles
    WHERE application_id LIKE 'JKKN-' || year_code || '-%';

    -- Format application ID: JKKN-YYYY-#### (4 digits with leading zeros)
    app_id := 'JKKN-' || year_code || '-' || LPAD(seq_num::text, 4, '0');

    RETURN app_id;
END;
$$;

-- Trigger function to set application ID on learner profile creation
CREATE OR REPLACE FUNCTION public.set_learner_application_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    -- Only generate application_id if not already provided and lifecycle_status is enquiry or pending
    IF NEW.application_id IS NULL AND NEW.lifecycle_status IN ('enquiry', 'pending') THEN
        NEW.application_id := generate_learner_application_id();
    END IF;

    RETURN NEW;
END;
$$;

-- Create trigger to auto-generate application ID
DROP TRIGGER IF EXISTS trigger_set_learner_application_id ON learners_profiles;
CREATE TRIGGER trigger_set_learner_application_id
    BEFORE INSERT ON learners_profiles
    FOR EACH ROW
    EXECUTE FUNCTION set_learner_application_id();

-- Comment on function
COMMENT ON FUNCTION public.generate_learner_application_id() IS
'Generates unique application IDs for learner profiles in format JKKN-YYYY-####';

COMMENT ON FUNCTION public.set_learner_application_id() IS
'Trigger function to auto-generate application_id when creating learner profiles with enquiry or pending status';
