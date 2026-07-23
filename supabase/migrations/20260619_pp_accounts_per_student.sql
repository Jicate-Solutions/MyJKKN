-- Migration: Parent Portal — pp_parent_accounts becomes ONE ROW PER STUDENT
-- Created: 2026-06-19
--
-- New model (replaces per-parent-mobile accounts):
--   * One pp_parent_accounts row per LEARNER (learner_profile_id is the key).
--   * ONE shared password per student — father AND mother use it. No separate
--     father/mother accounts/passwords.
--   * Contact (mobile / name / email) is NOT authoritative here — always read
--     LIVE from learners_profiles. mobile/email/display_name/parent_type are
--     kept only as an optional cache and are no longer required/unique.
--   * Siblings are resolved LIVE (learners sharing a parent mobile), so
--     pp_parent_learner_links is no longer used for scope.
--
-- The seed (scripts/seed-parent-accounts.mjs) repopulates per-student after this.

-- 1. Anchor column: the student this account belongs to.
ALTER TABLE public.pp_parent_accounts
  ADD COLUMN IF NOT EXISTS learner_profile_id UUID;

-- 2. mobile / parent_type are no longer the identity → relax constraints.
ALTER TABLE public.pp_parent_accounts ALTER COLUMN mobile DROP NOT NULL;
ALTER TABLE public.pp_parent_accounts ALTER COLUMN parent_type DROP NOT NULL;
ALTER TABLE public.pp_parent_accounts DROP CONSTRAINT IF EXISTS pp_parent_accounts_mobile_key;

-- 3. One account per student.
CREATE UNIQUE INDEX IF NOT EXISTS pp_parent_accounts_learner_key
  ON public.pp_parent_accounts(learner_profile_id);

COMMENT ON COLUMN public.pp_parent_accounts.learner_profile_id IS
  'The learner (student) this account belongs to. One row per student; father & mother share the same row + password. Contact is read live from learners_profiles.';
