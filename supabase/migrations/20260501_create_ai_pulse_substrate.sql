-- ============================================================================
-- AI Pulse Module — Wave A.1 Substrate v2 (DRAFT — gated on Wave A.0)
-- ============================================================================
--
-- Spec: specs/myjkkn-ai-pulse-spec.md (PR #633, v2 post-/interview)
-- Wave: A.1 of A.0 → A.1 → A.2 → A.3 substrate plan
-- Date: 2026-04-29 (v1) / 2026-05-02 (v2)
--
-- v2 changes (incorporates /interview rounds 1-4 — 16 forced binaries):
--   • team_number CHECK BETWEEN 1 AND 7 (was 1..5) — Q10 adaptive sizing
--   • cycles: lovable_week_flag column REMOVED → featured_tool_id FK ADDED — Q12+Q15
--   • attendance: miss_state ENUM(ENGAGED|EXCUSED|MISSED) added — Q5
--   • publications: visibility_scope ENUM added; UNIQUE relaxed to allow Top+Bottom — Q6
--   • NEW substrate table: ai_pulse_anomaly_flags — Q11
--   • NEW master table: ai_pulse_featured_tools (vendor-agnostic) — Q15
--   • All master tables: label_en + label_ta columns added — Q16 bilingual
--   • Policies: lovable_week_frequency REMOVED; 12 new rows ADDED — see §C
--
-- DRAFT STATUS — DO NOT MERGE UNTIL Wave A.0 RESOLVES:
--   1. ✅ RESOLVED 2026-05-02: REUSE existing class_incharges table + role.
--      Director surfaced /staff/class-incharges as production feature.
--      No new role needed. AI-Pulse-specific permission keys
--      (aiPulse:rotation.manage, aiPulse:attendance.mark,
--      aiPulse:absence.escalate) add to lib/constants/permissions.ts.
--   2. ✅ RESOLVED 2026-04-29: AI Pulse Champion = Krishnaveni
--   3. ✅ RESOLVED 2026-05-02: Co-Champion = Ranjith (DTO JKKN,
--      Ranjith@jkkn.ac.in). Permission aiPulse:cycles.manage granted to
--      both Krishnaveni and Ranjith. host_user_id seed defaults to
--      Krishnaveni; Ranjith is fallback host.
--   4. 🔴 REMAINING: learners table FK column name
--      (learners.id vs learners_profiles.id)
--
-- This migration creates the AI Pulse module substrate per spec v2 §4:
--   A. 8 substrate tables (cycles, teams, members, attendance, engagement,
--      lab presentations, publications, anomaly_flags)
--   B. 6 master value-list tables (CRUDable, institution-scoped, bilingual)
--   C. 1 policy table (ai_pulse_policies — 22 super-admin-tunable rows)
--
-- Pattern reference: admission_lead_sources_master in
--   20260427_counselor_routing_db_foundation.sql (Spec #537).
--
-- All RLS follows the standard pattern:
--   is_super_admin() OR is_admin() OR (user_has_permission('aiPulse:...')
--     AND role_has_institution_access(institution_id))
-- ============================================================================

-- ============================================================================
-- A.  SUBSTRATE TABLES (8)
-- ============================================================================

-- A.1 — Master cycle table (one row per institution per week)
CREATE TABLE IF NOT EXISTS ai_pulse_cycles (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  week_start_date       DATE NOT NULL,
  briefing_topic_id     UUID,  -- FK to ai_pulse_topic_categories
  featured_tool_id      UUID,  -- FK to ai_pulse_featured_tools (Q15 — was lovable_week_flag in v1)
  host_user_id          UUID REFERENCES profiles(id),  -- Champion (Krishnaveni) or Co-Champion
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
  'Weekly AI Pulse cycle. featured_tool_id makes the program vendor-agnostic per Q12 (move beyond Lovable). Spec v2 §4.1.';

CREATE INDEX IF NOT EXISTS idx_ai_pulse_cycles_institution_week
  ON ai_pulse_cycles (institution_id, week_start_date DESC);
CREATE INDEX IF NOT EXISTS idx_ai_pulse_cycles_active
  ON ai_pulse_cycles (status, week_start_date) WHERE status IN ('planned', 'live');

-- A.2 — Rotational teams (3-7 per class per cycle, adaptive — Q10)
CREATE TABLE IF NOT EXISTS ai_pulse_teams (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id              UUID NOT NULL REFERENCES ai_pulse_cycles(id) ON DELETE CASCADE,
  section_id            UUID NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,  -- aligned with class_incharges.section_id (resolved 2026-05-02)
  team_number           INT NOT NULL CHECK (team_number BETWEEN 1 AND 7),  -- Q10: was 1..5
  team_lead_learner_id  UUID,  -- TODO Wave A.0: confirm learners.id vs learners_profiles.id
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, section_id, team_number)
);

COMMENT ON TABLE ai_pulse_teams IS
  '3-7 teams per section per cycle, adaptive by section size band (small=3, medium=5, large=7) per ai_pulse_policies.team_count_thresholds. Q10. Section is the unit of class organization in MyJKKN — matches class_incharges.section_id pattern. Spec v2 §4.1.';

CREATE INDEX IF NOT EXISTS idx_ai_pulse_teams_cycle_section
  ON ai_pulse_teams (cycle_id, section_id);

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

-- A.4 — Attendance (live + async make-up + miss_state derivation per Q5)
CREATE TABLE IF NOT EXISTS ai_pulse_attendance (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id              UUID NOT NULL REFERENCES ai_pulse_cycles(id) ON DELETE CASCADE,
  learner_id            UUID NOT NULL,  -- TODO Wave A.0: confirm learners FK
  joined_at             TIMESTAMPTZ,
  left_at               TIMESTAMPTZ,
  is_async_makeup       BOOLEAN NOT NULL DEFAULT false,
  is_late               BOOLEAN NOT NULL DEFAULT false,
  excuse_reason_id      UUID,  -- FK to ai_pulse_excuse_reasons
  excuse_approved       BOOLEAN,
  excuse_approved_by    UUID REFERENCES profiles(id),
  miss_state            TEXT NOT NULL DEFAULT 'MISSED'
    CHECK (miss_state IN ('ENGAGED', 'EXCUSED', 'MISSED')),
  marked_by             UUID REFERENCES profiles(id),
  evidence_url          TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, learner_id)
);

COMMENT ON TABLE ai_pulse_attendance IS
  'One row per learner per cycle. miss_state derived per Q5: ENGAGED if live OR async make-up gates pass; EXCUSED if approved excuse; MISSED otherwise. Only MISSED increments the consequence-tier strike counter. Spec v2 §4.1.';

CREATE INDEX IF NOT EXISTS idx_ai_pulse_attendance_cycle
  ON ai_pulse_attendance (cycle_id);
CREATE INDEX IF NOT EXISTS idx_ai_pulse_attendance_learner
  ON ai_pulse_attendance (learner_id, cycle_id);
CREATE INDEX IF NOT EXISTS idx_ai_pulse_attendance_miss_state
  ON ai_pulse_attendance (learner_id, miss_state) WHERE miss_state = 'MISSED';

-- A.5 — Engagement signals (4-AND gate)
CREATE TABLE IF NOT EXISTS ai_pulse_engagement (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_id         UUID NOT NULL REFERENCES ai_pulse_attendance(id) ON DELETE CASCADE,
  signal_type_id        UUID NOT NULL,  -- FK to ai_pulse_engagement_signal_types
  value                 JSONB,
  recorded_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (attendance_id, signal_type_id)
);

COMMENT ON TABLE ai_pulse_engagement IS
  '4-AND-gate engagement signals (joined/polls/stayed/quiz). Drives miss_state ENGAGED derivation. Spec v2 §6.';

CREATE INDEX IF NOT EXISTS idx_ai_pulse_engagement_attendance
  ON ai_pulse_engagement (attendance_id);

-- A.6 — Monday Lab presentations
CREATE TABLE IF NOT EXISTS ai_pulse_lab_presentations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id              UUID NOT NULL REFERENCES ai_pulse_cycles(id) ON DELETE CASCADE,
  team_id               UUID NOT NULL REFERENCES ai_pulse_teams(id) ON DELETE CASCADE,
  presented             BOOLEAN NOT NULL DEFAULT false,
  presented_at          TIMESTAMPTZ,
  scores_json           JSONB,
  total_score           NUMERIC(5,2),
  gold_standard         BOOLEAN NOT NULL DEFAULT false,
  bottom_n              BOOLEAN NOT NULL DEFAULT false,  -- Q3+Q6 — flagged Bottom-N for intranet leaderboard
  gold_tier_id          UUID,
  faculty_judge_id      UUID REFERENCES profiles(id),
  external_judge_id     UUID REFERENCES profiles(id),  -- Q4 — populated only on quarterly cycles
  judge_notes           TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_pulse_lab_presentations_cycle
  ON ai_pulse_lab_presentations (cycle_id);
CREATE INDEX IF NOT EXISTS idx_ai_pulse_lab_gold
  ON ai_pulse_lab_presentations (cycle_id, gold_standard) WHERE gold_standard = true;
CREATE INDEX IF NOT EXISTS idx_ai_pulse_lab_bottom
  ON ai_pulse_lab_presentations (cycle_id, bottom_n) WHERE bottom_n = true;

-- A.7 — Publications (Top-N external + Bottom-N intranet per Q6)
CREATE TABLE IF NOT EXISTS ai_pulse_publications (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id              UUID NOT NULL REFERENCES ai_pulse_cycles(id) ON DELETE CASCADE,
  team_id               UUID NOT NULL REFERENCES ai_pulse_teams(id) ON DELETE CASCADE,
  visibility_scope      TEXT NOT NULL DEFAULT 'public_external'
    CHECK (visibility_scope IN ('public_external', 'myjkkn_intranet', 'department_only', 'anonymized_public')),
  publication_kind      TEXT NOT NULL DEFAULT 'gold_standard'
    CHECK (publication_kind IN ('gold_standard', 'bottom_n')),
  instagram_url         TEXT,
  github_repo_url       TEXT,
  ig_reach              INT,
  ig_likes              INT,
  ig_comments           INT,
  posted_within_24h     BOOLEAN,
  published_at          TIMESTAMPTZ,
  naac_evidence_id      UUID,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, team_id, publication_kind)
);

