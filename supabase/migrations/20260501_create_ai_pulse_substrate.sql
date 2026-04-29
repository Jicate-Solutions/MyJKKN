-- ============================================================================
-- AI Pulse Module — Wave A.1 Substrate (DRAFT — gated on Wave A.0 audit)
-- ============================================================================
--
-- Spec: specs/myjkkn-ai-pulse-spec.md (PR #633)
-- Wave: A.1 of A.0 → A.1 → A.2 → A.3 substrate plan
-- Date: 2026-04-29
--
-- DRAFT STATUS — DO NOT MERGE UNTIL Wave A.0 RESOLVES:
--   1. class_rep role status (confirmed today: NOT a formal role) → roles-PR before this
--   2. AI Pulse Champion identity (likely Ranjith DTO JKKN — needs human confirm)
--   3. learners table FK column name (learners.id vs learners_profiles.id)
--
-- This migration creates the AI Pulse module substrate per spec §4:
--   A. 7 substrate tables (cycle, teams, members, attendance, engagement,
--      lab presentations, publications)
--   B. 5 master value-list tables (CRUDable, institution-scoped, is_system seeded)
--   C. 1 policy table (ai_pulse_policies — 16 super-admin-tunable rows)
--
-- Pattern references:
--   • admission_lead_sources_master in 20260427_counselor_routing_db_foundation.sql
--     (Spec #537 — config-row pattern, CRUDable master, RLS shape)
--   • leave_types in 20251216_create_leave_management_tables.sql (Q1 reference)
--
-- All RLS follows the standard pattern:
--   is_super_admin() OR is_admin() OR (user_has_permission('aiPulse:...')
--     AND role_has_institution_access(institution_id))
--
-- Permission keys consumed (must exist in PERMISSION_CATEGORIES before merge):
--   • aiPulse.cycles.view, aiPulse.cycles.manage
--   • aiPulse.attendance.mark, aiPulse.attendance.view
--   • aiPulse.lab.score, aiPulse.gold_standard.select
--   • aiPulse.publications.submit, aiPulse.publications.view
--   • aiPulse.policies.manage (super-admin only)
--   • aiPulse.evidence.naac_export
-- ============================================================================

-- ============================================================================
-- A.  SUBSTRATE TABLES (7)
-- ============================================================================

-- A.1 — Master cycle table (one row per institution per week)
CREATE TABLE IF NOT EXISTS ai_pulse_cycles (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  week_start_date       DATE NOT NULL,
  briefing_topic_id     UUID,  -- FK to ai_pulse_topic_categories below
  lovable_week_flag     BOOLEAN NOT NULL DEFAULT false,
  host_user_id          UUID REFERENCES profiles(id),
  meet_url              TEXT,
  recording_url         TEXT,
  status                TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'live', 'completed', 'cancelled', 'postponed')),
  cancellation_reason   TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID REFERENCES profiles(id),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by            UUID REFERENCES profiles(id),
  UNIQUE (institution_id, week_start_date)
);

COMMENT ON TABLE ai_pulse_cycles IS
  'Weekly AI Pulse cycle. One row per institution × week. Drives the 5-phase Pulse-to-Practice rotation. Spec §4.1.';

CREATE INDEX IF NOT EXISTS idx_ai_pulse_cycles_institution_week
  ON ai_pulse_cycles (institution_id, week_start_date DESC);
CREATE INDEX IF NOT EXISTS idx_ai_pulse_cycles_active
  ON ai_pulse_cycles (status, week_start_date) WHERE status IN ('planned', 'live');

-- A.2 — Rotational teams (5 per class per cycle)
CREATE TABLE IF NOT EXISTS ai_pulse_teams (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id              UUID NOT NULL REFERENCES ai_pulse_cycles(id) ON DELETE CASCADE,
  class_id              UUID NOT NULL,  -- TODO Wave A.0: confirm classes.id vs class_groups.id
  team_number           INT NOT NULL CHECK (team_number BETWEEN 1 AND 5),
  team_lead_learner_id  UUID,  -- TODO Wave A.0: confirm learners.id vs learners_profiles.id
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, class_id, team_number)
);

