-- ============================================================================
-- PDE (Principal-Directed Education) Module - Complete Schema
-- Generated from live staging DB (hhprjbgknupaplivtoib) on 2026-04-05
-- For git tracking only — tables already exist in the database.
-- ============================================================================

-- ============================================================================
-- 1. FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.pde_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.pde_next_certificate_number()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER;
  v_year TEXT;
BEGIN
  v_year := EXTRACT(YEAR FROM NOW())::TEXT;
  SELECT COUNT(*) + 1 INTO v_count FROM pde_certificates
  WHERE certificate_number LIKE 'JKKN-PDE-' || v_year || '-%';
  RETURN 'JKKN-PDE-' || v_year || '-' || LPAD(v_count::TEXT, 5, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.pde_auto_grade_submission(p_submission_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_score DECIMAL;
  v_total_points INTEGER;
  v_earned_points INTEGER;
  v_pass_threshold DECIMAL;
  v_assessment_id UUID;
BEGIN
  SELECT assessment_id INTO v_assessment_id
  FROM pde_submissions WHERE id = p_submission_id;

  SELECT pass_threshold INTO v_pass_threshold
  FROM pde_assessments WHERE id = v_assessment_id;

  SELECT COALESCE(SUM(points), 0) INTO v_total_points
  FROM pde_assessment_questions WHERE assessment_id = v_assessment_id;

  SELECT COALESCE(SUM((a->>'points_earned')::INTEGER), 0) INTO v_earned_points
  FROM pde_submissions s,
    jsonb_array_elements(s.answers) AS a
  WHERE s.id = p_submission_id;

  IF v_total_points > 0 THEN
    v_score := (v_earned_points::DECIMAL / v_total_points) * 100;
  ELSE
    v_score := 0;
  END IF;

  UPDATE pde_submissions
  SET auto_score = v_score,
      final_score = v_score,
      passed = (v_score >= v_pass_threshold),
      completed_at = NOW()
  WHERE id = p_submission_id;

  RETURN v_score;
END;
$$;

CREATE OR REPLACE FUNCTION public.pde_log_engagement(
  p_learner_id uuid,
  p_event_type character varying,
  p_course_id uuid DEFAULT NULL,
  p_lesson_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_id UUID;
  v_today DATE := CURRENT_DATE;
  v_time_spent INTEGER;
BEGIN
  INSERT INTO pde_engagement_events (learner_id, event_type, course_id, lesson_id, metadata)
  VALUES (p_learner_id, p_event_type, p_course_id, p_lesson_id, p_metadata)
  RETURNING id INTO v_event_id;

  IF p_course_id IS NOT NULL THEN
    INSERT INTO pde_engagement_daily (learner_id, course_id, date)
    VALUES (p_learner_id, p_course_id, v_today)
    ON CONFLICT (learner_id, course_id, date) DO NOTHING;

    v_time_spent := COALESCE((p_metadata->>'time_spent_seconds')::INTEGER / 60, 0);

    CASE p_event_type
      WHEN 'lesson_view' THEN
        UPDATE pde_engagement_daily
        SET lessons_viewed = lessons_viewed + 1, time_spent_minutes = time_spent_minutes + v_time_spent
        WHERE learner_id = p_learner_id AND course_id = p_course_id AND date = v_today;
      WHEN 'lesson_complete' THEN
        UPDATE pde_engagement_daily
        SET lessons_completed = lessons_completed + 1
        WHERE learner_id = p_learner_id AND course_id = p_course_id AND date = v_today;
      WHEN 'exercise_submit' THEN
        UPDATE pde_engagement_daily
        SET exercises_attempted = exercises_attempted + 1
        WHERE learner_id = p_learner_id AND course_id = p_course_id AND date = v_today;
      WHEN 'assessment_submit' THEN
        UPDATE pde_engagement_daily
        SET assessments_taken = assessments_taken + 1
        WHERE learner_id = p_learner_id AND course_id = p_course_id AND date = v_today;
      WHEN 'ai_prompt_used' THEN
        UPDATE pde_engagement_daily
        SET ai_prompts_used = ai_prompts_used + 1
        WHERE learner_id = p_learner_id AND course_id = p_course_id AND date = v_today;
      WHEN 'ai_output_modified' THEN
        UPDATE pde_engagement_daily
        SET ai_outputs_modified = ai_outputs_modified + 1
        WHERE learner_id = p_learner_id AND course_id = p_course_id AND date = v_today;
      WHEN 'ai_output_accepted_blindly' THEN
        UPDATE pde_engagement_daily
        SET ai_outputs_accepted_blind = ai_outputs_accepted_blind + 1
        WHERE learner_id = p_learner_id AND course_id = p_course_id AND date = v_today;
      WHEN 'discussion_post', 'discussion_reply' THEN
        UPDATE pde_engagement_daily
        SET discussion_posts = discussion_posts + 1
        WHERE learner_id = p_learner_id AND course_id = p_course_id AND date = v_today;
      ELSE NULL;
    END CASE;
  END IF;

  RETURN v_event_id;
END;
$$;

-- ============================================================================
-- 2. TABLES (19 tables)
-- ============================================================================

-- 2.1 pde_agency_index
CREATE TABLE IF NOT EXISTS pde_agency_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id UUID REFERENCES profiles(id),
  course_id UUID REFERENCES vac_courses(id),
  assessment_date DATE,
  initiative NUMERIC,
  self_direction NUMERIC,
  tool_mastery NUMERIC,
  critical_evaluation NUMERIC,
  ethical_judgment NUMERIC,
  overall NUMERIC,
  level TEXT,
  evidence JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2.2 pde_assessments
CREATE TABLE IF NOT EXISTS pde_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID REFERENCES vac_lessons(id),
  course_id UUID REFERENCES vac_courses(id),
  title TEXT NOT NULL,
  description TEXT,
  assessment_type VARCHAR(20) NOT NULL DEFAULT 'quiz',
  time_limit_minutes INTEGER,
  max_attempts INTEGER DEFAULT 3,
  pass_threshold NUMERIC DEFAULT 70.00,
  shuffle_questions BOOLEAN DEFAULT true,
  show_correct_after BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  quest_id UUID,
  rubric JSONB,
  requires_peer_count INTEGER DEFAULT 0,
  requires_faculty BOOLEAN DEFAULT false,
  auto_grade_config JSONB
);

-- 2.3 pde_assessment_questions
CREATE TABLE IF NOT EXISTS pde_assessment_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES pde_assessments(id),
  question_type VARCHAR(30) NOT NULL,
  question_text TEXT NOT NULL,
  question_media_url TEXT,
  options JSONB,
  correct_answer TEXT,
  points INTEGER DEFAULT 1,
  explanation TEXT,
  finks_dimension VARCHAR(30),
  difficulty VARCHAR(20),
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2.4 pde_badges
CREATE TABLE IF NOT EXISTS pde_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon_url TEXT,
  category TEXT,
  points INTEGER DEFAULT 0,
  criteria JSONB
);

-- 2.5 pde_build_sessions
CREATE TABLE IF NOT EXISTS pde_build_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id UUID REFERENCES profiles(id),
  quest_id UUID REFERENCES pde_quests(id),
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  ai_interactions JSONB,
  ai_prompts_count INTEGER DEFAULT 0,
  ai_outputs_modified INTEGER DEFAULT 0,
  ai_outputs_blind INTEGER DEFAULT 0,
  artifacts JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2.6 pde_capabilities
CREATE TABLE IF NOT EXISTS pde_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  level INTEGER NOT NULL,
  lesson_ids JSONB,
  prerequisite_ids JSONB,
  demonstration_rubric JSONB,
  evidence_types JSONB,
  finks_dimension TEXT,
  estimated_hours NUMERIC,
  is_core BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2.7 pde_certificates
CREATE TABLE IF NOT EXISTS pde_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id UUID NOT NULL,
  course_id UUID NOT NULL REFERENCES vac_courses(id),
  certificate_number VARCHAR(30) NOT NULL UNIQUE,
  certificate_type VARCHAR(30) DEFAULT 'course_completion',
  issued_at TIMESTAMPTZ DEFAULT now(),
  final_score NUMERIC,
  completion_hours INTEGER,
  finks_profile JSONB,
  agency_index NUMERIC,
  capabilities_demonstrated JSONB,
  verification_url TEXT,
  pdf_url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- 2.8 pde_channels
CREATE TABLE IF NOT EXISTS pde_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_type TEXT NOT NULL,
  reference_id UUID,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2.9 pde_coach_conversations
CREATE TABLE IF NOT EXISTS pde_coach_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id UUID REFERENCES profiles(id),
  context_type TEXT,
  context_id UUID,
  messages JSONB,
  coaching_style TEXT,
  tokens_used INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2.10 pde_engagement_daily
CREATE TABLE IF NOT EXISTS pde_engagement_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id UUID NOT NULL,
  course_id UUID NOT NULL REFERENCES vac_courses(id),
  date DATE NOT NULL,
  lessons_viewed INTEGER DEFAULT 0,
  lessons_completed INTEGER DEFAULT 0,
  exercises_attempted INTEGER DEFAULT 0,
  assessments_taken INTEGER DEFAULT 0,
  assessment_avg_score NUMERIC,
  time_spent_minutes INTEGER DEFAULT 0,
  discussion_posts INTEGER DEFAULT 0,
  ai_prompts_used INTEGER DEFAULT 0,
  ai_outputs_modified INTEGER DEFAULT 0,
  ai_outputs_accepted_blind INTEGER DEFAULT 0,
  streak_days INTEGER DEFAULT 0,
  UNIQUE(learner_id, course_id, date)
);

