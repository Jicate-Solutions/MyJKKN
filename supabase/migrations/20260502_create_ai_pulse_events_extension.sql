-- ============================================================================
-- AI Pulse Module — Wave A.1 events-extension migration (v3)
-- ============================================================================
--
-- Spec: specs/myjkkn-ai-pulse-spec.md v3 (PR #641)
-- Approach: extends existing startup_events module — does NOT create a
-- parallel ai_pulse_* substrate. v1/v2 (15 tables) superseded.
--
-- OQ-1 resolution (locked 2026-05-02 by Director): use startup_events with
-- config.kind='ai_pulse' JSONB discriminator. All team/attendance/submission/
-- demo-slot infrastructure already references startup_events(id).
--
-- Wave A.0 status (4 of 4 closed):
--   ✅ Champion = Krishnaveni (locked 2026-04-29)
--   ✅ Co-Champion = Ranjith / Ranjith@jkkn.ac.in (locked 2026-05-02)
--   ✅ Section-attendance role = REUSE class_incharges (locked 2026-05-02)
--   ✅ Events table choice = startup_events (locked 2026-05-02)
--
-- Schema delta: 3 new tables + 1 column add + 1 ENUM extension
--   (v2 was 15 new tables — superseded)
-- ============================================================================

-- ============================================================================
-- A. ALTER existing tables (no schema change to startup_events itself)
-- ============================================================================

-- A.1 — Extend event_team_attendance.day_type to support live + async make-up
ALTER TABLE public.event_team_attendance
  DROP CONSTRAINT IF EXISTS event_team_attendance_day_type_check;
ALTER TABLE public.event_team_attendance
  ADD CONSTRAINT event_team_attendance_day_type_check
  CHECK (day_type IN ('build_day', 'demo_day', 'live_session', 'async_makeup'));

-- A.2 — 4-AND engagement-gate signals stored as JSONB on existing attendance row
ALTER TABLE public.event_team_attendance
  ADD COLUMN IF NOT EXISTS engagement_signals JSONB DEFAULT '{}';

COMMENT ON COLUMN public.event_team_attendance.engagement_signals IS
  'AI Pulse 4-AND gate signals (Q5 + Q11). Shape: {joined_within_5min: bool, polls_responded: int, stayed_until: time, quiz_score: int, async_makeup_quiz_score: int}. Empty object {} for non-AI-Pulse events.';

-- ============================================================================
-- B. NEW TABLE: ai_pulse_policies (Q3 — 22 super-admin-tunable rows)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ai_pulse_policies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key      TEXT NOT NULL UNIQUE,
  display_name    TEXT NOT NULL,
  description     TEXT NOT NULL,
  value_jsonb     JSONB NOT NULL,
  data_type       TEXT NOT NULL
    CHECK (data_type IN ('int', 'float', 'string', 'bool', 'time', 'enum', 'array', 'jsonb')),
  enum_options    JSONB,
  min_value       NUMERIC,
  max_value       NUMERIC,
  locked_by_q     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  institution_id  UUID REFERENCES public.institutions(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES public.profiles(id),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      UUID REFERENCES public.profiles(id)
);

COMMENT ON TABLE public.ai_pulse_policies IS
  '22 super-admin-tunable AI Pulse policy values. Pattern: counselor_rules (Spec #537). Edited at /admin/config/ai-pulse with audit-logged change_reason. Per Director directive 2026-04-29 — every policy decision is a config row. Spec v3 §4.3 + §7 Decision Log.';

CREATE INDEX IF NOT EXISTS idx_ai_pulse_policies_active
  ON public.ai_pulse_policies (is_active, config_key) WHERE is_active = true;

INSERT INTO public.ai_pulse_policies (config_key, display_name, description, value_jsonb, data_type, enum_options, min_value, max_value, locked_by_q) VALUES
  ('session_day', 'Briefing day', 'Day of week for live AI Pulse session', '"Thursday"', 'enum', '["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]', NULL, NULL, NULL),
  ('session_start_time', 'Session start time', 'Local time when briefing begins', '"18:55"', 'time', NULL, NULL, NULL, NULL),
  ('session_end_time', 'Session end time', 'Local time when briefing ends', '"19:30"', 'time', NULL, NULL, NULL, NULL),
  ('late_threshold_minutes', 'Late threshold', 'Minutes after start after which join counts as late', '10', 'int', NULL, 0, 60, NULL),
  ('domain_sync_deadline_offset_days', 'Domain-Sync deadline (days)', 'Days after Thursday for Domain-Sync submission', '3', 'int', NULL, 1, 7, NULL),
  ('lab_presentation_day', 'Lab presentation day', 'Day for following-week class presentation', '"Monday"', 'enum', '["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]', NULL, NULL, NULL),
  ('gold_standard_count', 'Gold Standard count', 'Top-N teams selected per cycle', '2', 'int', NULL, 1, 10, NULL),
  ('bottom_n_publication_count', 'Bottom-N publication count', 'Bottom-N teams flagged for intranet leaderboard', '2', 'int', NULL, 0, 10, 'Q3+Q6'),
  ('bottom_n_visibility_scope', 'Bottom-N visibility scope', 'Where bottom-N publications are visible', '"myjkkn_intranet"', 'enum', '["myjkkn_intranet","public_external","department_only","anonymized_public"]', NULL, NULL, 'Q6'),
  ('learner_visibility_override_enabled', 'Learner opt-out enabled', 'Allow individual learner opt-out from leaderboard', 'true', 'bool', NULL, NULL, NULL, 'Q6'),
  ('ig_post_deadline_hours', 'IG post deadline (hours)', 'Hours after Lab to publish to Instagram', '24', 'int', NULL, 1, 168, NULL),
  ('ig_reach_threshold', 'IG reach threshold', 'Minimum IG reach for engaged-publication KPI', '500', 'int', NULL, 0, 1000000, NULL),
  ('quiz_pass_threshold_live', 'Quiz pass % (live)', 'Min quiz score for live attendees', '40', 'int', NULL, 0, 100, NULL),
  ('quiz_pass_threshold_async', 'Quiz pass % (async)', 'Min quiz score for async make-up (higher bar)', '60', 'int', NULL, 0, 100, NULL),
  ('async_makeup_window_hours', 'Async make-up window (hours)', 'Hours after session to complete async make-up', '48', 'int', NULL, 1, 720, NULL),
  ('engaged_state_definition', 'Engaged-state definition', 'What rescues a miss', '"live_or_async_or_excused"', 'enum', '["live_only","live_or_async","live_or_excused","live_or_async_or_excused"]', NULL, NULL, 'Q5'),
  ('consequence_tier_thresholds', 'Consequence tier thresholds', 'Miss-count thresholds for nudge / HOD chat / academic flag', '{"nudge": 1, "hod_chat": 3, "academic_flag": 5}', 'jsonb', NULL, NULL, NULL, 'Q2'),
  ('team_count_thresholds', 'Team count thresholds (adaptive)', 'Section size bands → team count', '{"small": {"max_size": 25, "teams": 3}, "medium": {"max_size": 75, "teams": 5}, "large": {"teams": 7}}', 'jsonb', NULL, NULL, NULL, 'Q10'),
  ('multi_campus_mode', 'Multi-campus mode', 'How 8 colleges experience the live session', '"unified"', 'enum', '["unified","per_college","hybrid","federated"]', NULL, NULL, 'Q13'),
  ('bilingual_mode', 'Bilingual mode enabled', 'Whether sessions/quizzes are bilingual', 'true', 'bool', NULL, NULL, NULL, 'Q16'),
  ('primary_language', 'Primary language', 'Primary content language (ISO 639-1)', '"en"', 'enum', '["en","ta"]', NULL, NULL, 'Q16'),
  ('secondary_language', 'Secondary language', 'Secondary content language', '"ta"', 'enum', '["en","ta","hi"]', NULL, NULL, 'Q16'),
  ('external_judge_cadence', 'External judge cadence', 'How often external judges score cycles', '"quarterly"', 'enum', '["quarterly","every_cycle","none","open_public_async"]', NULL, NULL, 'Q4'),
  ('featured_tool_rotation_strategy', 'Featured tool rotation strategy', 'How featured tools rotate', '"weekly_champion_pick"', 'enum', '["weekly_champion_pick","quarterly_focus","none"]', NULL, NULL, 'Q15'),
  ('cron_tick_minutes', 'Cron tick cadence (min)', 'Frequency of fn_run_pulse_cycle_tick execution', '240', 'int', NULL, 5, 1440, NULL)
ON CONFLICT (config_key) DO NOTHING;

-- ============================================================================
-- C. NEW TABLE: ai_pulse_featured_tools (Q15 — vendor-agnostic master)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ai_pulse_featured_tools (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key             TEXT NOT NULL UNIQUE,
  label_en        TEXT NOT NULL,
  label_ta        TEXT,
  description     TEXT,
  vendor_name     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  is_system       BOOLEAN NOT NULL DEFAULT false,
  display_order   INT NOT NULL DEFAULT 100,
  institution_id  UUID REFERENCES public.institutions(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES public.profiles(id),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      UUID REFERENCES public.profiles(id)
);

COMMENT ON TABLE public.ai_pulse_featured_tools IS
  'Vendor-agnostic featured-tool master for weekly AI Pulse cycle. Champion picks per cycle via startup_events.config.featured_tool_id. Decouples program from any single vendor (Q12 + Q15). Spec v3 §4.2.';

INSERT INTO public.ai_pulse_featured_tools (key, label_en, label_ta, vendor_name, is_system, display_order) VALUES
  ('lovable', 'Lovable', 'Lovable', 'Lovable', true, 10),
  ('cursor', 'Cursor', 'Cursor', 'Anysphere', true, 20),
  ('github_copilot', 'GitHub Copilot', 'GitHub Copilot', 'GitHub', true, 30),
  ('gemini', 'Gemini', 'Gemini', 'Google', true, 40),
  ('chatgpt', 'ChatGPT', 'ChatGPT', 'OpenAI', true, 50),
  ('sora', 'Sora', 'Sora', 'OpenAI', true, 60),
  ('n8n', 'n8n', 'n8n', 'n8n', true, 70),
  ('perplexity', 'Perplexity', 'Perplexity', 'Perplexity', true, 80),
  ('claude', 'Claude', 'Claude', 'Anthropic', true, 90)
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- D. NEW TABLE: ai_pulse_anomaly_flags (Q11 — algorithmic detection log)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ai_pulse_anomaly_flags (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  startup_event_id      UUID NOT NULL REFERENCES public.startup_events(id) ON DELETE CASCADE,
  flag_type             TEXT NOT NULL
    CHECK (flag_type IN (
      'intra_dept_scoring_outlier',
      'random_poll_response_pattern',
      'ig_reach_inconsistent',
      'rotation_gaming',
      'excuse_frequency_outlier'
    )),
  target_user_id        UUID REFERENCES public.profiles(id),
  signal_value          NUMERIC,
  signal_threshold      NUMERIC,
  details_json          JSONB,
  reviewed_by           UUID REFERENCES public.profiles(id),
  review_outcome        TEXT
    CHECK (review_outcome IN ('confirmed_anomaly', 'false_positive', 'inconclusive', 'pending')),
  review_notes          TEXT,
  reviewed_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ai_pulse_anomaly_flags IS
  'AI Pulse algorithmic flag log. Champion (Krishnaveni / Ranjith) reviews monthly at /ai-pulse/admin/anomalies. Q11 — exact thresholds calibrate empirically after first 4 cycles. Spec v3 §4.2.';

CREATE INDEX IF NOT EXISTS idx_ai_pulse_anomaly_pending
  ON public.ai_pulse_anomaly_flags (startup_event_id) WHERE review_outcome IS NULL OR review_outcome = 'pending';
CREATE INDEX IF NOT EXISTS idx_ai_pulse_anomaly_type
  ON public.ai_pulse_anomaly_flags (flag_type, created_at DESC);

-- ============================================================================
-- E. RLS — enable on the 3 new tables (Wave A.1.1 will harden policies)
-- ============================================================================

ALTER TABLE public.ai_pulse_policies        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_pulse_featured_tools  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_pulse_anomaly_flags   ENABLE ROW LEVEL SECURITY;

-- TODO Wave A.1.1: harden RLS per spec v3 §3 personas.
-- Required policies:
--   ai_pulse_policies:        Super Admin RW; everyone else read-only when is_active=true
--   ai_pulse_featured_tools:  Champion + Super Admin RW; institution-scoped reads
--   ai_pulse_anomaly_flags:   Champion (Krishnaveni) + Co-Champion (Ranjith) RW;
--                             others no access. Service role inserts via tick function.
-- Pattern reference: 20260427_counselor_routing_db_foundation.sql RLS section.

-- ============================================================================
-- END Wave A.1 events-extension migration
-- ============================================================================
-- Total LOC: ~140 (was 596 in v2). 3 new tables + 1 column add + 1 ENUM extension.
-- All team/attendance/submission/demo-slot infrastructure reuses existing
-- startup_events ecosystem unchanged. AI Pulse cycles inserted as new rows
-- in startup_events with config.kind='ai_pulse' discriminator.
-- ============================================================================