COMMENT ON TABLE ai_pulse_teams IS
  'Five rotational teams per class per cycle. Supports 100% rotation principle. Spec §4.1.';

CREATE INDEX IF NOT EXISTS idx_ai_pulse_teams_cycle_class
  ON ai_pulse_teams (cycle_id, class_id);

-- A.3 — Team membership (junction)
CREATE TABLE IF NOT EXISTS ai_pulse_team_members (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id               UUID NOT NULL REFERENCES ai_pulse_teams(id) ON DELETE CASCADE,
  learner_id            UUID NOT NULL,  -- TODO Wave A.0: confirm learners FK
  role_in_team          TEXT NOT NULL DEFAULT 'member'
    CHECK (role_in_team IN ('lead', 'member', 'presenter', 'editor')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, learner_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_pulse_team_members_team
  ON ai_pulse_team_members (team_id);
CREATE INDEX IF NOT EXISTS idx_ai_pulse_team_members_learner
  ON ai_pulse_team_members (learner_id);

-- A.4 — Attendance (live + async make-up)
CREATE TABLE IF NOT EXISTS ai_pulse_attendance (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id              UUID NOT NULL REFERENCES ai_pulse_cycles(id) ON DELETE CASCADE,
  learner_id            UUID NOT NULL,  -- TODO Wave A.0: confirm learners FK
  joined_at             TIMESTAMPTZ,
  left_at               TIMESTAMPTZ,
  is_async_makeup       BOOLEAN NOT NULL DEFAULT false,
  is_late               BOOLEAN NOT NULL DEFAULT false,
  excuse_reason_id      UUID,  -- FK to ai_pulse_excuse_reasons (set below)
  excuse_approved       BOOLEAN,
  excuse_approved_by    UUID REFERENCES profiles(id),
  marked_by             UUID REFERENCES profiles(id),
  evidence_url          TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, learner_id)
);

COMMENT ON TABLE ai_pulse_attendance IS
  'One row per learner per cycle (live OR async). is_async_makeup distinguishes the source. Spec §4.1.';

CREATE INDEX IF NOT EXISTS idx_ai_pulse_attendance_cycle
  ON ai_pulse_attendance (cycle_id);
CREATE INDEX IF NOT EXISTS idx_ai_pulse_attendance_learner
  ON ai_pulse_attendance (learner_id, cycle_id);

-- A.5 — Engagement signals (4-AND gate per spec)
CREATE TABLE IF NOT EXISTS ai_pulse_engagement (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_id         UUID NOT NULL REFERENCES ai_pulse_attendance(id) ON DELETE CASCADE,
  signal_type_id        UUID NOT NULL,  -- FK to ai_pulse_engagement_signal_types
  value                 JSONB,
  recorded_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (attendance_id, signal_type_id)
);

COMMENT ON TABLE ai_pulse_engagement IS
  '4-AND-gate engagement signals (joined/polls/stayed/quiz). Distinguishes "engaged" vs "joined-and-walked-away". Spec §6.';

CREATE INDEX IF NOT EXISTS idx_ai_pulse_engagement_attendance
  ON ai_pulse_engagement (attendance_id);

-- A.6 — Monday Lab presentations
CREATE TABLE IF NOT EXISTS ai_pulse_lab_presentations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id              UUID NOT NULL REFERENCES ai_pulse_cycles(id) ON DELETE CASCADE,
  team_id               UUID NOT NULL REFERENCES ai_pulse_teams(id) ON DELETE CASCADE,
  presented             BOOLEAN NOT NULL DEFAULT false,
  presented_at          TIMESTAMPTZ,
  scores_json           JSONB,  -- {clarity: 8, originality: 7, impact: 9, ...}
  total_score           NUMERIC(5,2),
  gold_standard         BOOLEAN NOT NULL DEFAULT false,
  gold_tier_id          UUID,  -- FK to ai_pulse_gold_tiers (gold/silver/bronze if expanded)
  faculty_judge_id      UUID REFERENCES profiles(id),
  judge_notes           TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_pulse_lab_presentations_cycle
  ON ai_pulse_lab_presentations (cycle_id);
CREATE INDEX IF NOT EXISTS idx_ai_pulse_lab_gold
  ON ai_pulse_lab_presentations (cycle_id, gold_standard) WHERE gold_standard = true;

-- A.7 — Instagram + GitHub publications
CREATE TABLE IF NOT EXISTS ai_pulse_publications (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id              UUID NOT NULL REFERENCES ai_pulse_cycles(id) ON DELETE CASCADE,
  team_id               UUID NOT NULL REFERENCES ai_pulse_teams(id) ON DELETE CASCADE,
  instagram_url         TEXT,
  github_repo_url       TEXT,
  ig_reach              INT,
  ig_likes              INT,
  ig_comments           INT,
  posted_within_24h     BOOLEAN,
  published_at          TIMESTAMPTZ,
  naac_evidence_id      UUID,  -- soft FK to quality_evidence_mappings, set by trigger
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, team_id)
);

