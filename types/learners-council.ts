// types/learners-council.ts
// Learners Council Module - Type Definitions
// Uses JKKN terminology: Learner (student), Senior Learner (faculty)

// ============================================================
// ENUMS / TYPE ALIASES
// ============================================================

// LC Tier
export type LCTier = 'jkkn_wide' | 'yuva_chapter';

// LC Position Categories
export type LCPositionCategory = 'executive' | 'institution_president' | 'portfolio_head' | 'at_large';

// YUVA Role Types
export type YUVARoleType = 'chapter_chair' | 'chapter_co_chair' | 'stakeholder_chair' | 'stakeholder_co_chair' | 'vertical_chair' | 'vertical_co_chair';

// Vertical Types
export type VerticalType = 'stakeholder' | 'vertical';

// Term Status
export type TermStatus = 'upcoming' | 'active' | 'completed' | 'archived';

// Member Status
export type LCMemberStatus = 'active' | 'inactive' | 'on_leave' | 'graduated' | 'removed';

// Announcement
export type AnnouncementStatus = 'draft' | 'pending_review' | 'published' | 'archived';
export type AnnouncementScope = 'lc_wide' | 'institution' | 'chapter' | 'vertical';
export type AnnouncementUrgency = 'low' | 'normal' | 'high' | 'urgent';
export type AnnouncementType = 'general' | 'event' | 'urgent' | 'circular';

// Poll
export type PollStatus = 'draft' | 'active' | 'paused' | 'closed';
export type PollType = 'yes_no' | 'multiple_choice' | 'survey';
export type PollScope = 'lc_wide' | 'institution' | 'chapter' | 'vertical';

// Forum
export type ForumPostStatus = 'published' | 'pending_review' | 'flagged' | 'hidden' | 'deleted';
export type ForumReactionType = 'like' | 'save' | 'flag';
export type ModerationAction = 'approve' | 'hide' | 'delete' | 'escalate';

// Chat
export type ChatChannelType = 'direct' | 'chapter' | 'vertical' | 'portfolio' | 'executive' | 'custom';

// Event
export type EventStatus = 'draft' | 'pending_review' | 'approved' | 'published' | 'in_progress' | 'completed' | 'cancelled';
export type EventScope = 'campus' | 'inter_campus' | 'institution_wide';
export type EventParticipantStatus = 'registered' | 'confirmed' | 'attended' | 'absent' | 'cancelled';

// OD/Permission
export type ODRequestStatus = 'draft' | 'submitted' | 'in_review' | 'approved' | 'rejected' | 'cancelled' | 'expired';
export type ODApprovalAction = 'approve' | 'reject' | 'request_info' | 'reassign';
export type ApprovalChainType = 'sequential' | 'parallel';

// Selection/Election
export type NominationStatus = 'submitted' | 'eligible' | 'ineligible' | 'shortlisted' | 'selected' | 'rejected' | 'withdrawn';
export type InterviewStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
export type ElectionStatus = 'nominations_open' | 'voting_open' | 'voting_closed' | 'results_declared';
export type ElectionType = 'yuva_selection' | 'lc_progression' | 'executive_rotation';

// Notification
export type NotificationType = 'announcement' | 'event' | 'od_approval' | 'poll' | 'forum' | 'chat' | 'election' | 'issue' | 'system';
export type NotificationChannel = 'in_app' | 'email' | 'push';

// ============================================================
// CORE STRUCTURE INTERFACES
// ============================================================

/** LC Term - tracks governance periods (6-month rotation for executives) */
export interface LCTerm {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: TermStatus;
  term_type: 'annual' | 'executive_rotation';
  description: string | null;
  handover_notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/** LC Position definition */
export interface LCPosition {
  id: string;
  title: string;
  category: LCPositionCategory;
  tier: LCTier;
  institution_id: string | null; // null for JKKN-wide positions
  description: string | null;
  max_holders: number; // usually 1
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** LC Member - links user to position within a term */
export interface LCMember {
  id: string;
  term_id: string;
  position_id: string;
  user_id: string;
  institution_id: string; // member's home institution
  status: LCMemberStatus;
  appointed_at: string;
  ended_at: string | null;
  appointment_notes: string | null;
  created_at: string;
  updated_at: string;