COMMENT ON TABLE ai_pulse_publications IS
  'Top-N (gold_standard) → IG+GitHub external. Bottom-N → MyJKKN intranet only per Q6. visibility_scope and publication_kind disambiguate. Spec v2 §4.1.';

CREATE INDEX IF NOT EXISTS idx_ai_pulse_publications_cycle
  ON ai_pulse_publications (cycle_id);
CREATE INDEX IF NOT EXISTS idx_ai_pulse_publications_kind
  ON ai_pulse_publications (cycle_id, publication_kind);

-- A.8 — Anomaly flags (Q11 — algorithmic detection + monthly Champion review)
CREATE TABLE IF NOT EXISTS ai_pulse_anomaly_flags (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id              UUID NOT NULL REFERENCES ai_pulse_cycles(id) ON DELETE CASCADE,
  flag_type             TEXT NOT NULL
    CHECK (flag_type IN (
      'intra_dept_scoring_outlier',
      'random_poll_response_pattern',
      'ig_reach_inconsistent',
      'rotation_gaming',
      'excuse_frequency_outlier'
    )),
  target_user_id        UUID REFERENCES profiles(id),
  target_team_id        UUID REFERENCES ai_pulse_teams(id),
  target_publication_id UUID REFERENCES ai_pulse_publications(id),
  signal_value          NUMERIC,
  signal_threshold      NUMERIC,
  details_json          JSONB,
  reviewed_by           UUID REFERENCES profiles(id),
  review_outcome        TEXT
    CHECK (review_outcome IN ('confirmed_anomaly', 'false_positive', 'inconclusive', 'pending')),
  review_notes          TEXT,
  reviewed_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE ai_pulse_anomaly_flags IS
  'Algorithmic flag log. Champion reviews monthly at /ai-pulse/admin/anomalies. Q11 — exact thresholds calibrate empirically after first 4 cycles. Spec v2 §4.1.';

CREATE INDEX IF NOT EXISTS idx_ai_pulse_anomaly_pending
  ON ai_pulse_anomaly_flags (cycle_id) WHERE review_outcome IS NULL OR review_outcome = 'pending';
CREATE INDEX IF NOT EXISTS idx_ai_pulse_anomaly_type
  ON ai_pulse_anomaly_flags (flag_type, created_at DESC);

-- ============================================================================
-- B.  MASTER VALUE-LIST TABLES (6 — Q1=Yes, all CRUDable institution-scoped, bilingual per Q16)
-- ============================================================================

-- B.1 — Engagement signal types
CREATE TABLE IF NOT EXISTS ai_pulse_engagement_signal_types (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key             TEXT NOT NULL UNIQUE,
  label_en        TEXT NOT NULL,
  label_ta        TEXT,
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
  (key, label_en, label_ta, description, is_required_for_engaged_gate, is_system, display_order)
VALUES
  ('joined_within_5min', 'Joined within 5 min', 'ஐந்து நிமிடத்திற்குள் இணைந்தார்', 'Joined live session within 5 minutes of session_start_time', true, true, 10),
  ('polls_responded_3plus', 'Responded to 3+ polls', '3+ கருத்துக்கணிப்புகளுக்கு பதிலளித்தார்', 'Submitted at least 3 live-poll responses', true, true, 20),
  ('stayed_until_endtime', 'Stayed until end-time', 'நிறைவு வரை இருந்தார்', 'Left only after stay_until_minutes threshold', true, true, 30),
  ('quiz_passed_live', 'Passed live quiz', 'நேரடி வினாடிவினாவில் வெற்றி', 'Score >= quiz_pass_threshold_live within 60 min', true, true, 40),
  ('quiz_passed_async', 'Passed async make-up quiz', 'நேரம் மீட்பு வினாடிவினாவில் வெற்றி', 'Score >= quiz_pass_threshold_async within window', false, true, 50)
ON CONFLICT (key) DO NOTHING;

-- B.2 — Excuse reason codes
CREATE TABLE IF NOT EXISTS ai_pulse_excuse_reasons (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key             TEXT NOT NULL UNIQUE,
  label_en        TEXT NOT NULL,
  label_ta        TEXT,
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

INSERT INTO ai_pulse_excuse_reasons (key, label_en, label_ta, requires_evidence, is_system, display_order)
VALUES
  ('medical', 'Medical', 'மருத்துவ', true, true, 10),
  ('family_emergency', 'Family emergency', 'குடும்ப அவசரம்', false, true, 20),
  ('exam_clash', 'Exam clash', 'தேர்வு மோதல்', true, true, 30),
  ('technical_failure', 'Technical failure', 'தொழில்நுட்ப தோல்வி', false, true, 40),
  ('bandwidth', 'Bandwidth issue', 'இணைய வேக சிக்கல்', false, true, 50),
  ('other', 'Other (specify)', 'பிற (குறிப்பிடவும்)', true, true, 99)
ON CONFLICT (key) DO NOTHING;

-- B.3 — Gold Standard tiers
CREATE TABLE IF NOT EXISTS ai_pulse_gold_tiers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key             TEXT NOT NULL UNIQUE,
  label_en        TEXT NOT NULL,
  label_ta        TEXT,
  rank            INT NOT NULL UNIQUE,
  badge_emoji     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  is_system       BOOLEAN NOT NULL DEFAULT false,
  institution_id  UUID REFERENCES institutions(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES profiles(id),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      UUID REFERENCES profiles(id)
);

INSERT INTO ai_pulse_gold_tiers (key, label_en, label_ta, rank, badge_emoji, is_system)
VALUES
  ('gold_standard', 'Gold Standard', 'தங்கத் தரம்', 1, '🥇', true)
ON CONFLICT (key) DO NOTHING;

-- B.4 — Topic categories
CREATE TABLE IF NOT EXISTS ai_pulse_topic_categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key             TEXT NOT NULL UNIQUE,
  label_en        TEXT NOT NULL,
  label_ta        TEXT,
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

INSERT INTO ai_pulse_topic_categories (key, label_en, label_ta, is_system, display_order)
VALUES
  ('llm_basics', 'LLM Basics & Prompting', 'LLM அடிப்படைகள் & ப்ராம்ப்டிங்', true, 10),
  ('agent_design', 'Agent Design & Tool Use', 'ஏஜெண்ட் வடிவமைப்பு & கருவி பயன்பாடு', true, 20),
  ('image_generation', 'Image & Video Generation', 'பட & வீடியோ உருவாக்கம்', true, 30),
  ('code_assistants', 'Code Assistants (Copilot, Cursor)', 'குறியீட்டு உதவியாளர்கள்', true, 40),
  ('automation_workflow', 'Automation Workflows', 'தானியங்கி பணிப்பாய்வு', true, 50),
  ('data_analysis', 'AI for Data Analysis', 'தரவு பகுப்பாய்விற்கான AI', true, 60),
  ('ethics_safety', 'AI Ethics & Safety', 'AI நெறிமுறைகள் & பாதுகாப்பு', true, 70)
ON CONFLICT (key) DO NOTHING;

-- B.5 — Notification trigger keys (bilingual templates per Q16)
CREATE TABLE IF NOT EXISTS ai_pulse_notification_keys (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key               TEXT NOT NULL UNIQUE,
  label_en          TEXT NOT NULL,
  label_ta          TEXT,
  default_template_en  TEXT NOT NULL,
  default_template_ta  TEXT,
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

INSERT INTO ai_pulse_notification_keys (key, label_en, label_ta, default_template_en, default_template_ta, channel, is_system, display_order)
VALUES
  ('tminus_24h', 'T-24h reminder', 'T-24மணி நினைவூட்டல்', 'Your AI Pulse session is tomorrow at {{session_time}}. Topic: {{topic}}.', 'உங்கள் AI Pulse அமர்வு நாளை {{session_time}} மணிக்கு. தலைப்பு: {{topic}}.', 'in_app', true, 10),
  ('tminus_2h', 'T-2h reminder', 'T-2மணி நினைவூட்டல்', 'AI Pulse session in 2 hours.', 'AI Pulse அமர்வு 2 மணி நேரத்தில்.', 'in_app', true, 20),
  ('tminus_15min', 'T-15min reminder', 'T-15நிமிட நினைவூட்டல்', 'AI Pulse starts in 15 minutes. Join → {{join_url}}', 'AI Pulse 15 நிமிடங்களில். இணையவும் → {{join_url}}', 'in_app', true, 30),
  ('late_no_show', 'Late / no-show alert', 'தாமதம் / வராமை எச்சரிக்கை', 'You missed your AI Pulse slot. Async make-up within {{async_window}}h.', 'நீங்கள் AI Pulse தவறவிட்டீர்கள். {{async_window}}மணிக்குள் மீட்பு.', 'in_app', true, 40),
  ('domain_sync_due', 'Domain-Sync due', 'Domain-Sync காலம்', 'Your team Domain-Sync due in {{hours}}h.', 'உங்கள் Domain-Sync {{hours}}மணியில் காலாவதி.', 'in_app', true, 50),
  ('lab_presentation_due', 'Lab presentation reminder', 'ஆய்வக நினைவூட்டல்', 'Lab presentation Monday at {{lab_time}}.', 'திங்கட்கிழமை {{lab_time}} மணிக்கு ஆய்வக விளக்கக்காட்சி.', 'in_app', true, 60),
  ('cycle_complete_recap', 'Cycle recap', 'சுழற்சி சுருக்கம்', 'AI Pulse cycle {{week}} complete. Gold Standards: {{gold_count}}.', 'AI Pulse சுழற்சி {{week}} முடிந்தது. தங்கத் தரங்கள்: {{gold_count}}.', 'in_app', true, 70),
  ('escalation_t1_class_incharge', 'T1: Class Incharge nudge', 'T1: வகுப்பு பொறுப்பாளர்', '{{count}} learners in your section have not completed Domain-Sync.', 'உங்கள் பிரிவில் {{count}} கற்போர் Domain-Sync முடிக்கவில்லை.', 'attention_bar', true, 80),
  ('escalation_t2_dept_head', 'T2: Dept Head red flag', 'T2: துறைத் தலைவர்', 'Class {{class}} missed AI Pulse Domain-Sync.', 'வகுப்பு {{class}} AI Pulse தவறவிட்டது.', 'attention_bar', true, 90),
  ('hod_chat_intervention', 'HOD chat intervention (3 misses)', 'HOD உரையாடல்', '{{learner}} has missed {{count}} cycles. HOD/Faculty conversation recommended.', '{{learner}} {{count}} சுழற்சிகளை தவறவிட்டார்.', 'attention_bar', true, 100),
  ('academic_flag_5_miss', 'Academic flag (5 misses)', 'கல்வி குறிப்பு', '{{learner}} accumulated 5 strikes. Academic record flagged.', '{{learner}} 5 குறிகள். கல்வி பதிவு குறிக்கப்பட்டது.', 'attention_bar', true, 110)
ON CONFLICT (key) DO NOTHING;

-- B.6 — Featured tools (Q15 — vendor-agnostic per Q12)
CREATE TABLE IF NOT EXISTS ai_pulse_featured_tools (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key             TEXT NOT NULL UNIQUE,
  label_en        TEXT NOT NULL,
  label_ta        TEXT,
  description     TEXT,
  vendor_name     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  is_system       BOOLEAN NOT NULL DEFAULT false,
  display_order   INT NOT NULL DEFAULT 100,
  institution_id  UUID REFERENCES institutions(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES profiles(id),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      UUID REFERENCES profiles(id)
);

COMMENT ON TABLE ai_pulse_featured_tools IS
  'Vendor-agnostic featured tools for the weekly AI Pulse cycle. Champion picks per cycle. Decouples program from any single vendor (Lovable was just one). Q12 + Q15. Spec v2 §4.2.';

INSERT INTO ai_pulse_featured_tools (key, label_en, label_ta, vendor_name, is_system, display_order)
VALUES
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
-- C.  POLICY TABLE (Q3=Yes, 22 super-admin-tunable rows)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_pulse_policies (
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
  locked_by_q     TEXT,  -- v2 — interview-question reference for traceability
  is_active       BOOLEAN NOT NULL DEFAULT true,
  institution_id  UUID REFERENCES institutions(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES profiles(id),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      UUID REFERENCES profiles(id)
);

COMMENT ON TABLE ai_pulse_policies IS
  '22 super-admin-tunable policy values. Pattern: counselor_rules (Spec #537). Editable at /admin/config/ai-pulse with mandatory change_reason in audit log. Per Director directive 2026-04-29 — every policy decision is a config row. Spec v2 §4.3 + §12 Decision Log.';

CREATE INDEX IF NOT EXISTS idx_ai_pulse_policies_active
  ON ai_pulse_policies (is_active, config_key) WHERE is_active = true;

INSERT INTO ai_pulse_policies (config_key, display_name, description, value_jsonb, data_type, enum_options, min_value, max_value, locked_by_q)
VALUES
  ('session_day', 'Briefing day', 'Day of week for live AI Pulse session', '"Thursday"',
   'enum', '["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]', NULL, NULL, NULL),
  ('session_start_time', 'Session start time', 'Local time when briefing begins', '"18:55"',
   'time', NULL, NULL, NULL, NULL),
  ('session_end_time', 'Session end time', 'Local time when briefing ends', '"19:30"',
   'time', NULL, NULL, NULL, NULL),
  ('late_threshold_minutes', 'Late threshold', 'Minutes after session_start_time after which join is "late"', '10',
   'int', NULL, 0, 60, NULL),
  ('domain_sync_deadline_offset_days', 'Domain-Sync deadline (days)', 'Days after Thursday for Domain-Sync submission', '3',
   'int', NULL, 1, 7, NULL),
  ('lab_presentation_day', 'Lab presentation day', 'Day for following-week class presentation', '"Monday"',
   'enum', '["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]', NULL, NULL, NULL),
  ('gold_standard_count', 'Gold Standard count', 'Top-N teams selected per cycle as Gold Standard', '2',
   'int', NULL, 1, 10, NULL),
  ('bottom_n_publication_count', 'Bottom-N publication count', 'Bottom-N teams flagged for intranet leaderboard', '2',
   'int', NULL, 0, 10, 'Q3+Q6'),
  ('bottom_n_visibility_scope', 'Bottom-N visibility scope', 'Where bottom-N publications are visible', '"myjkkn_intranet"',
   'enum', '["myjkkn_intranet","public_external","department_only","anonymized_public"]', NULL, NULL, 'Q6'),
  ('learner_visibility_override_enabled', 'Learner visibility opt-out enabled', 'Allow individual learners to opt out of leaderboard appearance', 'true',
   'bool', NULL, NULL, NULL, 'Q6'),
  ('ig_post_deadline_hours', 'IG post deadline (hours)', 'Hours after Lab presentation to publish', '24',
   'int', NULL, 1, 168, NULL),
  ('ig_reach_threshold', 'IG reach threshold', 'Minimum IG reach for engaged-publication KPI', '500',
   'int', NULL, 0, 1000000, NULL),
  ('quiz_pass_threshold_live', 'Quiz pass % (live)', 'Minimum quiz score for live attendees', '40',
   'int', NULL, 0, 100, NULL),
  ('quiz_pass_threshold_async', 'Quiz pass % (async)', 'Minimum quiz score for async make-up (higher bar)', '60',
   'int', NULL, 0, 100, NULL),
  ('async_makeup_window_hours', 'Async make-up window (hours)', 'Hours after session to complete async make-up', '48',
   'int', NULL, 1, 720, NULL),
  ('engaged_state_definition', 'Engaged-state definition', 'What rescues a miss: live OR async OR excused', '"live_or_async_or_excused"',
   'enum', '["live_only","live_or_async","live_or_excused","live_or_async_or_excused"]', NULL, NULL, 'Q5'),
  ('consequence_tier_thresholds', 'Consequence tier thresholds', 'Miss-count thresholds for nudge / HOD chat / academic flag', '{"nudge": 1, "hod_chat": 3, "academic_flag": 5}',
   'jsonb', NULL, NULL, NULL, 'Q2'),
  ('escalation_t1_percent', 'Escalation T1 (%)', 'Percent of cycle elapsed before first escalation', '80',
   'int', NULL, 0, 100, NULL),
  ('escalation_t2_percent', 'Escalation T2 (%)', 'Percent of cycle elapsed before Director-digest red flag', '100',
   'int', NULL, 0, 200, NULL),
  ('team_count_thresholds', 'Team count thresholds (adaptive)', 'Class size bands → team count', '{"small": {"max_size": 25, "teams": 3}, "medium": {"max_size": 75, "teams": 5}, "large": {"teams": 7}}',
   'jsonb', NULL, NULL, NULL, 'Q10'),
  ('multi_campus_mode', 'Multi-campus mode', 'How the 8 colleges experience the live session', '"unified"',
   'enum', '["unified","per_college","hybrid","federated"]', NULL, NULL, 'Q13'),
  ('bilingual_mode', 'Bilingual mode enabled', 'Whether sessions/quizzes are bilingual', 'true',
   'bool', NULL, NULL, NULL, 'Q16'),
  ('primary_language', 'Primary language', 'Primary content language (ISO 639-1)', '"en"',
   'enum', '["en","ta"]', NULL, NULL, 'Q16'),
  ('secondary_language', 'Secondary language', 'Secondary content language for bilingual mode', '"ta"',
   'enum', '["en","ta","hi"]', NULL, NULL, 'Q16'),
  ('external_judge_cadence', 'External judge cadence', 'How often external judges score cycles', '"quarterly"',
   'enum', '["quarterly","every_cycle","none","open_public_async"]', NULL, NULL, 'Q4'),
  ('featured_tool_rotation_strategy', 'Featured tool rotation strategy', 'How featured tools rotate through cycles', '"weekly_champion_pick"',
   'enum', '["weekly_champion_pick","quarterly_focus","none"]', NULL, NULL, 'Q15'),
  ('cron_tick_minutes', 'Cron tick cadence (min)', 'Frequency of fn_run_pulse_cycle_tick execution', '240',
   'int', NULL, 5, 1440, NULL)
ON CONFLICT (config_key) DO NOTHING;

-- ============================================================================
-- D.  FK closures (deferred until master tables exist)
-- ============================================================================

ALTER TABLE ai_pulse_cycles
  ADD CONSTRAINT fk_ai_pulse_cycles_topic
  FOREIGN KEY (briefing_topic_id) REFERENCES ai_pulse_topic_categories(id);

ALTER TABLE ai_pulse_cycles
  ADD CONSTRAINT fk_ai_pulse_cycles_featured_tool
  FOREIGN KEY (featured_tool_id) REFERENCES ai_pulse_featured_tools(id);

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
ALTER TABLE ai_pulse_anomaly_flags            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_pulse_engagement_signal_types  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_pulse_excuse_reasons           ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_pulse_gold_tiers               ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_pulse_topic_categories         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_pulse_notification_keys        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_pulse_featured_tools           ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_pulse_policies                 ENABLE ROW LEVEL SECURITY;

-- TODO Wave A.1.1: harden RLS per spec v2 §3 permissions matrix.
-- Pattern reference: 20260427_counselor_routing_db_foundation.sql RLS section.
-- Required policies:
--   • Learner: view:self on attendance/engagement/team_members where learner_id = auth.uid()
--   • Class Incharge (existing role): full RW on attendance/teams scoped to section_id (joined via class_incharges.staff_id = auth.uid()'s staff record). Reuses staff.class_incharges.* permission keys + new aiPulse:rotation.manage / aiPulse:attendance.mark / aiPulse:absence.escalate.
--   • Faculty: RW on lab_presentations + excuse_approved on attendance, scoped to class
--   • Dept Head: read all tables scoped to department_id; intervene:hod_chat_log
--   • Champion + Co-Champion: full RW on cycles + topics + featured_tools + anomaly review
--   • External Judge: score:gold_standard_quarterly only on assigned quarterly cycles
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
  -- Wave A.2 implements:
  --   1. Notification fan-out per ai_pulse_notification_keys (T-24h/T-2h/T-15min/late_no_show)
  --   2. miss_state derivation per Q5 (live OR async OR excused)
  --   3. Consequence-tier escalation per consequence_tier_thresholds (1/3/5)
  --   4. Team-count adaptation per team_count_thresholds (Q10 small/medium/large)
  --   5. Bilingual notification routing per primary_language + secondary_language (Q16)
  --   6. Anomaly flag generation (Q11 algorithmic signals)
  --   7. Cycle status transitions: planned → live → completed at session_end_time + 1h
  --   8. NAAC evidence pipe — Gold Standards → quality_evidence_mappings
  RAISE NOTICE 'fn_run_pulse_cycle_tick: stub — Wave A.2 implements';
END;
$$;

COMMENT ON FUNCTION fn_run_pulse_cycle_tick() IS
  'Wave A.1 STUB. Wave A.2 implements full tick logic. Scheduled via pg_cron at policies.cron_tick_minutes cadence.';

-- ============================================================================
-- END Wave A.1 substrate v2
-- ============================================================================
