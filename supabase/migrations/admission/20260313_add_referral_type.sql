-- Migration: Add referral_type, referred_by_id, referred_by_name to admission_leads
-- Date: 2026-03-13
-- Purpose: Support 3 referral sub-types (consultant, student, faculty) with referrer tracking

ALTER TABLE public.admission_leads
  ADD COLUMN IF NOT EXISTS referral_type TEXT DEFAULT NULL
    CHECK (referral_type IS NULL OR referral_type IN ('consultant', 'student', 'faculty')),
  ADD COLUMN IF NOT EXISTS referred_by_id UUID DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS referred_by_name TEXT DEFAULT NULL;

-- Migrate existing referral leads that have consultant attributions
-- Set their referral_type to 'consultant' for backward compatibility
UPDATE public.admission_leads al
SET referral_type = 'consultant'
WHERE al.source = 'referral'
  AND al.referral_type IS NULL
  AND EXISTS (
    SELECT 1 FROM public.consultant_lead_attributions cla
    WHERE cla.admission_id = al.id
  );

COMMENT ON COLUMN public.admission_leads.referral_type IS 'Sub-type of referral: consultant, student, or faculty';
COMMENT ON COLUMN public.admission_leads.referred_by_id IS 'UUID of the referrer (consultant, learner profile, or staff)';
COMMENT ON COLUMN public.admission_leads.referred_by_name IS 'Denormalized name of the referrer for display';