-- 2.11 pde_engagement_events
CREATE TABLE IF NOT EXISTS pde_engagement_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id UUID NOT NULL,
  event_type VARCHAR(40) NOT NULL,
  course_id UUID REFERENCES vac_courses(id),
  lesson_id UUID REFERENCES vac_lessons(id),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2.12 pde_learner_badges
CREATE TABLE IF NOT EXISTS pde_learner_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id UUID REFERENCES profiles(id),
  badge_id UUID REFERENCES pde_badges(id),
  earned_at TIMESTAMPTZ DEFAULT now(),
  evidence TEXT,
  UNIQUE(learner_id, badge_id)
);

-- 2.13 pde_learner_capabilities
CREATE TABLE IF NOT EXISTS pde_learner_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id UUID REFERENCES profiles(id),
  capability_id UUID REFERENCES pde_capabilities(id),
  status TEXT DEFAULT 'locked',
  demonstrated_at TIMESTAMPTZ,
  demonstration_evidence JSONB,
  demonstration_score NUMERIC,
  mastered_at TIMESTAMPTZ,
  mastery_quest_id UUID,
  UNIQUE(learner_id, capability_id)
);

-- 2.14 pde_messages
CREATE TABLE IF NOT EXISTS pde_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES pde_channels(id),
  author_id UUID REFERENCES profiles(id),
  parent_id UUID REFERENCES pde_messages(id),
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text',
  reactions JSONB DEFAULT '{}'::jsonb,
  is_pinned BOOLEAN DEFAULT false,
  is_answer BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2.15 pde_quest_enrollments
