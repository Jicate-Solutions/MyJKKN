-- Migration: Add transport_fee field to learners_profiles
-- Date: 2026-03-13
-- Purpose: Add optional transport fee tracking for enquiry finance details

ALTER TABLE public.learners_profiles
  ADD COLUMN IF NOT EXISTS transport_fee NUMERIC(15,2) DEFAULT NULL;

-- Add check constraint for non-negative value
ALTER TABLE public.learners_profiles
  ADD CONSTRAINT chk_transport_fee_positive CHECK (transport_fee IS NULL OR transport_fee >= 0);

COMMENT ON COLUMN public.learners_profiles.transport_fee IS 'Optional transport fee for learner commute arrangements';
