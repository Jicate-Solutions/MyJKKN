-- Migration: Learners Council Module - Complete Schema
-- Date: 2026-02-12
-- Description: Creates all tables for the Learners Council module
--   - LC Structure: terms, positions, members, position history
--   - YUVA Chapters: chapters, verticals, vertical members
--   - Communication Hub: announcements, polls, forums, chat
--   - Event Coordination: events, participants, approvals
--   - OD Management: approval chains, requests, approvals
--   - Selection & Elections: nominations, interviews, elections, votes
--   - Notifications: notifications, preferences

-- ============================================================================
-- HELPER: updated_at trigger function (if not exists)
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 1. LC TERMS
-- ============================================================================
CREATE TABLE IF NOT EXISTS lc_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'active', 'completed', 'archived')),
  term_type VARCHAR(30) NOT NULL CHECK (term_type IN ('annual', 'executive_rotation')),
  description TEXT,
  handover_notes TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT lc_terms_dates_check CHECK (end_date > start_date),
  CONSTRAINT lc_terms_name_check CHECK (char_length(name) >= 1)
);

CREATE TRIGGER lc_terms_updated_at BEFORE UPDATE ON lc_terms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 2. LC POSITIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS lc_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL,
  category VARCHAR(30) NOT NULL CHECK (category IN ('executive', 'institution_president', 'portfolio_head', 'at_large')),
  tier VARCHAR(20) NOT NULL CHECK (tier IN ('jkkn_wide', 'yuva_chapter')),
  institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL,
  description TEXT,
  max_holders INTEGER DEFAULT 1 CHECK (max_holders > 0),
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER lc_positions_updated_at BEFORE UPDATE ON lc_positions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_lc_positions_category ON lc_positions(category);
CREATE INDEX idx_lc_positions_institution ON lc_positions(institution_id) WHERE institution_id IS NOT NULL;

-- ============================================================================
-- 3. LC MEMBERS
-- ============================================================================
CREATE TABLE IF NOT EXISTS lc_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id UUID NOT NULL REFERENCES lc_terms(id) ON DELETE CASCADE,
  position_id UUID NOT NULL REFERENCES lc_positions(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'on_leave', 'graduated', 'removed')),
  appointed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  appointment_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT lc_members_unique_position UNIQUE (term_id, position_id, user_id)
);

CREATE TRIGGER lc_members_updated_at BEFORE UPDATE ON lc_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_lc_members_term ON lc_members(term_id);
CREATE INDEX idx_lc_members_user ON lc_members(user_id);
CREATE INDEX idx_lc_members_institution ON lc_members(institution_id);
CREATE INDEX idx_lc_members_status ON lc_members(status) WHERE status = 'active';

-- ============================================================================
-- 4. LC POSITION HISTORY (immutable audit trail)
-- ============================================================================
CREATE TABLE IF NOT EXISTS lc_position_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID NOT NULL REFERENCES lc_positions(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES lc_terms(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  end_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_lc_position_history_position ON lc_position_history(position_id);
CREATE INDEX idx_lc_position_history_user ON lc_position_history(user_id);

-- ============================================================================
-- 5. YUVA CHAPTERS
-- ============================================================================
CREATE TABLE IF NOT EXISTS yuva_chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  academic_year VARCHAR(20) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT yuva_chapters_unique_institution_year UNIQUE (institution_id, academic_year)
);

CREATE TRIGGER yuva_chapters_updated_at BEFORE UPDATE ON yuva_chapters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_yuva_chapters_institution ON yuva_chapters(institution_id);

-- ============================================================================
-- 6. YUVA VERTICALS (CRUD configurable)
-- ============================================================================
CREATE TABLE IF NOT EXISTS yuva_verticals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('stakeholder', 'vertical')),
  description TEXT,
  icon VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT yuva_verticals_name_unique UNIQUE (name)
);

CREATE TRIGGER yuva_verticals_updated_at BEFORE UPDATE ON yuva_verticals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 7. YUVA VERTICAL MEMBERS
-- ============================================================================
CREATE TABLE IF NOT EXISTS yuva_vertical_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID NOT NULL REFERENCES yuva_chapters(id) ON DELETE CASCADE,
  vertical_id UUID NOT NULL REFERENCES yuva_verticals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role VARCHAR(30) NOT NULL CHECK (role IN ('chapter_chair', 'chapter_co_chair', 'stakeholder_chair', 'stakeholder_co_chair', 'vertical_chair', 'vertical_co_chair')),
  academic_year VARCHAR(20) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  appointed_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT yuva_members_unique_role UNIQUE (chapter_id, vertical_id, user_id, academic_year)
);

