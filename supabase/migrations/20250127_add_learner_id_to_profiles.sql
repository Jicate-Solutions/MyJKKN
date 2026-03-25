-- =====================================================
-- ADD LEARNER_ID AND DEPARTMENT_ID TO PROFILES TABLE
-- =====================================================
-- Date: 2025-01-27
-- Purpose: Fix sync missing profiles by linking profiles to learners
-- Issue: profiles table missing learner_id and department_id columns causing sync failures
-- =====================================================

-- Add learner_id column to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS learner_id UUID REFERENCES public.learners_profiles(id) ON DELETE SET NULL;

-- Add department_id column to profiles table for better organizational tracking
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;

-- Create index for fast lookups on learner_id
CREATE INDEX IF NOT EXISTS idx_profiles_learner_id
ON public.profiles(learner_id)
WHERE learner_id IS NOT NULL;

-- Create unique constraint to prevent duplicate profiles for same learner
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_learner_id_unique
ON public.profiles(learner_id)
WHERE learner_id IS NOT NULL AND role = 'student';

-- Create index for department_id lookups
CREATE INDEX IF NOT EXISTS idx_profiles_department_id
ON public.profiles(department_id)
WHERE department_id IS NOT NULL;

-- Backfill existing profiles with learner_id (match by email)
UPDATE public.profiles p
SET learner_id = lp.id
FROM public.learners_profiles lp
WHERE LOWER(p.email) = LOWER(lp.college_email)
  AND p.role = 'student'
  AND p.learner_id IS NULL
  AND lp.lifecycle_status IN ('active', 'inactive', 'exited');

-- Backfill existing profiles with department_id from learners_profiles
UPDATE public.profiles p
SET department_id = lp.department_id
FROM public.learners_profiles lp
WHERE p.learner_id = lp.id
  AND p.role = 'student'
  AND p.department_id IS NULL
  AND lp.department_id IS NOT NULL;

-- Add comments
COMMENT ON COLUMN public.profiles.learner_id IS
'Links user profile to learner record. Required for students, NULL for staff/admin.';

COMMENT ON COLUMN public.profiles.department_id IS
'Department association for organizational hierarchy. Useful for students, staff, and department-level admins.';

-- Verification query (run this to check results)
-- SELECT
--   COUNT(*) as total_student_profiles,
--   COUNT(learner_id) as profiles_with_learner_id,
--   COUNT(department_id) as profiles_with_department_id,
--   COUNT(*) - COUNT(learner_id) as missing_learner_id,
--   COUNT(*) - COUNT(department_id) as missing_department_id
-- FROM profiles
-- WHERE role = 'student';