CREATE TABLE IF NOT EXISTS pde_quest_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_id UUID REFERENCES pde_quests(id),
  learner_id UUID REFERENCES profiles(id),
  team_id UUID,
  role TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active',
  UNIQUE(quest_id, learner_id)
);

-- 2.16 pde_quest_submissions
CREATE TABLE IF NOT EXISTS pde_quest_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_id UUID REFERENCES pde_quests(id),
  learner_id UUID REFERENCES profiles(id),
  team_id UUID,
  submission_type TEXT,
  title TEXT NOT NULL,
  description TEXT,
  evidence_urls JSONB,
  reflection TEXT,
  peer_scores JSONB,
  faculty_score NUMERIC,
  auto_score NUMERIC,
  final_score NUMERIC,
  passed BOOLEAN,
  feedback JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2.17 pde_quests
CREATE TABLE IF NOT EXISTS pde_quests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  problem_statement TEXT NOT NULL,
  quest_type TEXT NOT NULL,
  difficulty TEXT,
  source_type TEXT,
  source_department TEXT,
  source_contact TEXT,
  required_capabilities JSONB,
  estimated_hours INTEGER,
  max_team_size INTEGER DEFAULT 1,
  reputation_points INTEGER DEFAULT 100,
  badges JSONB,
  solutions_hub_eligible BOOLEAN DEFAULT false,
  nif_eligible BOOLEAN DEFAULT false,
  deliverable_description TEXT NOT NULL,
  deliverable_rubric JSONB,
  status TEXT DEFAULT 'open',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2.18 pde_reputation