CREATE TRIGGER yuva_vertical_members_updated_at BEFORE UPDATE ON yuva_vertical_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_yuva_members_chapter ON yuva_vertical_members(chapter_id);
CREATE INDEX idx_yuva_members_user ON yuva_vertical_members(user_id);
CREATE INDEX idx_yuva_members_vertical ON yuva_vertical_members(vertical_id);

-- ============================================================================
-- 8. LC ANNOUNCEMENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS lc_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(500) NOT NULL,
  content TEXT NOT NULL,
  type VARCHAR(20) DEFAULT 'general' CHECK (type IN ('general', 'event', 'urgent', 'circular')),
  urgency VARCHAR(20) DEFAULT 'normal' CHECK (urgency IN ('low', 'normal', 'high', 'urgent')),
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'published', 'archived')),
  scope VARCHAR(20) NOT NULL CHECK (scope IN ('lc_wide', 'institution', 'chapter', 'vertical')),
  scope_id UUID, -- institution_id, chapter_id, or vertical_id depending on scope
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  read_count INTEGER DEFAULT 0,
  attachments JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER lc_announcements_updated_at BEFORE UPDATE ON lc_announcements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_lc_announcements_status ON lc_announcements(status);
CREATE INDEX idx_lc_announcements_scope ON lc_announcements(scope, scope_id);
CREATE INDEX idx_lc_announcements_created_by ON lc_announcements(created_by);
CREATE INDEX idx_lc_announcements_published ON lc_announcements(published_at DESC) WHERE status = 'published';

-- ============================================================================
-- 9. LC ANNOUNCEMENT READS
-- ============================================================================
CREATE TABLE IF NOT EXISTS lc_announcement_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES lc_announcements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT lc_announcement_reads_unique UNIQUE (announcement_id, user_id)
);

CREATE INDEX idx_lc_announcement_reads_announcement ON lc_announcement_reads(announcement_id);

-- ============================================================================
-- 10. LC POLLS
-- ============================================================================
CREATE TABLE IF NOT EXISTS lc_polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  type VARCHAR(20) NOT NULL CHECK (type IN ('yes_no', 'multiple_choice', 'survey')),
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'closed')),
  scope VARCHAR(20) NOT NULL CHECK (scope IN ('lc_wide', 'institution', 'chapter', 'vertical')),
  scope_id UUID,
  is_anonymous BOOLEAN DEFAULT false,
  allows_multiple BOOLEAN DEFAULT false,
  max_selections INTEGER,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  total_votes INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT lc_polls_dates_check CHECK (ends_at > starts_at)
);

CREATE TRIGGER lc_polls_updated_at BEFORE UPDATE ON lc_polls
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_lc_polls_status ON lc_polls(status);
CREATE INDEX idx_lc_polls_scope ON lc_polls(scope, scope_id);

-- ============================================================================
-- 11. LC POLL OPTIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS lc_poll_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES lc_polls(id) ON DELETE CASCADE,
  label VARCHAR(500) NOT NULL,
  sort_order INTEGER DEFAULT 0,
  vote_count INTEGER DEFAULT 0
);

CREATE INDEX idx_lc_poll_options_poll ON lc_poll_options(poll_id);

-- ============================================================================
-- 12. LC POLL VOTES
-- ============================================================================
CREATE TABLE IF NOT EXISTS lc_poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES lc_polls(id) ON DELETE CASCADE,
  option_id UUID NOT NULL REFERENCES lc_poll_options(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  voted_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT lc_poll_votes_unique UNIQUE (poll_id, user_id, option_id)
);

CREATE INDEX idx_lc_poll_votes_poll ON lc_poll_votes(poll_id);
CREATE INDEX idx_lc_poll_votes_user ON lc_poll_votes(user_id);

-- ============================================================================
-- 13. LC FORUM TOPICS
-- ============================================================================
CREATE TABLE IF NOT EXISTS lc_forum_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(500) NOT NULL,
  category VARCHAR(100) NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  is_pinned BOOLEAN DEFAULT false,
  is_locked BOOLEAN DEFAULT false,
  post_count INTEGER DEFAULT 0,
  last_post_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER lc_forum_topics_updated_at BEFORE UPDATE ON lc_forum_topics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_lc_forum_topics_category ON lc_forum_topics(category);
