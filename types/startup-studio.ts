// types/startup-studio.ts
// Startup Studio Module Types

// -- Enums --

export type EventStatus = 'draft' | 'registration_open' | 'registration_closed' | 'build_day' | 'demo_day' | 'closed';
export type RegistrationStatus = 'registered' | 'checked_in' | 'disqualified';
export type StaffRole = 'mentor' | 'lead_mentor' | 'judge' | 'panel_chair' | 'evaluator';
export type DayType = 'build_day' | 'demo_day';
export type ChecklistPhase = 'pre_event' | 'on_day' | 'build_day' | 'demo_day' | 'post_event';
export type ChecklistTargetRole = 'admin' | 'mentor' | 'team';

// -- Config (stored in startup_events.config JSONB) --

export interface EventConfig {
  team_max_size: number;
  categories: string[];
  tools: string[];
  scoring_type: string;
  tier_points: Record<number, number>;
  mrr_bonus_brackets: Array<{ min: number; max: number | null; points: number }>;
}

// -- Core Entities --

export interface StartupEvent {
  id: string;
  name: string;
  description: string | null;
  host_institution_id: string | null;
  status: EventStatus;
  start_date: string | null;
  end_date: string | null;
  demo_date: string | null;
  registration_deadline: string | null;
  submission_deadline: string | null;
  metrics_deadline: string | null;
  is_results_published: boolean;
  metrics_frozen_at: string | null;      // ISO timestamp when admin froze metrics
  results_published_at: string | null;   // ISO timestamp when results were published
  config: EventConfig;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Relations
  host_institution?: any;
  creator?: any;
}

export interface EventRegistration {
  id: string;
  event_id: string;
  team_name: string;
  team_code: string | null;
  problem_idea: string;
  owner_id: string;
  institution_id: string;
  checked_in: boolean;
  checked_in_at: string | null;
  checked_in_by: string | null;
  status: RegistrationStatus;
  created_at: string;
  updated_at: string;
  // Relations
  owner?: any;
  institution?: any;
  team_members?: EventTeamMember[];
  venue_allocations?: EventTeamVenueAllocation[];
  submission?: EventSubmission;
}

export type TeamMemberStatus = 'pending' | 'accepted' | 'declined' | 'removed';

export interface EventTeamMember {
  id: string;
  registration_id: string;
  profile_id: string | null;
  learner_id: string | null;
  email: string;
  full_name: string | null;
  student_id: string | null;
  has_laptop: boolean;
  is_leader: boolean;
  status: TeamMemberStatus;
  added_at: string;
  responded_at: string | null;
  profile?: any;
  learner?: any;
}

export interface EventVenueAssignment {
  id: string;
  event_id: string;
  resource_id: string | null;
  manual_name: string | null;
  manual_building: string | null;
  manual_room: string | null;
  capacity_override: number | null;
  day_type: DayType;
  institution_id: string;
  created_at: string;
  resource?: any;
  institution?: any;
  staff_assignments?: EventStaffAssignment[];
  team_allocations?: EventTeamVenueAllocation[];
}

export interface EventTeamVenueAllocation {
  id: string;
  event_id: string;
  registration_id: string;
  venue_assignment_id: string;
  day_type: DayType;
  allocated_at: string;
  allocated_by: string | null;
  venue_assignment?: EventVenueAssignment;
  registration?: EventRegistration;
}

export interface EventStaffAssignment {
  id: string;
  event_id: string;
  venue_assignment_id: string;
  staff_id: string;
  role: StaffRole;
  day_type: DayType;
  created_at: string;
  staff?: any;
  venue_assignment?: EventVenueAssignment;
}

export interface EventDemoSlot {
  id: string;
  event_id: string;
  venue_assignment_id: string;
  registration_id: string | null;
  start_time: string | null;
  duration_minutes: number;
  room_label: string | null;
  slot_order: number | null;
  created_at: string;
  registration?: EventRegistration;
  venue_assignment?: EventVenueAssignment;
}

