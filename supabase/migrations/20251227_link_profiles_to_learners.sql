-- ============================================
-- Migration: Link Profiles to Learners
-- Created: 2025-12-27
-- Purpose: Add learner_id column to profiles table for student data access
-- ============================================

-- Add learner_id column to profiles table to link user accounts to student records
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS learner_id UUID
REFERENCES public.learners_profiles(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_learner_id
ON public.profiles(learner_id)
WHERE learner_id IS NOT NULL;

-- Add helpful comment
COMMENT ON COLUMN profiles.learner_id IS 'Links user profile to their learner record in learners_profiles table. Used for student role users to access their own data.';

-- Log the migration
DO $$
BEGIN
  RAISE NOTICE 'Migration completed: Added learner_id column to profiles table';
END $$;