CREATE TABLE IF NOT EXISTS pde_reputation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id UUID UNIQUE REFERENCES profiles(id),
  total_points INTEGER DEFAULT 0,
  level TEXT DEFAULT 'apprentice',
  quest_points INTEGER DEFAULT 0,
  capability_points INTEGER DEFAULT 0,
  social_points INTEGER DEFAULT 0,
  consistency_points INTEGER DEFAULT 0,
  quests_completed INTEGER DEFAULT 0,
  capabilities_demonstrated INTEGER DEFAULT 0,
  peer_reviews_given INTEGER DEFAULT 0,
  peer_reviews_helpful INTEGER DEFAULT 0,
  help_given_count INTEGER DEFAULT 0,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2.19 pde_submissions
CREATE TABLE IF NOT EXISTS pde_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES pde_assessments(id),
  learner_id UUID NOT NULL,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  answers JSONB,
  auto_score NUMERIC,
  evidence_urls JSONB,
  reflection TEXT,
  peer_scores JSONB,
  peer_avg_score NUMERIC,
  faculty_score NUMERIC,
  faculty_feedback TEXT,
  faculty_reviewer_id UUID,
  final_score NUMERIC,
  passed BOOLEAN,
  time_spent_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 3. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_pde_agency_learner ON pde_agency_index(learner_id);
CREATE INDEX IF NOT EXISTS idx_pde_agency_course ON pde_agency_index(course_id);
CREATE INDEX IF NOT EXISTS idx_pde_agency_date ON pde_agency_index(assessment_date);

CREATE INDEX IF NOT EXISTS idx_pde_assess_course ON pde_assessments(course_id);
CREATE INDEX IF NOT EXISTS idx_pde_assess_lesson ON pde_assessments(lesson_id);
CREATE INDEX IF NOT EXISTS idx_pde_assess_type ON pde_assessments(assessment_type);

CREATE INDEX IF NOT EXISTS idx_pde_questions_assess ON pde_assessment_questions(assessment_id);

CREATE INDEX IF NOT EXISTS idx_pde_certs_learner ON pde_certificates(learner_id);
CREATE INDEX IF NOT EXISTS idx_pde_certs_course ON pde_certificates(course_id);
CREATE INDEX IF NOT EXISTS idx_pde_certs_number ON pde_certificates(certificate_number);

CREATE INDEX IF NOT EXISTS idx_pde_coach_learner ON pde_coach_conversations(learner_id);
CREATE INDEX IF NOT EXISTS idx_pde_coach_context ON pde_coach_conversations(context_type, context_id);

CREATE INDEX IF NOT EXISTS idx_pde_daily_learner ON pde_engagement_daily(learner_id, date);
CREATE INDEX IF NOT EXISTS idx_pde_daily_course ON pde_engagement_daily(course_id, date);

CREATE INDEX IF NOT EXISTS idx_pde_events_learner ON pde_engagement_events(learner_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pde_events_course ON pde_engagement_events(course_id);
CREATE INDEX IF NOT EXISTS idx_pde_events_type ON pde_engagement_events(event_type);

CREATE INDEX IF NOT EXISTS idx_msg_channel ON pde_messages(channel_id, created_at);

CREATE INDEX IF NOT EXISTS idx_qenroll_quest ON pde_quest_enrollments(quest_id);
CREATE INDEX IF NOT EXISTS idx_qenroll_learner ON pde_quest_enrollments(learner_id);

CREATE INDEX IF NOT EXISTS idx_quest_type ON pde_quests(quest_type);
CREATE INDEX IF NOT EXISTS idx_quest_diff ON pde_quests(difficulty);
CREATE INDEX IF NOT EXISTS idx_quest_status ON pde_quests(status);

CREATE INDEX IF NOT EXISTS idx_pde_sub_assess ON pde_submissions(assessment_id);
CREATE INDEX IF NOT EXISTS idx_pde_sub_learner ON pde_submissions(learner_id);

-- ============================================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE pde_agency_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE pde_assessment_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pde_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pde_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE pde_build_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pde_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE pde_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE pde_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE pde_coach_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE pde_engagement_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE pde_engagement_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE pde_learner_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE pde_learner_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE pde_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE pde_quest_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pde_quest_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pde_quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE pde_reputation ENABLE ROW LEVEL SECURITY;
ALTER TABLE pde_submissions ENABLE ROW LEVEL SECURITY;

-- pde_agency_index policies
CREATE POLICY own_agency_select ON pde_agency_index FOR SELECT USING (learner_id = auth.uid());
CREATE POLICY agency_admin_read ON pde_agency_index FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = ANY(ARRAY['admin','super_admin','hod']))
);
CREATE POLICY agency_insert ON pde_agency_index FOR INSERT WITH CHECK (
  learner_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = ANY(ARRAY['admin','super_admin']))
);

