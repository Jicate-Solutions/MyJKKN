-- QUICK FIX: Add missing sh_is_staff() function
-- Apply this directly in Supabase Dashboard SQL Editor
-- Dashboard: https://supabase.com/dashboard/project/hhprjbgknupaplivtoib/sql

-- Create sh_is_staff() function
CREATE OR REPLACE FUNCTION public.sh_is_staff()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('staff', 'faculty', 'teaching_staff', 'non_teaching_staff')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION sh_is_staff IS
'Checks if current user is a staff member (any staff-related role).';

-- Verify the function was created
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name = 'sh_is_staff';
