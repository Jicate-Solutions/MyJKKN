-- BUG-003371 — /admission/leads/new "CANNOT SAVE THE NEW LEAD" failed FK
-- on admission_lead_source_captures.referrer_id when the user picked a
-- student or faculty referrer. The dropdown returns learners_profiles.id
-- (4860 rows, 0 in profiles) or staff.id (451 rows, 0 in profiles), but
-- the column FK demanded profiles(id). Result: 100% of student/faculty
-- referrals failed (7824 captures, 0 with referrer_id filled).
--
-- The user-readable referral fields (referral_type, referred_by_id,
-- referred_by_name) live on admission_leads with NO FK and are the only
-- columns the UI reads. Capture-side referrer_id is write-only history
-- and is never JOIN'd downstream.
--
-- Decision: drop the strict profiles FK and keep referrer_id as a soft
-- polymorphic pointer. Resolve via admission_leads.referral_type at
-- read time if ever needed.

ALTER TABLE public.admission_lead_source_captures
  DROP CONSTRAINT IF EXISTS admission_lead_source_captures_referrer_id_fkey;

COMMENT ON COLUMN public.admission_lead_source_captures.referrer_id IS
  'Soft polymorphic pointer. Resolves to profiles.id, learners_profiles.id, or staff.id depending on the parent admission_leads.referral_type (consultant | student | faculty). No FK because cross-table polymorphism. User-readable referrer info is mirrored on admission_leads.referred_by_{id,name}.';
