-- ============================================
-- Migration: Auto-link Profile to Approved Learner on First Login
-- Created: 2025-12-27
-- Purpose: When user signs in, auto-link profile to approved learner with matching email
-- ============================================

-- Create function to auto-link profile to approved learner when profile is created
CREATE OR REPLACE FUNCTION public.auto_link_profile_to_approved_learner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_learner_record RECORD;
    v_full_name TEXT;
BEGIN
    -- Only proceed if this is a NEW profile without learner_id
    IF TG_OP = 'INSERT' AND NEW.learner_id IS NULL AND NEW.email IS NOT NULL THEN

        -- Check if there's an approved/active/graduated learner with matching college_email
        SELECT
            id,
            first_name,
            last_name,
            institution_id,
            department_id,
            lifecycle_status
        INTO v_learner_record
        FROM learners_profiles
        WHERE LOWER(college_email) = LOWER(NEW.email)
        AND lifecycle_status IN ('approved', 'active', 'graduated') -- Link to approved, active, or graduated learners
        LIMIT 1;

        -- If approved learner found, link it to this profile
        IF v_learner_record.id IS NOT NULL THEN

            -- Build full name from learner if not set
            v_full_name := NEW.full_name;
            IF v_full_name IS NULL OR v_full_name = '' THEN
                v_full_name := TRIM(CONCAT(v_learner_record.first_name, ' ', COALESCE(v_learner_record.last_name, '')));
            END IF;

            -- Update the NEW record before it's inserted
            NEW.learner_id := v_learner_record.id;
            NEW.institution_id := COALESCE(NEW.institution_id, v_learner_record.institution_id);
            NEW.department_id := COALESCE(NEW.department_id, v_learner_record.department_id);
            NEW.role := COALESCE(NEW.role, 'student');
            NEW.full_name := v_full_name;
            NEW.profile_completed := true;

            RAISE NOTICE 'Auto-linked new profile to approved learner: % (email: %)', v_learner_record.id, NEW.email;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION auto_link_profile_to_approved_learner IS
'Auto-links new user profiles to approved learners with matching email. Sets institution_id, department_id, role=student.';

-- Create BEFORE INSERT trigger on profiles table
DROP TRIGGER IF EXISTS trigger_auto_link_profile_to_approved_learner ON public.profiles;
CREATE TRIGGER trigger_auto_link_profile_to_approved_learner
    BEFORE INSERT ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION auto_link_profile_to_approved_learner();

COMMENT ON TRIGGER trigger_auto_link_profile_to_approved_learner ON profiles IS
'Auto-links new profiles to approved learners on first login. Includes institution/department from learner.';

-- Also create a function to manually link existing profiles to approved learners
CREATE OR REPLACE FUNCTION public.link_existing_profiles_to_approved_learners()
RETURNS TABLE (
    profile_id UUID,
    learner_id UUID,
    email TEXT,
    status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH updated_profiles AS (
        UPDATE profiles p
        SET
            learner_id = lp.id,
            institution_id = COALESCE(p.institution_id, lp.institution_id),
            department_id = COALESCE(p.department_id, lp.department_id),
            role = COALESCE(p.role, 'student'),
            full_name = COALESCE(
                NULLIF(p.full_name, ''),
                TRIM(CONCAT(lp.first_name, ' ', COALESCE(lp.last_name, '')))
            ),
            updated_at = NOW()
        FROM learners_profiles lp
        WHERE p.learner_id IS NULL
        AND p.email IS NOT NULL
        AND LOWER(p.email) = LOWER(lp.college_email)
        AND lp.lifecycle_status IN ('approved', 'active', 'graduated')
        RETURNING p.id, lp.id as l_id, p.email, 'linked' as status
    )
    SELECT id, l_id, email, status FROM updated_profiles;
END;
$$;

COMMENT ON FUNCTION link_existing_profiles_to_approved_learners IS
'Manually links existing profiles to approved learners with matching emails. Run this after migration.';

-- Log the migration
DO $$
BEGIN
  RAISE NOTICE 'Migration completed: Added auto-link profile to approved learner trigger';
  RAISE NOTICE 'Run SELECT * FROM link_existing_profiles_to_approved_learners() to link existing profiles';
END $$;
