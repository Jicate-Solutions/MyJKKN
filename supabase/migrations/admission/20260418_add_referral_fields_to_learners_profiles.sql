-- ============================================
-- Migration: Add referral attribution fields to learners_profiles
-- Created: 2026-04-18
-- Purpose: Preserve referral data (referral_type, referred_by_id, referred_by_name)
--          when converting admission_leads → learners_profiles.
-- Previously these 3 fields existed ONLY on admission_leads and were silently
-- dropped on conversion, breaking referral visibility on enquiry detail pages
-- and orphaning consultant attributions in the enquiry context.
-- ============================================

-- Add the 3 referral fields to learners_profiles.
-- All nullable because historic enquiries (pre-migration) won't have referrers.
ALTER TABLE learners_profiles
    ADD COLUMN IF NOT EXISTS referral_type TEXT,
    ADD COLUMN IF NOT EXISTS referred_by_id UUID,
    ADD COLUMN IF NOT EXISTS referred_by_name TEXT;

-- Optional constraint matching admission_leads.referral_type values.
-- Soft-enforced (CHECK) so invalid writes are rejected but no FK to a lookup table.
ALTER TABLE learners_profiles
    DROP CONSTRAINT IF EXISTS learners_profiles_referral_type_check;
ALTER TABLE learners_profiles
    ADD CONSTRAINT learners_profiles_referral_type_check
    CHECK (referral_type IS NULL OR referral_type IN ('consultant', 'student', 'faculty', 'learner_ambassador'));

-- Index for reverse lookups (e.g. "show all enquiries referred by this consultant").
CREATE INDEX IF NOT EXISTS idx_learners_profiles_referred_by_id
    ON learners_profiles (referred_by_id)
    WHERE referred_by_id IS NOT NULL;

-- Backfill existing enquiries from their originating admission_leads (if linked).
UPDATE learners_profiles lp
SET
    referral_type    = COALESCE(lp.referral_type,    al.referral_type),
    referred_by_id   = COALESCE(lp.referred_by_id,   al.referred_by_id),
    referred_by_name = COALESCE(lp.referred_by_name, al.referred_by_name)
FROM admission_leads al
WHERE al.learner_profile_id = lp.id
  AND (al.referral_type IS NOT NULL OR al.referred_by_id IS NOT NULL);

COMMENT ON COLUMN learners_profiles.referral_type IS
    'Copied from admission_leads.referral_type on convert: consultant | student | faculty | learner_ambassador';
COMMENT ON COLUMN learners_profiles.referred_by_id IS
    'FK to referrer entity (consultant.id / learner.id / staff.id) depending on referral_type';
COMMENT ON COLUMN learners_profiles.referred_by_name IS
    'Denormalized referrer name for display — avoids multi-table joins';