-- pde_assessment_questions policies
CREATE POLICY pde_questions_read ON pde_assessment_questions FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM pde_assessments WHERE pde_assessments.id = pde_assessment_questions.assessment_id AND pde_assessments.is_active = true)
);
CREATE POLICY pde_questions_write ON pde_assessment_questions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- pde_assessments policies
CREATE POLICY pde_assess_read ON pde_assessments FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY pde_assess_write ON pde_assessments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- pde_badges policies
CREATE POLICY badges_public_read ON pde_badges FOR SELECT USING (true);

-- pde_build_sessions policies
CREATE POLICY own_build_sessions ON pde_build_sessions FOR SELECT TO authenticated USING (learner_id = auth.uid());
CREATE POLICY own_build_sessions_insert ON pde_build_sessions FOR INSERT TO authenticated WITH CHECK (learner_id = auth.uid());
CREATE POLICY own_build_sessions_update ON pde_build_sessions FOR UPDATE TO authenticated USING (learner_id = auth.uid());

-- pde_capabilities policies
CREATE POLICY capabilities_public_read ON pde_capabilities FOR SELECT TO authenticated USING (true);

-- pde_certificates policies
CREATE POLICY pde_certs_public_read ON pde_certificates FOR SELECT USING (true);
CREATE POLICY pde_certs_write ON pde_certificates FOR INSERT TO authenticated WITH CHECK (true);

-- pde_channels policies
CREATE POLICY channels_public_read ON pde_channels FOR SELECT TO authenticated USING (is_active = true);

-- pde_coach_conversations policies
CREATE POLICY own_coach_conversations_select ON pde_coach_conversations FOR SELECT USING (learner_id = auth.uid());
CREATE POLICY own_coach_conversations_insert ON pde_coach_conversations FOR INSERT WITH CHECK (learner_id = auth.uid());
CREATE POLICY own_coach_conversations_update ON pde_coach_conversations FOR UPDATE USING (learner_id = auth.uid());

-- pde_engagement_daily policies
CREATE POLICY pde_daily_own_read ON pde_engagement_daily FOR SELECT TO authenticated USING (learner_id = auth.uid());
CREATE POLICY pde_daily_admin_read ON pde_engagement_daily FOR SELECT TO authenticated USING (true);
CREATE POLICY pde_daily_write ON pde_engagement_daily FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- pde_engagement_events policies
CREATE POLICY pde_events_admin_read ON pde_engagement_events FOR SELECT TO authenticated USING (true);
CREATE POLICY pde_events_own_insert ON pde_engagement_events FOR INSERT TO authenticated WITH CHECK (learner_id = auth.uid());

-- pde_learner_badges policies
CREATE POLICY own_badges_select ON pde_learner_badges FOR SELECT TO authenticated USING (learner_id = auth.uid());
CREATE POLICY badges_public_view ON pde_learner_badges FOR SELECT USING (true);

-- pde_learner_capabilities policies
CREATE POLICY own_capabilities_select ON pde_learner_capabilities FOR SELECT TO authenticated USING (learner_id = auth.uid());
CREATE POLICY own_capabilities_insert ON pde_learner_capabilities FOR INSERT TO authenticated WITH CHECK (learner_id = auth.uid());
CREATE POLICY own_capabilities_update ON pde_learner_capabilities FOR UPDATE TO authenticated USING (learner_id = auth.uid());

-- pde_messages policies
CREATE POLICY messages_authenticated_read ON pde_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY messages_own_insert ON pde_messages FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());

-- pde_quest_enrollments policies
CREATE POLICY own_enrollments_select ON pde_quest_enrollments FOR SELECT TO authenticated USING (learner_id = auth.uid());
CREATE POLICY own_enrollments_insert ON pde_quest_enrollments FOR INSERT TO authenticated WITH CHECK (learner_id = auth.uid());
CREATE POLICY own_enrollments_update ON pde_quest_enrollments FOR UPDATE TO authenticated USING (learner_id = auth.uid());

