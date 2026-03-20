-- Fix timetable access to use profiles.institution_id instead of user_institution_access
-- The user_institution_access table is ONLY for billing module
-- Created: 2026-01-31

CREATE OR REPLACE FUNCTION current_user_can_access_timetable(timetable_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    timetable_institution_id UUID;
    user_profile profiles;
BEGIN
    -- Get the timetable's institution
    SELECT institution_id INTO timetable_institution_id
    FROM timetables
    WHERE id = timetable_id;

    -- If timetable doesn't exist, deny access
    IF timetable_institution_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Get current user profile
    SELECT * INTO user_profile FROM profiles WHERE id = auth.uid();

    -- If user doesn't exist, deny access
    IF user_profile IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Super admin has access to all
    IF user_profile.is_super_admin = true OR user_profile.role = 'super_admin' THEN
        RETURN TRUE;
    END IF;

    -- Check if user's institution matches timetable's institution
    -- This is the PRIMARY check for faculty, HOD, admin, etc.
    IF user_profile.institution_id = timetable_institution_id THEN
        RETURN TRUE;
    END IF;

    -- Fallback: Check user_institution_access table (for special cases like billing)
    -- This is secondary and not required for normal timetable access
    RETURN user_has_institution_access(auth.uid(), timetable_institution_id);
END;
$$;

COMMENT ON FUNCTION current_user_can_access_timetable IS
  'Checks if current user can access a timetable.
   Primary check: user profile institution_id matches timetable institution_id.
   Fallback: user_institution_access table (for special billing scenarios).
   Note: user_institution_access is ONLY for billing module, not general access.';