CREATE INDEX idx_lc_forum_topics_pinned ON lc_forum_topics(is_pinned) WHERE is_pinned = true;

-- ============================================================================
-- 14. LC FORUM POSTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS lc_forum_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES lc_forum_topics(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES lc_forum_posts(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  status VARCHAR(20) DEFAULT 'published' CHECK (status IN ('pending_review', 'published', 'flagged', 'hidden', 'deleted')),
  moderation_reason TEXT,
  moderated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER lc_forum_posts_updated_at BEFORE UPDATE ON lc_forum_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_lc_forum_posts_topic ON lc_forum_posts(topic_id);
CREATE INDEX idx_lc_forum_posts_parent ON lc_forum_posts(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX idx_lc_forum_posts_author ON lc_forum_posts(author_id);

-- ============================================================================
-- 15. LC FORUM REACTIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS lc_forum_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES lc_forum_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type VARCHAR(10) NOT NULL CHECK (type IN ('like', 'save', 'flag')),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT lc_forum_reactions_unique UNIQUE (post_id, user_id, type)
);

CREATE INDEX idx_lc_forum_reactions_post ON lc_forum_reactions(post_id);

-- ============================================================================
-- 16. LC CHAT CHANNELS
-- ============================================================================
CREATE TABLE IF NOT EXISTS lc_chat_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('direct', 'chapter', 'vertical', 'portfolio', 'executive', 'custom')),
  description TEXT,
  reference_id UUID, -- chapter_id, vertical_id, etc.
  is_active BOOLEAN DEFAULT true,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER lc_chat_channels_updated_at BEFORE UPDATE ON lc_chat_channels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_lc_chat_channels_type ON lc_chat_channels(type);

-- ============================================================================
-- 17. LC CHAT MEMBERS
-- ============================================================================
CREATE TABLE IF NOT EXISTS lc_chat_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES lc_chat_channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role VARCHAR(10) DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  last_read_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT lc_chat_members_unique UNIQUE (channel_id, user_id)
);

CREATE INDEX idx_lc_chat_members_channel ON lc_chat_members(channel_id);
CREATE INDEX idx_lc_chat_members_user ON lc_chat_members(user_id);

-- ============================================================================
-- 18. LC CHAT MESSAGES
-- ============================================================================
CREATE TABLE IF NOT EXISTS lc_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES lc_chat_channels(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  content TEXT NOT NULL,
  reply_to_id UUID REFERENCES lc_chat_messages(id) ON DELETE SET NULL,
  attachments JSONB DEFAULT '[]',
  is_edited BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER lc_chat_messages_updated_at BEFORE UPDATE ON lc_chat_messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_lc_chat_messages_channel ON lc_chat_messages(channel_id, created_at DESC);
CREATE INDEX idx_lc_chat_messages_sender ON lc_chat_messages(sender_id);

-- ============================================================================
-- 19. LC EVENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS lc_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(500) NOT NULL,
  description TEXT NOT NULL,
  type VARCHAR(100) DEFAULT 'general',
  scope VARCHAR(30) NOT NULL CHECK (scope IN ('campus', 'inter_campus', 'institution_wide')),
  status VARCHAR(30) DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'approved', 'published', 'in_progress', 'completed', 'cancelled')),
  proposed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL,
  venue_resource_id UUID, -- references resources table
  venue_name VARCHAR(300),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  max_participants INTEGER,
  current_participants INTEGER DEFAULT 0,
  requires_od BOOLEAN DEFAULT false,
  budget_estimate NUMERIC(12, 2),
  tags JSONB DEFAULT '[]',
  attachments JSONB DEFAULT '[]',
  feedback_enabled BOOLEAN DEFAULT true,
  post_event_report TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT lc_events_dates_check CHECK (ends_at > starts_at),
  CONSTRAINT lc_events_participants_check CHECK (max_participants IS NULL OR max_participants > 0)
);

CREATE TRIGGER lc_events_updated_at BEFORE UPDATE ON lc_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_lc_events_status ON lc_events(status);
CREATE INDEX idx_lc_events_institution ON lc_events(institution_id);
CREATE INDEX idx_lc_events_proposed_by ON lc_events(proposed_by);
CREATE INDEX idx_lc_events_starts_at ON lc_events(starts_at);
CREATE INDEX idx_lc_events_scope ON lc_events(scope);