export interface EventSubmission {
  id: string;
  event_id: string;
  registration_id: string;
  app_name: string | null;
  github_url: string | null;
  live_app_url: string | null;
  lovable_url: string | null;
  demo_video_url: string | null;
  description: string | null;
  problem_statement: string | null;
  solution_summary: string | null;
  elevator_pitch: string | null;
  category: string | null;
  mrr_amount: number;
  paying_users_count: number;
  user_count: number;
  active_users_count: number;
  proof_urls: string[];
  mrr_verified: boolean;
  mrr_verified_at: string | null;
  mrr_verified_by: string | null;
  mrr_rejected_reason: string | null;
  tier_level: number;
  tier_points: number;
  mrr_bonus_points: number;
  total_score: number;
  submitted_at: string | null;
  submitted_by: string | null;
  metrics_updated_at: string | null;
  created_at: string;
  updated_at: string;
  registration?: EventRegistration;
}

export interface EventChecklist {
  id: string;
  event_id: string;
  title: string;
  phase: ChecklistPhase;
  target_role: ChecklistTargetRole;
  order_index: number;
  items?: EventChecklistItem[];
}

export interface EventChecklistItem {
  id: string;
  checklist_id: string;
  title: string;
  description: string | null;
  order_index: number;
  is_required: boolean;
  completion?: EventChecklistCompletion;
}

export interface EventChecklistCompletion {
  id: string;
  checklist_item_id: string;
  completed_by: string;
  registration_id: string | null;
  staff_assignment_id: string | null;
  completed_at: string;
}

// -- DTOs --

export interface CreateEventDto {
  name: string;
  description?: string;
  host_institution_id?: string;
  start_date?: string;
  end_date?: string;
  demo_date?: string;
  registration_deadline?: string;
  submission_deadline?: string;
  metrics_deadline?: string;
  config?: Partial<EventConfig>;
}

export interface UpdateEventDto extends Partial<CreateEventDto> {
  status?: EventStatus;
  is_results_published?: boolean;
}

export interface CreateRegistrationDto {
  event_id: string;
  team_name: string;
  problem_idea?: string;
  institution_id?: string;
  members: CreateTeamMemberDto[];
}

export interface CreateTeamMemberDto {
  learner_id: string;          // learners_profiles.id
  profile_id?: string | null;  // profiles.id (resolved from learner_id)
  email: string;
  full_name?: string;
  student_id?: string;         // roll_number from learners_profiles
  has_laptop?: boolean;
}

export interface CreateVenueDto {
  event_id: string;
  day_type: DayType;
  institution_id: string;
  resource_id?: string;
  manual_name?: string;
  manual_building?: string;
  manual_room?: string;
  capacity_override?: number;
}

export interface UpdateVenueDto {
  institution_id?: string;
  manual_name?: string;
  manual_building?: string;
  manual_room?: string;
  capacity_override?: number | null;
}

export interface SubmitProjectDto {
  event_id: string;
  registration_id: string;
  app_name: string;
  problem_statement: string;
  solution_summary: string;
  github_url: string;
  live_app_url?: string;
  lovable_url?: string;
  demo_video_url?: string;
  elevator_pitch?: string;
  category?: string;
}

export interface UpdateMetricsDto {
  mrr_amount?: number;
  paying_users_count?: number;
  user_count?: number;
  active_users_count?: number;
  proof_urls?: string[];
}

// -- Scoring --

export interface ScoringResult {
  tier_level: number;
  tier_points: number;
  mrr_bonus_points: number;
  total_score: number;
}

// -- Filters --

export interface EventFilters {
  status?: EventStatus;
  search?: string;
  host_institution_id?: string;
}

export interface RegistrationFilters {
  event_id: string;
  status?: RegistrationStatus;
  search?: string;
  institution_id?: string;
  checked_in?: boolean;
  page?: number;
  limit?: number;
}