COMMENT ON TABLE ai_pulse_publications IS
  'Top-N teams publish to IG + GitHub within ig_post_deadline_hours policy. naac_evidence_id pipes Gold Standards into NAAC Criterion 3.3.1 evidence. Spec §4.1 + §7 C.2.';

CREATE INDEX IF NOT EXISTS idx_ai_pulse_publications_cycle
  ON ai_pulse_publications (cycle_id);

-- ============================================================================
-- B.  MASTER VALUE-LIST TABLES (5 — Q1 = Yes, all CRUDable, institution-scoped)
-- ============================================================================

-- B.1 — Engagement signal types
CREATE TABLE IF NOT EXISTS ai_pulse_engagement_signal_types (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key             TEXT NOT NULL UNIQUE,
  label           TEXT NOT NULL,
  description     TEXT,
  is_required_for_engaged_gate  BOOLEAN NOT NULL DEFAULT true,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  is_system       BOOLEAN NOT NULL DEFAULT false,
  display_order   INT NOT NULL DEFAULT 100,
  institution_id  UUID REFERENCES institutions(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES profiles(id),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      UUID REFERENCES profiles(id)
);

INSERT INTO ai_pulse_engagement_signal_types
  (key, label, description, is_required_for_engaged_gate, is_system, display_order)
VALUES
  ('joined_within_5min', 'Joined within 5 min', 'Learner joined the live session within 5 minutes of session_start_time', true, true, 10),
  ('polls_responded_3plus', 'Responded to 3+ polls', 'Learner submitted at least 3 live-poll responses during session', true, true, 20),
  ('stayed_until_endtime', 'Stayed until end-time', 'Learner left only after policies.stay_until_minutes threshold', true, true, 30),
  ('quiz_passed_live', 'Passed live quiz', 'Score >= policies.quiz_pass_threshold_live within 60 min of session end', true, true, 40),
  ('quiz_passed_async', 'Passed async make-up quiz', 'Score >= policies.quiz_pass_threshold_async within async_makeup_window_hours', false, true, 50)
ON CONFLICT (key) DO NOTHING;

-- B.2 — Excuse reason codes
CREATE TABLE IF NOT EXISTS ai_pulse_excuse_reasons (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key             TEXT NOT NULL UNIQUE,
  label           TEXT NOT NULL,
  description     TEXT,
  requires_evidence  BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  is_system       BOOLEAN NOT NULL DEFAULT false,
  display_order   INT NOT NULL DEFAULT 100,
  institution_id  UUID REFERENCES institutions(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES profiles(id),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      UUID REFERENCES profiles(id)
);

INSERT INTO ai_pulse_excuse_reasons (key, label, requires_evidence, is_system, display_order)
VALUES
  ('medical', 'Medical', true, true, 10),
  ('family_emergency', 'Family emergency', false, true, 20),
  ('exam_clash', 'Exam clash', true, true, 30),
  ('technical_failure', 'Technical failure', false, true, 40),
  ('bandwidth', 'Bandwidth issue', false, true, 50),
  ('other', 'Other (specify)', true, true, 99)
ON CONFLICT (key) DO NOTHING;

-- B.3 — Gold Standard tiers (extensible — v1 uses just gold_standard)
CREATE TABLE IF NOT EXISTS ai_pulse_gold_tiers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key             TEXT NOT NULL UNIQUE,
  label           TEXT NOT NULL,
  rank            INT NOT NULL UNIQUE,  -- 1 = top tier
  badge_emoji     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  is_system       BOOLEAN NOT NULL DEFAULT false,
  institution_id  UUID REFERENCES institutions(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES profiles(id),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      UUID REFERENCES profiles(id)
);

INSERT INTO ai_pulse_gold_tiers (key, label, rank, badge_emoji, is_system)
VALUES
  ('gold_standard', 'Gold Standard', 1, '🥇', true)
ON CONFLICT (key) DO NOTHING;

-- B.4 — Topic categories
CREATE TABLE IF NOT EXISTS ai_pulse_topic_categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key             TEXT NOT NULL UNIQUE,
  label           TEXT NOT NULL,
  description     TEXT,
  parent_id       UUID REFERENCES ai_pulse_topic_categories(id),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  is_system       BOOLEAN NOT NULL DEFAULT false,
  display_order   INT NOT NULL DEFAULT 100,
  institution_id  UUID REFERENCES institutions(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES profiles(id),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      UUID REFERENCES profiles(id)
);

INSERT INTO ai_pulse_topic_categories (key, label, is_system, display_order)
VALUES
  ('llm_basics', 'LLM Basics & Prompting', true, 10),
  ('agent_design', 'Agent Design & Tool Use', true, 20),
  ('image_generation', 'Image & Video Generation', true, 30),
  ('code_assistants', 'Code Assistants (Copilot, Cursor)', true, 40),
  ('automation_workflow', 'Automation Workflows (Zapier, n8n, Lovable)', true, 50),
  ('data_analysis', 'AI for Data Analysis', true, 60),
  ('ethics_safety', 'AI Ethics & Safety', true, 70)
ON CONFLICT (key) DO NOTHING;

-- B.5 — Notification trigger keys
CREATE TABLE IF NOT EXISTS ai_pulse_notification_keys (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key               TEXT NOT NULL UNIQUE,
  label             TEXT NOT NULL,
  default_template  TEXT NOT NULL,
  channel           TEXT NOT NULL DEFAULT 'in_app'
    CHECK (channel IN ('in_app', 'email', 'sms', 'whatsapp', 'attention_bar')),
  is_active         BOOLEAN NOT NULL DEFAULT true,
  is_system         BOOLEAN NOT NULL DEFAULT false,
  display_order     INT NOT NULL DEFAULT 100,
  institution_id    UUID REFERENCES institutions(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID REFERENCES profiles(id),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by        UUID REFERENCES profiles(id)
);

INSERT INTO ai_pulse_notification_keys (key, label, default_template, channel, is_system, display_order)
VALUES
  ('tminus_24h', 'T-24h reminder', 'Your AI Pulse session is tomorrow at {{session_time}}. Topic: {{topic}}.', 'in_app', true, 10),
  ('tminus_2h', 'T-2h reminder', 'AI Pulse session in 2 hours. Click to add to calendar.', 'in_app', true, 20),
  ('tminus_15min', 'T-15min reminder', 'AI Pulse session starts in 15 minutes. Join now → {{join_url}}', 'in_app', true, 30),
  ('late_no_show', 'Late / no-show alert', 'You missed your AI Pulse slot. Async make-up available within {{async_window}}h.', 'in_app', true, 40),
  ('domain_sync_due', 'Domain-Sync due', 'Your team Domain-Sync submission is due in {{hours}}h.', 'in_app', true, 50),
  ('lab_presentation_due', 'Lab presentation reminder', 'Lab presentation Monday at {{lab_time}}. Prepare your team artifact.', 'in_app', true, 60),
  ('cycle_complete_recap', 'Cycle recap', 'AI Pulse cycle {{week}} complete. Gold Standards: {{gold_count}}. View leaderboard.', 'in_app', true, 70),
  ('escalation_t1_class_rep', 'T1: Class Rep nudge', '{{count}} teammates have not completed Domain-Sync. Reach out.', 'attention_bar', true, 80),
  ('escalation_t2_dept_head', 'T2: Dept Head red flag', 'Class {{class}} missed AI Pulse Domain-Sync this cycle.', 'attention_bar', true, 90)
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- C.  POLICY TABLE (Q3 = Yes, all 16 super-admin-tunable)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_pulse_policies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key      TEXT NOT NULL UNIQUE,
  display_name    TEXT NOT NULL,
  description     TEXT NOT NULL,
  value_jsonb     JSONB NOT NULL,
  data_type       TEXT NOT NULL
    CHECK (data_type IN ('int', 'float', 'string', 'bool', 'time', 'enum', 'array')),
  enum_options    JSONB,
  min_value       NUMERIC,
  max_value       NUMERIC,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  institution_id  UUID REFERENCES institutions(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES profiles(id),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      UUID REFERENCES profiles(id)
);

COMMENT ON TABLE ai_pulse_policies IS
  '16 super-admin-tunable policy values for AI Pulse. Pattern: counselor_rules from Spec #537. Editable at /admin/config/ai-pulse with mandatory change_reason in audit log. Per Director directive 2026-04-29 — every policy decision is a config row.';

CREATE INDEX IF NOT EXISTS idx_ai_pulse_policies_active
  ON ai_pulse_policies (is_active, config_key) WHERE is_active = true;

INSERT INTO ai_pulse_policies (config_key, display_name, description, value_jsonb, data_type, enum_options, min_value, max_value)
VALUES
  ('session_day', 'Briefing day', 'Day of week for live AI Pulse session', '"Thursday"',
   'enum', '["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]', NULL, NULL),
  ('session_start_time', 'Session start time', 'Local time when briefing begins', '"18:55"',
   'time', NULL, NULL, NULL),
  ('session_end_time', 'Session end time', 'Local time when briefing ends', '"19:30"',
   'time', NULL, NULL, NULL),
  ('late_threshold_minutes', 'Late threshold', 'Minutes after session_start_time after which a join is "late"', '10',
   'int', NULL, 0, 60),
  ('domain_sync_deadline_offset_days', 'Domain-Sync deadline (days)', 'Days after Thursday for Domain-Sync submission', '3',
   'int', NULL, 1, 7),
  ('lab_presentation_day', 'Lab presentation day', 'Day for following-week class presentation', '"Monday"',
   'enum', '["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]', NULL, NULL),
  ('gold_standard_count', 'Gold Standard count', 'Top-N teams selected per cycle as Gold Standard', '2',
   'int', NULL, 1, 10),
  ('ig_post_deadline_hours', 'IG post deadline (hours)', 'Hours after Lab presentation to publish to Instagram', '24',
   'int', NULL, 1, 168),
  ('ig_reach_threshold', 'IG reach threshold', 'Minimum IG reach for "engaged publication" KPI', '500',
   'int', NULL, 0, 1000000),
  ('quiz_pass_threshold_live', 'Quiz pass % (live)', 'Minimum quiz score for live attendees', '40',
   'int', NULL, 0, 100),
  ('quiz_pass_threshold_async', 'Quiz pass % (async)', 'Minimum quiz score for async make-up (higher bar)', '60',
   'int', NULL, 0, 100),
  ('async_makeup_window_hours', 'Async make-up window (hours)', 'Hours after session to complete async make-up', '48',
   'int', NULL, 1, 720),
  ('escalation_t1_percent', 'Escalation T1 (%)', 'Percent of cycle elapsed before first escalation', '80',
   'int', NULL, 0, 100),
  ('escalation_t2_percent', 'Escalation T2 (%)', 'Percent of cycle elapsed before Director-digest red flag', '100',
   'int', NULL, 0, 200),
  ('lovable_week_frequency', 'Lovable Week frequency', 'How often Lovable credits flow into the cycle', '"monthly"',
   'enum', '["weekly","biweekly","monthly","quarterly"]', NULL, NULL),
  ('cron_tick_minutes', 'Cron tick cadence (min)', 'Frequency of fn_run_pulse_cycle_tick execution', '240',
   'int', NULL, 5, 1440)
ON CONFLICT (config_key) DO NOTHING;

-- ============================================================================
-- D.  FK closures (deferred until master tables exist)
-- ============================================================================

ALTER TABLE ai_pulse_cycles
  ADD CONSTRAINT fk_ai_pulse_cycles_topic
  FOREIGN KEY (briefing_topic_id) REFERENCES ai_pulse_topic_categories(id);

ALTER TABLE ai_pulse_attendance
  ADD CONSTRAINT fk_ai_pulse_attendance_excuse
  FOREIGN KEY (excuse_reason_id) REFERENCES ai_pulse_excuse_reasons(id);

ALTER TABLE ai_pulse_engagement
  ADD CONSTRAINT fk_ai_pulse_engagement_signal_type
  FOREIGN KEY (signal_type_id) REFERENCES ai_pulse_engagement_signal_types(id);

ALTER TABLE ai_pulse_lab_presentations
  ADD CONSTRAINT fk_ai_pulse_lab_gold_tier
  FOREIGN KEY (gold_tier_id) REFERENCES ai_pulse_gold_tiers(id);

-- ============================================================================
-- E.  RLS placeholders (Wave A.1.1 will harden — DRAFT shape only)
-- ============================================================================

ALTER TABLE ai_pulse_cycles                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_pulse_teams                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_pulse_team_members             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_pulse_attendance               ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_pulse_engagement               ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_pulse_lab_presentations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_pulse_publications             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_pulse_engagement_signal_types  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_pulse_excuse_reasons           ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_pulse_gold_tiers               ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_pulse_topic_categories         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_pulse_notification_keys        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_pulse_policies                 ENABLE ROW LEVEL SECURITY;

-- TODO Wave A.1.1: harden RLS per spec §3 permissions matrix
-- Pattern reference: 20260427_counselor_routing_db_foundation.sql RLS section
-- Required policies (one per table × persona scope):
--   • Learner: view:self on attendance/engagement/team_members where learner_id = auth.uid()
--   • Class Rep: full RW on attendance/teams scoped to class_id
--   • Faculty: RW on lab_presentations + excuse_approved on attendance, scoped to class
--   • Dept Head: read all tables scoped to department_id
--   • Champion: full RW on cycles + topics
--   • Super Admin: full RW on policies + master tables, audit-logged
--   • IQAC: read-only on publications scoped to institution

-- ============================================================================
-- F.  Tick function STUB (Wave A.2 will implement body)
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_run_pulse_cycle_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Wave A.2 implements the full tick logic:
  --   1. For each ai_pulse_cycles row with status='planned' and now() within
  --      (T-24h, T-2h, T-15min, T+0) → fire matching ai_pulse_notification_keys
  --   2. For each cycle in escalation_t1_percent window → fire T1 notifications
  --   3. For each cycle in escalation_t2_percent window → fire T2 + Director digest line
  --   4. Auto-transition status: planned → live → completed at session_end_time + 1h
  --   5. Compute engagement-gate pass for each attendance row at end of session
  --   6. Pipe gold_standard publications into quality_evidence_mappings
  RAISE NOTICE 'fn_run_pulse_cycle_tick: stub — Wave A.2 implements';
END;
$$;

COMMENT ON FUNCTION fn_run_pulse_cycle_tick() IS
  'Wave A.1 STUB. Wave A.2 implements the full tick. Scheduled via pg_cron at policies.cron_tick_minutes cadence.';

-- ============================================================================
-- END Wave A.1 substrate
-- ============================================================================