  // Joined
  term?: LCTerm;
  position?: LCPosition;
  user?: { id: string; full_name: string; email: string; avatar_url: string | null };
}

/** Position history - immutable audit trail */
export interface LCPositionHistory {
  id: string;
  position_id: string;
  user_id: string;
  term_id: string;
  started_at: string;
  ended_at: string | null;
  end_reason: string | null;
  created_at: string;

  // Joined
  position?: LCPosition;
  user?: { id: string; full_name: string };
  term?: LCTerm;
}

// ============================================================
// YUVA CHAPTER INTERFACES
// ============================================================

/** YUVA Chapter - one per institution */
export interface YUVAChapter {
  id: string;
  institution_id: string;
  name: string;
  description: string | null;
  academic_year: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;

  // Joined
  institution?: { id: string; name: string };
  members?: YUVAVerticalMember[];
  verticals?: YUVAVertical[];
}

/** YUVA Vertical - CRUD configurable */
export interface YUVAVertical {
  id: string;
  name: string;
  type: VerticalType; // 'stakeholder' (fixed) or 'vertical' (CRUD)
  description: string | null;
  icon: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** YUVA Vertical Member - chair/co-chair assignment */
export interface YUVAVerticalMember {
  id: string;
  chapter_id: string;
  vertical_id: string;
  user_id: string;
  role: YUVARoleType;
  academic_year: string;
  is_active: boolean;
  appointed_at: string;
  ended_at: string | null;
  created_at: string;
  updated_at: string;

  // Joined
  chapter?: YUVAChapter;
  vertical?: YUVAVertical;
  user?: { id: string; full_name: string; email: string; avatar_url: string | null; year_of_study: number | null };
}

// ============================================================
// COMMUNICATION HUB INTERFACES
// ============================================================

/** Announcement */
export interface LCAnnouncement {
  id: string;
  title: string;
  content: string;
  type: AnnouncementType;
  urgency: AnnouncementUrgency;
  status: AnnouncementStatus;
  scope: AnnouncementScope;
  scope_id: string | null; // institution_id, chapter_id, or vertical_id
  created_by: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  published_at: string | null;
  archived_at: string | null;
  read_count: number;
  attachments: { name: string; url: string; type: string }[] | null;
  created_at: string;
  updated_at: string;

  // Joined
  creator?: { id: string; full_name: string; avatar_url: string | null };
  reviewer?: { id: string; full_name: string } | null;
}

/** Announcement Read Tracking */
export interface LCAnnouncementRead {
  id: string;
  announcement_id: string;
  user_id: string;
  read_at: string;
}

/** Poll */
export interface LCPoll {
  id: string;
  title: string;
  description: string | null;
  type: PollType;
  status: PollStatus;
  scope: PollScope;
  scope_id: string | null;
  is_anonymous: boolean;
  allows_multiple: boolean;
  max_selections: number | null;
  starts_at: string;
  ends_at: string;
  created_by: string;
  total_votes: number;
  created_at: string;
  updated_at: string;

  // Joined
  options?: LCPollOption[];
  creator?: { id: string; full_name: string };
}

/** Poll Option */
export interface LCPollOption {
  id: string;
  poll_id: string;
  label: string;
  sort_order: number;
  vote_count: number;
}

/** Poll Vote */
export interface LCPollVote {
  id: string;
  poll_id: string;
  option_id: string;
  user_id: string;
  voted_at: string;
}

/** Forum Topic */
export interface LCForumTopic {
  id: string;
  title: string;
  category: string;
  description: string | null;
  created_by: string;
  is_pinned: boolean;
  is_locked: boolean;
  institution_id?: string;
  scope?: 'institution' | 'lc_wide';
  post_count: number;
  last_post_at: string | null;
  created_at: string;
  updated_at: string;