export interface PaginatedRegistrations {
  data: EventRegistration[];
  pagination: {
    page: number;
    limit: number;
    total_items: number;
    total_pages: number;
  };
}

// -- Validation --

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// -- Leaderboard --

export interface LeaderboardEntry {
  rank: number;
  team_name: string;
  app_name: string | null;
  category: string | null;
  institution_name: string | null;
  tier_level: number;
  tier_points: number;
  mrr_amount: number;
  mrr_bonus_points: number;
  total_score: number;
  paying_users_count: number;
  user_count: number;
  active_users_count: number;
  registration_id: string;
  submission_id: string;
}

// -- Student Search --

export interface StudentSearchFilters {
  event_id: string;
  institution_id?: string;
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  semester_id?: string;
  search?: string; // name or roll_number
}

export interface StudentSearchResult {
  learner_id: string;
  profile_id: string | null;
  first_name: string;
  last_name: string | null;
  college_email: string | null;
  student_email: string;
  roll_number: string | null;
  institution_name: string | null;
  institution_id: string | null;
  degree_name: string | null;
  department_name: string | null;
  program_name: string | null;
  semester_name: string | null;
}

// -- Attendance --

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export interface EventTeamAttendance {
  id: string;
  event_id: string;
  registration_id: string;
  venue_assignment_id: string;
  day_type: DayType;
  status: AttendanceStatus;
  notes: string | null;
  marked_by: string | null;
  marked_at: string | null;
  created_at: string;
  updated_at: string;
  // Relations
  registration?: Pick<EventRegistration, 'id' | 'team_name' | 'institution_id'>;
  marker?: { id: string; full_name: string | null; email: string | null };
}

export interface MarkAttendanceDto {
  event_id: string;
  registration_id: string;
  venue_assignment_id: string;
  day_type: DayType;
  status: AttendanceStatus;
  notes?: string;
}

// -- Learner Participation Stats --

export interface LearnerParticipationStats {
  total_learners: number;
  participated: number;
  not_participated: number;
}

export interface LearnerParticipationFilters {
  institution_id?: string;
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  semester_id?: string;
}

export interface NotParticipatedLearner {
  id: string;
  first_name: string;
  last_name: string;
  roll_number: string | null;
  college_email: string | null;
  student_email: string | null;
  institution_id: string | null;
  degree_id: string | null;
  department_id: string | null;
  program_id: string | null;
  semester_id: string | null;
  institution_name: string | null;
  degree_name: string | null;
  department_name: string | null;
  program_name: string | null;
  semester_name: string | null;
}

export interface NotParticipatedLearnersResult {
  total: number;
  data: NotParticipatedLearner[];
}

export interface NotParticipatedFilters extends LearnerParticipationFilters {
  search?: string;
  page?: number;
  limit?: number;
}

export interface NotParticipatedByInstitution {
  institution_id: string | null;
  institution_name: string | null;
  not_participated_count: number;
}

// -- Pending Invitation View --

export interface PendingInvitation {
  member_id: string;          // event_team_members.id
  registration_id: string;
  team_name: string;
  team_code: string | null;
  event_id: string;
  event_name: string;
  invited_at: string;
  invited_by_name: string | null;
}

// ── Role Cards (Skill Bank) ───────────────────────────────────────────────

export interface RoleCard {
  id: string;
  submission_id: string;
  team_id: string;
  profile_id: string;
  learner_id: string | null;
  self_roles: string[];
  proud_of: string;
  created_at: string;
  peer_tags?: PeerTag[];
}

export interface PeerTag {
  id: string;
  role_card_id: string;
  tagger_profile_id: string;
  tagged_profile_id: string;
  tagged_role: string;
  created_at: string;
}

export interface CreateRoleCardDto {
  submission_id: string;
  team_id: string;
  profile_id: string;
  learner_id: string | null;
  self_roles: string[];
  proud_of: string;
  peer_tags: Array<{ tagged_profile_id: string; tagged_role: string }>;
}