-- ============================================================================
-- 20. LC EVENT PARTICIPANTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS lc_event_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES lc_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'registered' CHECK (status IN ('registered', 'confirmed', 'attended', 'absent', 'cancelled')),
  registered_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  attended_at TIMESTAMPTZ,
  feedback TEXT,
  feedback_rating INTEGER CHECK (feedback_rating IS NULL OR (feedback_rating >= 1 AND feedback_rating <= 5)),
  od_request_id UUID, -- linked OD request

  CONSTRAINT lc_event_participants_unique UNIQUE (event_id, user_id)
);

CREATE INDEX idx_lc_event_participants_event ON lc_event_participants(event_id);
CREATE INDEX idx_lc_event_participants_user ON lc_event_participants(user_id);

-- ============================================================================
-- 21. LC EVENT APPROVALS
-- ============================================================================
CREATE TABLE IF NOT EXISTS lc_event_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES lc_events(id) ON DELETE CASCADE,
  approver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  approver_role VARCHAR(100) NOT NULL,
  step_order INTEGER DEFAULT 1,
  action VARCHAR(20) CHECK (action IS NULL OR action IN ('approve', 'reject', 'request_info', 'reassign')),
  comments TEXT,
  acted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_lc_event_approvals_event ON lc_event_approvals(event_id);
CREATE INDEX idx_lc_event_approvals_approver ON lc_event_approvals(approver_id);

-- ============================================================================
-- 22. LC OD APPROVAL CHAINS (configurable per institution)
-- ============================================================================
CREATE TABLE IF NOT EXISTS lc_od_approval_chains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  event_scope VARCHAR(30) NOT NULL CHECK (event_scope IN ('campus', 'inter_campus', 'institution_wide')),
  steps JSONB NOT NULL DEFAULT '[]', -- array of ODApprovalStep objects
  is_active BOOLEAN DEFAULT true,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT lc_od_chains_unique_name UNIQUE (institution_id, name)
);

CREATE TRIGGER lc_od_approval_chains_updated_at BEFORE UPDATE ON lc_od_approval_chains
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_lc_od_chains_institution ON lc_od_approval_chains(institution_id);

-- ============================================================================
-- 23. LC OD REQUESTS
-- ============================================================================
CREATE SEQUENCE IF NOT EXISTS lc_od_request_seq START 1;

CREATE TABLE IF NOT EXISTS lc_od_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number VARCHAR(30) NOT NULL UNIQUE,
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  event_id UUID REFERENCES lc_events(id) ON DELETE SET NULL,
  chain_id UUID NOT NULL REFERENCES lc_od_approval_chains(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  category VARCHAR(100),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  duration_hours NUMERIC(5, 1) NOT NULL CHECK (duration_hours > 0),
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'in_review', 'approved', 'rejected', 'cancelled', 'expired')),
  current_step INTEGER DEFAULT 0,
  has_academic_conflict BOOLEAN DEFAULT false,
  conflict_details TEXT,
  submitted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT lc_od_requests_dates_check CHECK (end_date >= start_date)
);

CREATE TRIGGER lc_od_requests_updated_at BEFORE UPDATE ON lc_od_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_lc_od_requests_requester ON lc_od_requests(requester_id);
CREATE INDEX idx_lc_od_requests_institution ON lc_od_requests(institution_id);
CREATE INDEX idx_lc_od_requests_status ON lc_od_requests(status);
CREATE INDEX idx_lc_od_requests_event ON lc_od_requests(event_id) WHERE event_id IS NOT NULL;

-- ============================================================================
-- 24. LC OD APPROVALS (individual approval actions)
-- ============================================================================
CREATE TABLE IF NOT EXISTS lc_od_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES lc_od_requests(id) ON DELETE CASCADE,
  approver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  step_order INTEGER NOT NULL,
  action VARCHAR(20) NOT NULL CHECK (action IN ('approve', 'reject', 'request_info', 'reassign')),
  comments TEXT,
  acted_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_lc_od_approvals_request ON lc_od_approvals(request_id);
CREATE INDEX idx_lc_od_approvals_approver ON lc_od_approvals(approver_id);