  // Joined
  creator?: { id: string; full_name: string; avatar_url: string | null };
  latest_post?: LCForumPost | null;
}

/** Forum Post */
export interface LCForumPost {
  id: string;
  topic_id: string;
  parent_id: string | null; // for threaded replies
  content: string;
  author_id: string;
  status: ForumPostStatus;
  moderation_reason: string | null;
  moderated_by: string | null;
  edited_at: string | null;
  created_at: string;
  updated_at: string;

  // Joined
  author?: { id: string; full_name: string; avatar_url: string | null };
  reactions?: LCForumReaction[];
  replies?: LCForumPost[];
  reaction_counts?: { like: number; save: number; flag: number };
}

/** Forum Reaction */
export interface LCForumReaction {
  id: string;
  post_id: string;
  user_id: string;
  type: ForumReactionType;
  created_at: string;
}

/** Chat Channel */
export interface LCChatChannel {
  id: string;
  name: string;
  type: ChatChannelType;
  description: string | null;
  reference_id: string | null; // chapter_id, vertical_id, etc.
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;

  // Joined
  members?: LCChatMember[];
  last_message?: LCChatMessage | null;
  unread_count?: number;
}

/** Chat Member */
export interface LCChatMember {
  id: string;
  channel_id: string;
  user_id: string;
  role: 'admin' | 'member';
  last_read_at: string | null;
  joined_at: string;

  // Joined
  user?: { id: string; full_name: string; avatar_url: string | null };
}

/** Chat Message */
export interface LCChatMessage {
  id: string;
  channel_id: string;
  sender_id: string;
  content: string;
  reply_to_id: string | null;
  attachments: { name: string; url: string; type: string }[] | null;
  is_edited: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;

  // Joined
  sender?: { id: string; full_name: string; avatar_url: string | null };
  reply_to?: LCChatMessage | null;
}

// ============================================================
// EVENT COORDINATION INTERFACES
// ============================================================

/** Event */
export interface LCEvent {
  id: string;
  title: string;
  description: string;
  type: string; // configurable event type
  scope: EventScope;
  status: EventStatus;
  proposed_by: string;
  institution_id: string | null; // null for institution-wide
  venue_resource_id: string | null; // links to Resource Management
  venue_name: string | null;
  starts_at: string;
  ends_at: string;
  max_participants: number | null;
  current_participants: number;
  requires_od: boolean;
  budget_estimate: number | null;
  tags: string[] | null;
  attachments: { name: string; url: string; type: string }[] | null;
  feedback_enabled: boolean;
  post_event_report: string | null;
  created_at: string;
  updated_at: string;

  // Joined
  proposer?: { id: string; full_name: string; avatar_url: string | null };
  participants?: LCEventParticipant[];
  approvals?: LCEventApproval[];
  institution?: { id: string; name: string } | null;
}

/** Event Participant */
export interface LCEventParticipant {
  id: string;
  event_id: string;
  user_id: string;
  status: EventParticipantStatus;
  registered_at: string;
  confirmed_at: string | null;
  attended_at: string | null;
  feedback: string | null;
  feedback_rating: number | null;
  od_request_id: string | null;

  // Joined
  user?: { id: string; full_name: string; email: string; institution_id: string };
  event?: LCEvent;
}

/** Event Approval */
export interface LCEventApproval {
  id: string;
  event_id: string;
  approver_id: string;
  approver_role: string;
  step_order: number;
  action: ODApprovalAction | null;
  comments: string | null;
  acted_at: string | null;
  created_at: string;

