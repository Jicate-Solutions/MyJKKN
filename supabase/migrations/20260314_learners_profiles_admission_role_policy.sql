-- Migration: Add admission role SELECT policy for learners_profiles
-- Date: 2026-03-14
-- Purpose: Allow admission role users (cross-institution) to read all learner profiles
-- Issue: Admission role users couldn't see enquiry data because learners_profiles
--        only checked user_has_institution_access() which requires explicit entries
--        in user_institution_access table. Admission users have NULL institution_id.

-- Admission role users are cross-institution and need to read all learner profiles
CREATE POLICY "learners_profiles_select_admission_role" ON learners_profiles
    FOR SELECT USING (get_current_user_role() = 'admission');
