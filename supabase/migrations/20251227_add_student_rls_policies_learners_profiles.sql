-- ============================================
-- Migration: Add Student RLS Policies for learners_profiles
-- Created: 2025-12-27
-- Purpose: Allow students to view and update ONLY their own learner profile
-- ============================================

-- Add policy for students to view ONLY their own learner profile
CREATE POLICY "students_view_own_learner_profile"
ON public.learners_profiles
FOR SELECT
TO authenticated
USING (
    -- Student can view if this learner record is linked to their profile
    EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.learner_id = learners_profiles.id
        AND p.role = 'student'
    )
);

COMMENT ON POLICY "students_view_own_learner_profile" ON learners_profiles IS
'Allows students to view ONLY their own learner profile by checking profiles.learner_id linkage';

-- Add policy for students to update ONLY their own learner profile
-- (Only if they have learners.edit permission - granted by admin)
CREATE POLICY "students_update_own_learner_profile"
ON public.learners_profiles
FOR UPDATE
TO authenticated
USING (
    -- Student can update if this learner record is linked to their profile
    EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.learner_id = learners_profiles.id
        AND p.role = 'student'
    )
)
WITH CHECK (
    -- Ensure student can only update their own record
    EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.learner_id = learners_profiles.id
        AND p.role = 'student'
    )
);

COMMENT ON POLICY "students_update_own_learner_profile" ON learners_profiles IS
'Allows students to update ONLY their own learner profile. Additional permission checks applied at application layer.';

-- Log the migration
DO $$
BEGIN
  RAISE NOTICE 'Migration completed: Added student RLS policies for learners_profiles table';
END $$;