-- pde_quest_submissions policies
CREATE POLICY own_quest_submissions_select ON pde_quest_submissions FOR SELECT TO authenticated USING (learner_id = auth.uid());
CREATE POLICY own_quest_submissions_insert ON pde_quest_submissions FOR INSERT TO authenticated WITH CHECK (learner_id = auth.uid());

-- pde_quests policies
CREATE POLICY enrolled_see_quests ON pde_quests FOR SELECT TO authenticated USING (status = ANY(ARRAY['open','in_progress']));
CREATE POLICY admin_manage_quests ON pde_quests FOR ALL TO authenticated USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());

-- pde_reputation policies
CREATE POLICY public_reputation ON pde_reputation FOR SELECT USING (true);
CREATE POLICY own_reputation_update ON pde_reputation FOR UPDATE TO authenticated USING (learner_id = auth.uid());

-- pde_submissions policies
CREATE POLICY pde_sub_own_read ON pde_submissions FOR SELECT TO authenticated USING (learner_id = auth.uid());
CREATE POLICY pde_sub_admin_read ON pde_submissions FOR SELECT TO authenticated USING (true);
CREATE POLICY pde_sub_own_insert ON pde_submissions FOR INSERT TO authenticated WITH CHECK (learner_id = auth.uid());

-- ============================================================================
-- 5. TRIGGERS
-- ============================================================================

CREATE TRIGGER update_pde_assessments_updated_at
  BEFORE UPDATE ON pde_assessments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_pde_coach_updated_at
  BEFORE UPDATE ON pde_coach_conversations
  FOR EACH ROW EXECUTE FUNCTION pde_set_updated_at();

CREATE TRIGGER pde_quests_updated_at
  BEFORE UPDATE ON pde_quests
  FOR EACH ROW EXECUTE FUNCTION pde_set_updated_at();

CREATE TRIGGER pde_reputation_updated_at
  BEFORE UPDATE ON pde_reputation
  FOR EACH ROW EXECUTE FUNCTION pde_set_updated_at();

-- ============================================================================
-- 6. VIEWS (3 views)
-- ============================================================================

CREATE OR REPLACE VIEW pde_at_risk_learners AS
SELECT
  e.learner_id,
  e.course_id,
  p.full_name,
  p.email,
  MAX(e.date) AS last_active_date,
  (CURRENT_DATE - MAX(e.date)) AS days_inactive,
  AVG(e.assessment_avg_score) AS avg_score,
  SUM(e.time_spent_minutes) AS total_time,
  SUM(e.lessons_completed) AS total_lessons_completed,
  CASE
    WHEN (CURRENT_DATE - MAX(e.date)) > 7 THEN 'critical'
    WHEN (CURRENT_DATE - MAX(e.date)) > 3 THEN 'warning'
    WHEN AVG(e.assessment_avg_score) < 50 THEN 'struggling'
    ELSE 'on_track'
  END AS risk_level
FROM pde_engagement_daily e
LEFT JOIN profiles p ON e.learner_id = p.id
GROUP BY e.learner_id, e.course_id, p.full_name, p.email;

CREATE OR REPLACE VIEW pde_quest_leaderboard AS
SELECT
  r.learner_id,
  p.full_name,
  p.email,
  r.total_points,
  r.level,
  r.quests_completed,
  r.capabilities_demonstrated,
  r.current_streak,
  r.longest_streak,
  RANK() OVER (ORDER BY r.total_points DESC) as rank
FROM pde_reputation r
LEFT JOIN profiles p ON r.learner_id = p.id
ORDER BY r.total_points DESC;

CREATE OR REPLACE VIEW pde_finks_competency AS
SELECT
  lc.learner_id,
  c.finks_dimension,
  COUNT(*) FILTER (WHERE lc.status = 'demonstrated' OR lc.status = 'mastered') as demonstrated_count,
  COUNT(*) as total_count,
  ROUND(
    COUNT(*) FILTER (WHERE lc.status = 'demonstrated' OR lc.status = 'mastered')::DECIMAL
    / NULLIF(COUNT(*), 0) * 100, 1
  ) as competency_pct
FROM pde_learner_capabilities lc
JOIN pde_capabilities c ON lc.capability_id = c.id
WHERE c.finks_dimension IS NOT NULL
GROUP BY lc.learner_id, c.finks_dimension;
