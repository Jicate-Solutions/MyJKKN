-- Migration: Sponsor-approval schema + JKKN OnDuty sub-categories
-- Created: 2026-04-11
-- Purpose:
--   Phase 1 (this migration) — schema + data only:
--     1. Add `requires_sponsor_approval` flag and `sponsor_role_hint` hint to
--        `leave_onduty_sub_categories` (admin toggles per sub-category)
--     2. Add `sponsor_id`, `sponsor_approval_status`, `sponsor_comments`,
--        `sponsor_action_at` columns to `leave_onduty_applications` (unused in
--        Phase 1 — wired up in the follow-up PR that implements the flow)
--     3. Seed 6 JKKN-specific OnDuty sub-categories (Event Planning, Event
--        Meeting, Event, Media Work, Young Indians, Solve for 100) with
--        `requires_sponsor_approval = true`
--     4. Mark existing OnDuty defaults (event_participation, club_activities)
--        as `requires_sponsor_approval = true` to match the product intent:
--        OnDuty always involves a sponsor, Leave never does.
--
--   Phase 2 (follow-up PR) will add:
--     - Sponsor picker in learner application form
--     - Step-0 sponsor approval gate in the flow engine
--     - RLS for sponsors to read/update their own pending applications
--     - Notifications to sponsor on application create

-- ============================================================================
-- 1. SUB-CATEGORY SCHEMA — sponsor-approval flag
-- ============================================================================

ALTER TABLE leave_onduty_sub_categories
  ADD COLUMN IF NOT EXISTS requires_sponsor_approval BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE leave_onduty_sub_categories
  ADD COLUMN IF NOT EXISTS sponsor_role_hint TEXT;

-- Optional length cap on the hint text — keeps the UI honest
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'leave_onduty_sub_categories_sponsor_role_hint_length'
  ) THEN
    ALTER TABLE leave_onduty_sub_categories
      ADD CONSTRAINT leave_onduty_sub_categories_sponsor_role_hint_length
      CHECK (sponsor_role_hint IS NULL OR length(sponsor_role_hint) <= 200);
  END IF;
END $$;

COMMENT ON COLUMN leave_onduty_sub_categories.requires_sponsor_approval IS
  'If true, applications using this sub-category must be approved by a sponsor (the person the learner is working with) before entering the configured approval chain.';

COMMENT ON COLUMN leave_onduty_sub_categories.sponsor_role_hint IS
  'Free-text hint shown to learners when picking a sponsor. Example: "Event lead or faculty advisor".';

-- ============================================================================
-- 2. APPLICATION SCHEMA — sponsor tracking columns (Phase 1: store only)
-- ============================================================================
-- Wrapped in a conditional block because staging DBs may not yet have the
-- `leave_onduty_applications` table (staging and production have diverged).
-- Production will execute this block; staging will skip it harmlessly.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'leave_onduty_applications'
  ) THEN
    -- Sponsor columns
    ALTER TABLE leave_onduty_applications
      ADD COLUMN IF NOT EXISTS sponsor_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

    ALTER TABLE leave_onduty_applications
      ADD COLUMN IF NOT EXISTS sponsor_approval_status TEXT;

    ALTER TABLE leave_onduty_applications
      ADD COLUMN IF NOT EXISTS sponsor_comments TEXT;

    ALTER TABLE leave_onduty_applications
      ADD COLUMN IF NOT EXISTS sponsor_action_at TIMESTAMPTZ;

    -- CHECK constraint for sponsor_approval_status (NULL = no sponsor gate)
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'leave_onduty_applications_sponsor_approval_status_check'
    ) THEN
      ALTER TABLE leave_onduty_applications
        ADD CONSTRAINT leave_onduty_applications_sponsor_approval_status_check
        CHECK (
          sponsor_approval_status IS NULL
          OR sponsor_approval_status IN ('pending', 'approved', 'rejected')
        );
    END IF;

    -- Partial index for the sponsor's "pending approvals" queue (Phase 2)
    CREATE INDEX IF NOT EXISTS idx_leave_onduty_applications_sponsor_pending
      ON leave_onduty_applications (sponsor_id, created_at)
      WHERE sponsor_approval_status = 'pending';

    COMMENT ON COLUMN leave_onduty_applications.sponsor_id IS
      'User profile of the person the learner is working with. Must approve the application before it enters the academic approval chain. NULL when sub_category does not require sponsor approval.';

    COMMENT ON COLUMN leave_onduty_applications.sponsor_approval_status IS
      'Sponsor gate state: pending/approved/rejected. NULL means no sponsor gate (sub_category.requires_sponsor_approval = false).';
  ELSE
    RAISE NOTICE '[sponsor-approval migration] Skipping leave_onduty_applications changes — table does not exist in this environment (likely staging).';
  END IF;
END $$;

-- ============================================================================
-- 3. SEED: 6 new JKKN OnDuty sub-categories
-- ============================================================================

INSERT INTO leave_onduty_sub_categories
  (institution_id, category, code, name, description, is_active, requires_sponsor_approval, sponsor_role_hint)
SELECT
  i.id,
  'onduty'::leave_onduty_category,
  v.code,
  v.name,
  v.description,
  true,
  true,
  v.hint
FROM institutions i
CROSS JOIN (VALUES
  ('event_planning',
   'Event Planning',
   'Planning sessions for upcoming institutional events',
   'Event lead or coordinator'),
  ('event_meeting',
   'Event Meeting',
   'Coordination meetings for an active event',
   'Event chair or convener'),
  ('event',
   'Event',
   'Participation in an institutional event on the event day itself',
   'Event lead or faculty advisor'),
  ('media_work',
   'Media Work',
   'Photography, videography, or content production for institutional events',
   'Media team lead or faculty advisor'),
  ('young_indians',
   'Young Indians',
   'Yi (CII Young Indians) chapter activities and representation',
   'Yi chair or institution Yi coordinator'),
  ('solve_for_100',
   'Solve for 100',
   'Participation in the Solve for 100 innovation initiative',
   'Solve for 100 coordinator or project lead')
) v(code, name, description, hint)
ON CONFLICT (institution_id, category, code) DO NOTHING;

-- ============================================================================
-- 4. BACKFILL: mark existing OnDuty defaults as requiring sponsor approval
-- ============================================================================
-- Rationale: OnDuty always involves a third-party sponsor (the person the
-- learner is working with). The original seed defaults did not set this flag,
-- so existing institutions have event_participation / club_activities without
-- the sponsor gate. This backfill brings them in line with the new model.
-- Only touches rows where the flag is still at the default (false) — will not
-- overwrite any admin-made changes.

UPDATE leave_onduty_sub_categories
SET requires_sponsor_approval = true,
    sponsor_role_hint = COALESCE(sponsor_role_hint, 'Event lead or coordinator')
WHERE category = 'onduty'
  AND code IN ('event_participation', 'club_activities')
  AND requires_sponsor_approval = false;

-- Leave sub-categories (casual, medical) keep the default (false) —
-- Leave is a unilateral request, no sponsor required.

-- ============================================================================
-- 5. RELOAD POSTGREST SCHEMA CACHE
-- ============================================================================

NOTIFY pgrst, 'reload schema';