-- ============================================================================
-- 25. LC ELECTIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS lc_elections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(500) NOT NULL,
  type VARCHAR(30) NOT NULL CHECK (type IN ('yuva_selection', 'lc_progression', 'executive_rotation')),
  term_id UUID NOT NULL REFERENCES lc_terms(id) ON DELETE CASCADE,
  institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL,
  chapter_id UUID REFERENCES yuva_chapters(id) ON DELETE SET NULL,
  status VARCHAR(30) DEFAULT 'nominations_open' CHECK (status IN ('nominations_open', 'voting_open', 'voting_closed', 'results_declared')),
  nominations_open_at TIMESTAMPTZ NOT NULL,
  nominations_close_at TIMESTAMPTZ NOT NULL,
  voting_open_at TIMESTAMPTZ,
  voting_close_at TIMESTAMPTZ,
  results_declared_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT lc_elections_nominations_check CHECK (nominations_close_at > nominations_open_at)
);

CREATE TRIGGER lc_elections_updated_at BEFORE UPDATE ON lc_elections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_lc_elections_term ON lc_elections(term_id);
CREATE INDEX idx_lc_elections_status ON lc_elections(status);
CREATE INDEX idx_lc_elections_type ON lc_elections(type);

-- ============================================================================
-- 26. LC NOMINATIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS lc_nominations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id UUID NOT NULL REFERENCES lc_elections(id) ON DELETE CASCADE,
  nominee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  position_id UUID REFERENCES lc_positions(id) ON DELETE SET NULL,
  vertical_id UUID REFERENCES yuva_verticals(id) ON DELETE SET NULL,
  chapter_id UUID REFERENCES yuva_chapters(id) ON DELETE SET NULL,
  role_sought VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'submitted' CHECK (status IN ('submitted', 'eligible', 'ineligible', 'shortlisted', 'selected', 'rejected', 'withdrawn')),
  statement TEXT,
  qualifications TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT lc_nominations_unique UNIQUE (election_id, nominee_id, role_sought)
);

CREATE TRIGGER lc_nominations_updated_at BEFORE UPDATE ON lc_nominations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_lc_nominations_election ON lc_nominations(election_id);
CREATE INDEX idx_lc_nominations_nominee ON lc_nominations(nominee_id);
CREATE INDEX idx_lc_nominations_status ON lc_nominations(status);

-- ============================================================================
-- 27. LC INTERVIEWS
-- ============================================================================
CREATE TABLE IF NOT EXISTS lc_interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nomination_id UUID NOT NULL REFERENCES lc_nominations(id) ON DELETE CASCADE,
  interviewer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled', 'no_show')),
  duration_minutes INTEGER,
  score NUMERIC(5, 2),
  max_score NUMERIC(5, 2) DEFAULT 100,
  criteria_scores JSONB, -- array of { criterion, score, max, notes }
  overall_notes TEXT,
  recommendation VARCHAR(20) CHECK (recommendation IS NULL OR recommendation IN ('strongly_recommend', 'recommend', 'neutral', 'not_recommend')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER lc_interviews_updated_at BEFORE UPDATE ON lc_interviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_lc_interviews_nomination ON lc_interviews(nomination_id);
CREATE INDEX idx_lc_interviews_interviewer ON lc_interviews(interviewer_id);
CREATE INDEX idx_lc_interviews_status ON lc_interviews(status);

-- ============================================================================
-- 28. LC ELECTION VOTES
-- ============================================================================
CREATE TABLE IF NOT EXISTS lc_election_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id UUID NOT NULL REFERENCES lc_elections(id) ON DELETE CASCADE,
  voter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nomination_id UUID NOT NULL REFERENCES lc_nominations(id) ON DELETE CASCADE,
  position_id UUID NOT NULL REFERENCES lc_positions(id) ON DELETE RESTRICT,
  voted_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT lc_election_votes_unique UNIQUE (election_id, voter_id, position_id)
);

CREATE INDEX idx_lc_election_votes_election ON lc_election_votes(election_id);
CREATE INDEX idx_lc_election_votes_nomination ON lc_election_votes(nomination_id);

-- ============================================================================
-- 29. LC NOTIFICATIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS lc_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL CHECK (type IN ('announcement', 'event', 'od_approval', 'poll', 'forum', 'chat', 'election', 'issue', 'system')),
  title VARCHAR(500) NOT NULL,
  message TEXT NOT NULL,
  link VARCHAR(500),
  reference_id UUID,
  reference_type VARCHAR(50),
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_lc_notifications_user ON lc_notifications(user_id);
CREATE INDEX idx_lc_notifications_unread ON lc_notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX idx_lc_notifications_created ON lc_notifications(created_at DESC);

