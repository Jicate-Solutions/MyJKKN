-- Migration: Add learner_id to profiles table
-- Purpose: Link profiles to learners_profiles for student role users
-- Date: 2026-02-17
-- Status: APPLIED - Column added without FK (learners_profiles table not yet created)

-- Add learner_id column WITHOUT foreign key constraint
-- Note: The FK constraint should be added later when learners_profiles table exists
-- This allows the dashboard to query the column without errors

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS learner_id UUID;

-- Add index for query performance
CREATE INDEX IF NOT EXISTS idx_profiles_learner_id
ON public.profiles(learner_id);

-- TODO: Add foreign key when learners_profiles table is created:
-- ALTER TABLE public.profiles
--   ADD CONSTRAINT fk_profiles_learner_id
--   FOREIGN KEY (learner_id)
--   REFERENCES public.learners_profiles(id) ON DELETE SET NULL;
