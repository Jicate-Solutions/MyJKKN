-- ============================================================
-- Startup Studio v2.1: Team Members + Event Registration
-- Migration: 20260305000001_ss_team_members_and_event_registration.sql
-- Description: Creates ss_team_members table (critical blocker),
--              adds event registration columns to ss_teams,
--              creates ss_event_checklists + ss_checklist_responses,
--              creates ss_presentation_slots.
-- Depends on: 20260304000001_startup_studio_v2_tables.sql
-- ============================================================

-- ============================================
-- 1. ss_team_members (critical: was missing)
-- ============================================
CREATE TABLE IF NOT EXISTS ss_team_members (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     uuid        NOT NULL REFERENCES ss_teams(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text        DEFAULT 'member',
  department  text,
  is_anchor   boolean     DEFAULT false,
  has_laptop  boolean     DEFAULT false,
  joined_at   timestamptz DEFAULT now(),
  UNIQUE(team_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ss_team_members_team ON ss_team_members (team_id);
CREATE INDEX IF NOT EXISTS idx_ss_team_members_user ON ss_team_members (user_id);

ALTER TABLE ss_team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ss_team_members_authenticated"
  ON ss_team_members FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ============================================
-- 2. ALTER ss_teams: add event registration columns
-- ============================================
ALTER TABLE ss_teams ADD COLUMN IF NOT EXISTS problem_idea text;
ALTER TABLE ss_teams ADD COLUMN IF NOT EXISTS registration_status text DEFAULT 'draft'
  CHECK (registration_status IN ('draft', 'registered', 'confirmed', 'checked_in'));
ALTER TABLE ss_teams ADD COLUMN IF NOT EXISTS registered_at timestamptz;
ALTER TABLE ss_teams ADD COLUMN IF NOT EXISTS checked_in_at timestamptz;

-- ============================================
-- 3. ss_event_checklists (template items)
-- ============================================
CREATE TABLE IF NOT EXISTS ss_event_checklists (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid        NOT NULL REFERENCES ss_events(id) ON DELETE CASCADE,
  phase       text        NOT NULL CHECK (phase IN ('pre_event', 'on_day', 'post_event')),
  title       text        NOT NULL,
  description text,
  sort_order  int         DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ss_event_checklists_event ON ss_event_checklists (event_id);

ALTER TABLE ss_event_checklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ss_event_checklists_authenticated"
  ON ss_event_checklists FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ============================================
-- 4. ss_checklist_responses (per user/institution)
-- ============================================
CREATE TABLE IF NOT EXISTS ss_checklist_responses (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id    uuid        NOT NULL REFERENCES ss_event_checklists(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES auth.users(id),
  institution_id  uuid        REFERENCES institutions(id),
  is_completed    boolean     DEFAULT false,
  notes           text,
  completed_at    timestamptz,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ss_checklist_responses_checklist ON ss_checklist_responses (checklist_id);
CREATE INDEX IF NOT EXISTS idx_ss_checklist_responses_user ON ss_checklist_responses (user_id);

ALTER TABLE ss_checklist_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ss_checklist_responses_authenticated"
  ON ss_checklist_responses FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ============================================
-- 5. ss_presentation_slots (Demo Day)
-- ============================================
CREATE TABLE IF NOT EXISTS ss_presentation_slots (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid        NOT NULL REFERENCES ss_events(id) ON DELETE CASCADE,
  team_id         uuid        REFERENCES ss_teams(id) ON DELETE SET NULL,
  submission_id   uuid        REFERENCES ss_appathon_submissions(id),
  slot_time       timestamptz NOT NULL,
  duration_mins   int         DEFAULT 10,
  room            text,
  judge_panel     text,
  status          text        DEFAULT 'scheduled'
                              CHECK (status IN ('scheduled', 'presenting', 'completed', 'skipped')),
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ss_presentation_slots_event ON ss_presentation_slots (event_id);
CREATE INDEX IF NOT EXISTS idx_ss_presentation_slots_team ON ss_presentation_slots (team_id);

ALTER TABLE ss_presentation_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ss_presentation_slots_authenticated"
  ON ss_presentation_slots FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ============================================
-- 6. updated_at trigger for team_members
-- ============================================
-- ss_team_members doesn't have updated_at, so no trigger needed.
-- ss_event_checklists doesn't have updated_at, so no trigger needed.