  // Joined
  approver?: { id: string; full_name: string; role: string };
}

// ============================================================
// OD / PERMISSION MANAGEMENT INTERFACES
// ============================================================

/** OD Approval Chain Configuration */
export interface LCODApprovalChain {
  id: string;
  institution_id: string;
  name: string;
  event_scope: EventScope;
  steps: ODApprovalStep[];
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/** Single step in approval chain */
export interface ODApprovalStep {
  step_order: number;
  approver_role: string; // e.g., 'yuva_chair', 'class_advisor', 'hod', 'principal', 'md'
  approval_type: ApprovalChainType;
  is_required: boolean;
  auto_approve_after_hours: number | null;
}

/** OD Request */
export interface LCODRequest {
  id: string;
  request_number: string;
  requester_id: string;
  institution_id: string;
  event_id: string | null; // linked event
  chain_id: string; // approval chain used
  reason: string;
  category: string; // rule-based suggested
  start_date: string;
  end_date: string;
  duration_hours: number;
  status: ODRequestStatus;
  current_step: number;
  has_academic_conflict: boolean;
  conflict_details: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;

  // Joined
  requester?: { id: string; full_name: string; email: string; institution_id: string };
  event?: LCEvent | null;
  chain?: LCODApprovalChain;
  approvals?: LCODApproval[];
}

/** Individual OD Approval Action */
export interface LCODApproval {
  id: string;
  request_id: string;
  approver_id: string;
  step_order: number;
  action: ODApprovalAction;
  comments: string | null;
  acted_at: string;
  created_at: string;

  // Joined
  approver?: { id: string; full_name: string; role: string };
}

// ============================================================
// SELECTION & ELECTION INTERFACES
// ============================================================

/** Nomination */
export interface LCNomination {
  id: string;
  election_id: string;
  nominee_id: string;
  position_id: string | null; // LC position or null for YUVA
  vertical_id: string | null; // YUVA vertical or null for LC
  chapter_id: string | null;
  role_sought: YUVARoleType | LCPositionCategory;
  status: NominationStatus;
  statement: string | null; // candidate statement
  qualifications: string | null;
  submitted_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;

  // Joined
  nominee?: { id: string; full_name: string; email: string; avatar_url: string | null; year_of_study: number | null; institution_id: string };
  election?: LCElection;
  interviews?: LCInterview[];
}

/** Interview */
export interface LCInterview {
  id: string;
  nomination_id: string;
  interviewer_id: string;
  scheduled_at: string;
  status: InterviewStatus;
  duration_minutes: number | null;
  score: number | null;
  max_score: number;
  criteria_scores: { criterion: string; score: number; max: number; notes: string }[] | null;
  overall_notes: string | null;
  recommendation: 'strongly_recommend' | 'recommend' | 'neutral' | 'not_recommend' | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;

  // Joined
  interviewer?: { id: string; full_name: string };
  nomination?: LCNomination;
}

/** Election */
export interface LCElection {
  id: string;
  title: string;
  type: ElectionType;
  term_id: string;
  institution_id: string | null; // null for LC-wide
  chapter_id: string | null; // for YUVA selections
  status: ElectionStatus;
  nominations_open_at: string;
  nominations_close_at: string;
  voting_open_at: string | null;
  voting_close_at: string | null;
  results_declared_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;