-- ============================================================================
-- 30. LC NOTIFICATION PREFERENCES
-- ============================================================================
CREATE TABLE IF NOT EXISTS lc_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type VARCHAR(30) NOT NULL CHECK (notification_type IN ('announcement', 'event', 'od_approval', 'poll', 'forum', 'chat', 'election', 'issue', 'system')),
  channel_in_app BOOLEAN DEFAULT true,
  channel_email BOOLEAN DEFAULT false,
  channel_push BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT lc_notification_prefs_unique UNIQUE (user_id, notification_type)
);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Enable RLS on all LC tables
ALTER TABLE lc_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE lc_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lc_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE lc_position_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE yuva_chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE yuva_verticals ENABLE ROW LEVEL SECURITY;
ALTER TABLE yuva_vertical_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE lc_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE lc_announcement_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lc_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE lc_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE lc_poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE lc_forum_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE lc_forum_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE lc_forum_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lc_chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE lc_chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE lc_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE lc_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE lc_event_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE lc_event_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE lc_od_approval_chains ENABLE ROW LEVEL SECURITY;
ALTER TABLE lc_od_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE lc_od_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE lc_elections ENABLE ROW LEVEL SECURITY;
ALTER TABLE lc_nominations ENABLE ROW LEVEL SECURITY;
ALTER TABLE lc_interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE lc_election_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE lc_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE lc_notification_preferences ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------
-- RLS: Authenticated users can view all LC structure
-- -----------------------------------------------
CREATE POLICY "lc_terms_select_authenticated" ON lc_terms
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "lc_positions_select_authenticated" ON lc_positions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "lc_members_select_authenticated" ON lc_members
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "lc_position_history_select_authenticated" ON lc_position_history
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "yuva_chapters_select_authenticated" ON yuva_chapters
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "yuva_verticals_select_authenticated" ON yuva_verticals
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "yuva_vertical_members_select_authenticated" ON yuva_vertical_members
  FOR SELECT TO authenticated USING (true);

-- -----------------------------------------------
-- RLS: Announcements visible when published or own drafts
-- -----------------------------------------------
CREATE POLICY "lc_announcements_select" ON lc_announcements
  FOR SELECT TO authenticated
  USING (status = 'published' OR created_by = auth.uid());

CREATE POLICY "lc_announcements_insert" ON lc_announcements
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "lc_announcements_update" ON lc_announcements
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR EXISTS (
    SELECT 1 FROM lc_members WHERE user_id = auth.uid() AND status = 'active'
  ));

-- -----------------------------------------------
-- RLS: Announcement reads - own records
-- -----------------------------------------------
CREATE POLICY "lc_announcement_reads_select" ON lc_announcement_reads
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "lc_announcement_reads_insert" ON lc_announcement_reads
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- -----------------------------------------------
-- RLS: Polls - visible when active/closed, or own drafts
-- -----------------------------------------------
CREATE POLICY "lc_polls_select" ON lc_polls
  FOR SELECT TO authenticated
  USING (status IN ('active', 'closed') OR created_by = auth.uid());

CREATE POLICY "lc_polls_insert" ON lc_polls
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

CREATE POLICY "lc_poll_options_select" ON lc_poll_options
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "lc_poll_options_insert" ON lc_poll_options
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "lc_poll_votes_select" ON lc_poll_votes
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "lc_poll_votes_insert" ON lc_poll_votes
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- -----------------------------------------------
-- RLS: Forums - public read, auth write
-- -----------------------------------------------
CREATE POLICY "lc_forum_topics_select" ON lc_forum_topics
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "lc_forum_topics_insert" ON lc_forum_topics
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

CREATE POLICY "lc_forum_posts_select" ON lc_forum_posts
  FOR SELECT TO authenticated USING (status != 'deleted');

CREATE POLICY "lc_forum_posts_insert" ON lc_forum_posts
  FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());

CREATE POLICY "lc_forum_posts_update" ON lc_forum_posts
  FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR EXISTS (
    SELECT 1 FROM lc_members WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "lc_forum_reactions_select" ON lc_forum_reactions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "lc_forum_reactions_insert" ON lc_forum_reactions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "lc_forum_reactions_delete" ON lc_forum_reactions
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- -----------------------------------------------
-- RLS: Chat - members only
-- -----------------------------------------------
CREATE POLICY "lc_chat_channels_select" ON lc_chat_channels
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM lc_chat_members WHERE channel_id = lc_chat_channels.id AND user_id = auth.uid()
  ));

CREATE POLICY "lc_chat_channels_insert" ON lc_chat_channels
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

CREATE POLICY "lc_chat_members_select" ON lc_chat_members
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM lc_chat_members cm WHERE cm.channel_id = lc_chat_members.channel_id AND cm.user_id = auth.uid()
  ));

CREATE POLICY "lc_chat_members_insert" ON lc_chat_members
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "lc_chat_messages_select" ON lc_chat_messages
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM lc_chat_members WHERE channel_id = lc_chat_messages.channel_id AND user_id = auth.uid()
  ));

CREATE POLICY "lc_chat_messages_insert" ON lc_chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND EXISTS (
    SELECT 1 FROM lc_chat_members WHERE channel_id = lc_chat_messages.channel_id AND user_id = auth.uid()
  ));

CREATE POLICY "lc_chat_messages_update" ON lc_chat_messages
  FOR UPDATE TO authenticated USING (sender_id = auth.uid());

-- -----------------------------------------------
-- RLS: Events - public read, auth create
-- -----------------------------------------------
CREATE POLICY "lc_events_select" ON lc_events
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "lc_events_insert" ON lc_events
  FOR INSERT TO authenticated WITH CHECK (proposed_by = auth.uid());

CREATE POLICY "lc_events_update" ON lc_events
  FOR UPDATE TO authenticated
  USING (proposed_by = auth.uid() OR EXISTS (
    SELECT 1 FROM lc_members WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "lc_event_participants_select" ON lc_event_participants
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "lc_event_participants_insert" ON lc_event_participants
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "lc_event_participants_update" ON lc_event_participants
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM lc_members WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "lc_event_approvals_select" ON lc_event_approvals
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "lc_event_approvals_insert" ON lc_event_approvals
  FOR INSERT TO authenticated WITH CHECK (approver_id = auth.uid());

CREATE POLICY "lc_event_approvals_update" ON lc_event_approvals
  FOR UPDATE TO authenticated USING (approver_id = auth.uid());

-- -----------------------------------------------
-- RLS: OD Management
-- -----------------------------------------------
CREATE POLICY "lc_od_chains_select" ON lc_od_approval_chains
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "lc_od_chains_insert" ON lc_od_approval_chains
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

CREATE POLICY "lc_od_chains_update" ON lc_od_approval_chains
  FOR UPDATE TO authenticated USING (created_by = auth.uid());

CREATE POLICY "lc_od_requests_select" ON lc_od_requests
  FOR SELECT TO authenticated
  USING (requester_id = auth.uid() OR EXISTS (
    SELECT 1 FROM lc_members WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "lc_od_requests_insert" ON lc_od_requests
  FOR INSERT TO authenticated WITH CHECK (requester_id = auth.uid());

CREATE POLICY "lc_od_requests_update" ON lc_od_requests
  FOR UPDATE TO authenticated
  USING (requester_id = auth.uid() OR EXISTS (
    SELECT 1 FROM lc_members WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "lc_od_approvals_select" ON lc_od_approvals
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "lc_od_approvals_insert" ON lc_od_approvals
  FOR INSERT TO authenticated WITH CHECK (approver_id = auth.uid());

-- -----------------------------------------------
-- RLS: Elections & Nominations
-- -----------------------------------------------
CREATE POLICY "lc_elections_select" ON lc_elections
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "lc_elections_insert" ON lc_elections
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

CREATE POLICY "lc_elections_update" ON lc_elections
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR EXISTS (
    SELECT 1 FROM lc_members WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "lc_nominations_select" ON lc_nominations
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "lc_nominations_insert" ON lc_nominations
  FOR INSERT TO authenticated WITH CHECK (nominee_id = auth.uid());

CREATE POLICY "lc_nominations_update" ON lc_nominations
  FOR UPDATE TO authenticated
  USING (nominee_id = auth.uid() OR EXISTS (
    SELECT 1 FROM lc_members WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "lc_interviews_select" ON lc_interviews
  FOR SELECT TO authenticated
  USING (interviewer_id = auth.uid() OR EXISTS (
    SELECT 1 FROM lc_nominations n WHERE n.id = lc_interviews.nomination_id AND n.nominee_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM lc_members WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "lc_interviews_insert" ON lc_interviews
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "lc_interviews_update" ON lc_interviews
  FOR UPDATE TO authenticated USING (interviewer_id = auth.uid());

CREATE POLICY "lc_election_votes_select" ON lc_election_votes
  FOR SELECT TO authenticated USING (voter_id = auth.uid());

CREATE POLICY "lc_election_votes_insert" ON lc_election_votes
  FOR INSERT TO authenticated WITH CHECK (voter_id = auth.uid());

-- -----------------------------------------------
-- RLS: Notifications - own only
-- -----------------------------------------------
CREATE POLICY "lc_notifications_select" ON lc_notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "lc_notifications_update" ON lc_notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "lc_notification_prefs_select" ON lc_notification_preferences
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "lc_notification_prefs_insert" ON lc_notification_preferences
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "lc_notification_prefs_update" ON lc_notification_preferences
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- -----------------------------------------------
-- RLS: Admin write policies for structure tables
-- -----------------------------------------------
CREATE POLICY "lc_terms_insert_admin" ON lc_terms
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "lc_terms_update_admin" ON lc_terms
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "lc_positions_insert_admin" ON lc_positions
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "lc_positions_update_admin" ON lc_positions
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "lc_members_insert_admin" ON lc_members
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "lc_members_update_admin" ON lc_members
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "lc_position_history_insert" ON lc_position_history
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "yuva_chapters_insert_admin" ON yuva_chapters
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "yuva_chapters_update_admin" ON yuva_chapters
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "yuva_verticals_insert_admin" ON yuva_verticals
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "yuva_verticals_update_admin" ON yuva_verticals
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "yuva_vertical_members_insert_admin" ON yuva_vertical_members
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "yuva_vertical_members_update_admin" ON yuva_vertical_members
  FOR UPDATE TO authenticated USING (true);

-- ============================================================================
-- ENABLE REALTIME for chat tables
-- ============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE lc_chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE lc_chat_members;
ALTER PUBLICATION supabase_realtime ADD TABLE lc_notifications;

-- ============================================================================
-- SEED: Default YUVA Verticals
-- ============================================================================
INSERT INTO yuva_verticals (name, type, sort_order) VALUES
  ('Membership', 'stakeholder', 1),
  ('Thalir', 'stakeholder', 2),
  ('Rural Initiatives', 'stakeholder', 3),
  ('Accessibility', 'vertical', 4),
  ('Climate Change', 'vertical', 5),
  ('Entrepreneurship', 'vertical', 6),
  ('Health', 'vertical', 7),
  ('Innovation', 'vertical', 8),
  ('Learning', 'vertical', 9),
  ('Masoom', 'vertical', 10),
  ('Road Safety', 'vertical', 11),
  ('Branding', 'vertical', 12),
  ('Varnam', 'vertical', 13),
  ('Vizha', 'vertical', 14),
  ('Sports', 'vertical', 15)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- SEED: Default LC Positions
-- ============================================================================
INSERT INTO lc_positions (title, category, tier, sort_order) VALUES
  ('Learners General President', 'executive', 'jkkn_wide', 1),
  ('Learners General Vice President', 'executive', 'jkkn_wide', 2),
  ('Learners General Secretary', 'executive', 'jkkn_wide', 3),
  ('Academics & Research Head', 'portfolio_head', 'jkkn_wide', 10),
  ('Sports & Culturals Head', 'portfolio_head', 'jkkn_wide', 11),
  ('Campus Welfare & Facilities Head', 'portfolio_head', 'jkkn_wide', 12),
  ('Hostel & Food Services Head', 'portfolio_head', 'jkkn_wide', 13),
  ('Training & Placements Head', 'portfolio_head', 'jkkn_wide', 14),
  ('Extension Activities & Industry Relations Head', 'portfolio_head', 'jkkn_wide', 15),
  ('Digital Governance & MyJKKN Head', 'portfolio_head', 'jkkn_wide', 16),
  ('Grievance Redressal & Mediation Head', 'portfolio_head', 'jkkn_wide', 17),
  ('Sustainability & Social Responsibility Head', 'portfolio_head', 'jkkn_wide', 18)
ON CONFLICT DO NOTHING;

-- Institution President positions will be created dynamically when institutions are configured
-- At-Large Representative positions will be created dynamically per term