  // Joined
  nominations?: LCNomination[];
  term?: LCTerm;
}

/** Election Vote (for executive rotation) */
export interface LCElectionVote {
  id: string;
  election_id: string;
  voter_id: string;
  nomination_id: string;
  position_id: string;
  voted_at: string;
}

// ============================================================
// NOTIFICATION INTERFACES
// ============================================================

/** Notification */
export interface LCNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  reference_id: string | null;
  reference_type: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

/** Notification Preferences */
export interface LCNotificationPreference {
  id: string;
  user_id: string;
  notification_type: NotificationType;
  channel_in_app: boolean;
  channel_email: boolean;
  channel_push: boolean;
  updated_at: string;
}

// ============================================================
// CREATE / UPDATE DTOs
// ============================================================

// Term DTOs
export interface CreateLCTermDto {
  name: string;
  start_date: string;
  end_date: string;
  term_type: 'annual' | 'executive_rotation';
  description?: string;
}
export type UpdateLCTermDto = Partial<CreateLCTermDto> & { status?: TermStatus; handover_notes?: string };

// YUVA Vertical DTOs
export interface CreateYUVAVerticalDto {
  name: string;
  type: VerticalType;
  description?: string;
  icon?: string;
  sort_order?: number;
}
export type UpdateYUVAVerticalDto = Partial<CreateYUVAVerticalDto> & { is_active?: boolean };

// Announcement DTOs
export interface CreateAnnouncementDto {
  title: string;
  content: string;
  type: AnnouncementType;
  urgency: AnnouncementUrgency;
  scope: AnnouncementScope;
  scope_id?: string;
  attachments?: { name: string; url: string; type: string }[];
}
export type UpdateAnnouncementDto = Partial<CreateAnnouncementDto> & { status?: AnnouncementStatus };

// Poll DTOs
export interface CreatePollDto {
  title: string;
  description?: string;
  type: PollType;
  scope: PollScope;
  scope_id?: string;
  is_anonymous?: boolean;
  allows_multiple?: boolean;
  max_selections?: number;
  starts_at: string;
  ends_at: string;
  options: { label: string }[];
}

// Forum DTOs
export interface CreateForumTopicDto {
  title: string;
  category: string;
  description?: string;
}
export interface CreateForumPostDto {
  topic_id: string;
  parent_id?: string;
  content: string;
}

// Event DTOs
export interface CreateEventDto {
  title: string;
  description: string;
  type: string;
  scope: EventScope;
  institution_id?: string;
  venue_resource_id?: string;
  venue_name?: string;
  starts_at: string;
  ends_at: string;
  max_participants?: number;
  requires_od?: boolean;
  budget_estimate?: number;
  tags?: string[];
  attachments?: { name: string; url: string; type: string }[];
}
export type UpdateEventDto = Partial<CreateEventDto> & { status?: EventStatus; post_event_report?: string };

// OD Request DTOs
export interface CreateODRequestDto {
  event_id?: string;
  reason: string;
  start_date: string;
  end_date: string;
  duration_hours: number;
  learner_ids?: string[]; // for bulk OD
}

// Nomination DTOs
export interface CreateNominationDto {
  election_id: string;
  position_id?: string;
  vertical_id?: string;
  chapter_id?: string;
  role_sought: string;
  statement?: string;
  qualifications?: string;
}

// Election DTOs
export interface CreateElectionDto {
  title: string;
  type: ElectionType;
  term_id: string;
  institution_id?: string;
  chapter_id?: string;
  nominations_open_at: string;
  nominations_close_at: string;
  voting_open_at?: string;
  voting_close_at?: string;
}

// Chat DTOs
export interface CreateChatChannelDto {
  name: string;
  type: ChatChannelType;
  description?: string;
  reference_id?: string;
  member_ids: string[];
}
export interface SendChatMessageDto {
  channel_id: string;
  content: string;
  reply_to_id?: string;
  attachments?: { name: string; url: string; type: string }[];
}

// OD Approval Chain DTOs
export interface CreateODApprovalChainDto {
  institution_id: string;
  name: string;
  event_scope: EventScope;
  steps: ODApprovalStep[];
}

// ============================================================
// CLASSIFIER INTERFACE (AI-Ready Architecture)
// ============================================================

/** Rule-based classifier, replaceable with AI later */
export interface ClassifierResult {
  category: string;
  priority: string;
  route_to: string;
  confidence: number;
}

export interface IClassifier {
  classify(input: string, context?: Record<string, unknown>): Promise<ClassifierResult>;
}

// ============================================================
// DASHBOARD / AGGREGATION TYPES
// ============================================================

export interface LCDashboardStats {
  announcements: { total: number; unread: number };
  events: { upcoming: number; pending_approval: number; past_month: number };
  od_requests: { pending: number; approved: number; rejected: number };
  polls: { active: number; total_votes_cast: number };
  issues: { open: number; in_progress: number; resolved_this_month: number };
  members: { lc_total: number; yuva_total: number };
}

export interface LCMemberDashboard extends LCDashboardStats {
  my_pending_approvals: number;
  my_assigned_issues: number;
  my_upcoming_events: number;
  my_od_requests: { pending: number; approved: number };
}
