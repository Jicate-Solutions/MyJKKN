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
  voting_opened_at: string | null;       // ISO timestamp when admin opened audience voting
  voting_closed_at: string | null;       // ISO timestamp when admin closed audience voting
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
  section_id: string | null;
  institution_name: string | null;
  degree_name: string | null;
  department_name: string | null;
  program_name: string | null;
  semester_name: string | null;
  section_name: string | null;
  class_incharge_names: string | null;
  class_incharge_count: number;
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

// ─── Demo Day Verification Types (added 2026-03-08) ──────────────────────

export type VerificationStatus = 'pending' | 'verified' | 'flagged' | 'disqualified';

export interface AppathonVerification {
  id: string;
  submission_id: string;
  evaluator_id: string;
  venue_id: string;
  presented: boolean;
  presentation_slot: number | null;
  app_live: boolean;
  claimed_users: number;
  claimed_active_users: number;
  claimed_revenue: number;
  verified_users: number;
  verified_active_users: number;
  verified_revenue: number;
  verified_tier: number;
  revenue_bonus: number;
  total_score: number;
  verification_status: VerificationStatus;
  flag_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields (present when queried with select)
  evaluator?: { full_name: string };
  venue?: { manual_name: string };
}

export interface CreateVerificationDto {
  submission_id: string;
  venue_id: string;
  presented: boolean;
  app_live: boolean;
  verified_users: number;
  verified_active_users: number;
  verified_revenue: number;
  verification_status: VerificationStatus;
  // NOTE: These are optional in the DTO (undefined) but stored as NULL in DB.
  // Service layer must convert undefined → null (or omit the key) on insert/update.
  flag_reason?: string;
  notes?: string;
}

export type UpdateVerificationDto = Partial<CreateVerificationDto>;

export interface VerificationScore {
  tier: number;          // 0–4
  tier_points: number;   // 0, 10, 25, 40, or 50
  revenue_bonus: number; // 0, 5, or 10
  total_score: number;
}

// Data shape returned by the appathon_leaderboard view
export interface VerifiedLeaderboardEntry {
  submission_id: string;
  team_id: string;
  team_name: string;
  institution_id: string;
  event_id: string;
  app_name: string | null;
  live_app_url: string | null;
  category: string | null;
  verified_tier: number;
  tier_points: number;
  revenue_bonus: number;
  total_score: number;
  verified_users: number;
  verified_active_users: number;
  verified_revenue: number;
  verification_status: VerificationStatus | null;
  presented: boolean | null;
  evaluator_id: string | null;
  venue_name: string | null;
  college_rank: number;
  overall_rank: number;
}

// A single team card shown to the evaluator on the /evaluate page
export interface EvaluatorTeamCard {
  registration_id: string;
  team_name: string;
  institution_name: string;
  demo_slot: number | null;
  venue_id: string;  // venue_assignment_id for the team's demo venue
  submission: {
    id: string;
    app_name: string | null;
    live_app_url: string | null;
    github_url: string | null;
    user_count: number;
    active_users_count: number;
    mrr_amount: number;
    proof_urls: string[];
  } | null;
  verification: AppathonVerification | null;
}

// Admin view of evaluator progress per venue
export interface EvaluatorProgress {
  staff_id: string;
  evaluator_profile_id: string;
  evaluator_name: string;
  venue_id: string;
  venue_name: string;
  event_id: string;
  total_teams: number;
  verified_count: number;
  remaining: number;
}

// ── Audience Voting ──────────────────────────────────────────────────────────

export interface AudienceVote {
  id: string;
  event_id: string;
  submission_id: string;
  voter_profile_id: string;
  rating: number;        // 1–5
  voted_at: string;
  updated_at: string;
}

export interface VoteSummary {
  submission_id: string;
  event_id: string;
  total_votes: number;
  average_rating: number;  // e.g. 4.2
}

// ============================================================
// POST DEMO DAY PIPELINE TYPES
// Added: 2026-03-09 — Spec: Spec-Post-Demo-Day-Pipeline.md
// ============================================================

export type TrackId = 'solve_for_100' | 'jicate_solutions' | 'solve_for_industry' | 'completed'

export type ProgressionLevelNumber = 1 | 2 | 3 | 4 | 5

export interface TrackDeclaration {
  id: string;
  event_id: string;
  team_id: string;
  track: TrackId;
  reason: string | null;
  declared_by: string;
  declared_at: string;
  created_at: string;
  updated_at: string;
  mentor_approved: boolean | null;
  mentor_notes: string | null;
  approved_at: string | null;
  approved_by: string | null;
}

export interface TrackDeclarationWithTeam extends TrackDeclaration {
  team_name: string;
  institution_name: string;
}

export interface ProgressionLevel {
  id: string;
  profile_id: string;
  event_id: string;
  team_id: string | null;
  level: ProgressionLevelNumber;
  level_name: string;
  achieved_at: string;
  created_at: string;
  evidence: Record<string, unknown>;
  awarded_by: string;
}

export interface CaseStudy {
  id: string;
  event_id: string;
  team_id: string;
  track: 'solve_for_industry' | 'jicate_solutions';
  problem: string;
  solution: string;
  proof: string;
  who_else: string | null;
  demo_url: string | null;
  app_name: string | null;
  app_url: string | null;
  score: number | null;
  featured: boolean;
  created_at: string;
  updated_at: string;
}

// DTOs

export interface DeclareTrackDto {
  event_id: string;
  team_id: string;
  track: TrackId;
  reason?: string;
}

export interface UpdateTrackDeclarationDto {
  track: TrackId;
  reason?: string;
}

export interface MentorApproveTrackDto {
  mentor_approved: boolean;
  mentor_notes?: string;
}

export interface CreateCaseStudyDto {
  event_id: string;
  team_id: string;
  track: 'solve_for_industry' | 'jicate_solutions';
  problem: string;
  solution: string;
  proof: string;
  who_else?: string;
  demo_url?: string;
  app_name?: string;
  app_url?: string;
  score?: number;
}

export interface UpdateCaseStudyDto {
  problem?: string;
  solution?: string;
  proof?: string;
  who_else?: string;
  demo_url?: string;
}

export interface AdminUpdateCaseStudyDto {
  featured?: boolean;
  score?: number | null;
}

export interface TrackDeclarationSummary {
  track: TrackId;
  count: number;
  percentage: number;
}

// Re-export Portfolio Intelligence types from index
export type {
  id: string;
  name: string;
  code: string;
  description: string | null;
  framework: KpiFramework;
  category: KpiCategory;
  data_type: KpiDataType;
  unit: string | null;
  measurement_method: string | null;
  target_value: number | null;
  target_period: string | null;
  collection_frequency: KpiCollectionFrequency;
  source_table: string | null;
  source_query: string | null;
  is_auto_calculated: boolean;
  relevant_to: string[];
  is_active: boolean;
  institution_id: string;
  created_at: string;
  latest_measurement?: KpiMeasurement;
}

export interface KpiMeasurement {
  id: string;
  kpi_id: string;
  period_start: string;
  period_end: string;
  value: number;
  previous_value: number | null;
  notes: string | null;
  data_source: string | null;
  verified: boolean;
  verified_by: string | null;
  institution_id: string;
  created_at: string;
}

export interface ImpactReport {
  id: string;
  report_title: string;
  report_type: ImpactReportType;
  target_audience: ImpactReportAudience;
  period_start: string;
  period_end: string;
  executive_summary: string | null;
  startup_highlights: Record<string, unknown>[];
  kpi_snapshot: Record<string, unknown>;
  report_url: string | null;
  infographic_url: string | null;
  status: ImpactReportStatus;
  approved_by: string | null;
  published_at: string | null;
  institution_id: string;
  created_at: string;
  updated_at: string;
}

export interface KpiDashboardData {
  kpis: (KpiDefinition & { latest_value?: number; trend?: 'up' | 'down' | 'stable' })[];
  framework_compliance: Record<string, FrameworkCompliance>;
  total_kpis: number;
  measured_kpis: number;
}

export interface FrameworkCompliance {
  total: number;
  measured: number;
  unmeasured: number;
  compliance_pct: number;
}

export interface KpiFilters {
  framework?: KpiFramework;
  category?: KpiCategory;
  search?: string;
  institution_id?: string;
  page?: number;
  limit?: number;
}

export interface ImpactReportFilters {
  status?: ImpactReportStatus;
  type?: ImpactReportType;
  institution_id?: string;
  page?: number;
  limit?: number;
}

export interface CreateKpiDefinitionInput {
  name: string;
  code: string;
  description?: string;
  framework: KpiFramework;
  category: KpiCategory;
  data_type: KpiDataType;
  unit?: string;
  target_value?: number;
  target_period?: string;
  collection_frequency?: KpiCollectionFrequency;
  is_auto_calculated?: boolean;
  relevant_to?: string[];
  institution_id: string;
}

export interface UpdateKpiDefinitionInput extends Partial<CreateKpiDefinitionInput> {}

export interface RecordMeasurementInput {
  kpi_id: string;
  period_start: string;
  period_end: string;
  value: number;
  notes?: string;
  data_source?: string;
  institution_id: string;
}

export interface CreateImpactReportInput {
  report_title: string;
  report_type: ImpactReportType;
  target_audience: ImpactReportAudience;
  period_start: string;
  period_end: string;
  executive_summary?: string;
  institution_id: string;
}

export interface UpdateImpactReportInput extends Partial<CreateImpactReportInput> {
  status?: ImpactReportStatus;
  startup_highlights?: Record<string, unknown>[];
  kpi_snapshot?: Record<string, unknown>;
}

// ============================================================
// Phase 5: Finance, Governance & Compliance
// ============================================================

export interface SSGrant {
  id: string;
  name: string;
  funder: string;
  grant_number: string | null;
  sanctioned_amount: number;
  received_amount: number;
  utilized_amount: number;
  currency: string;
  sanction_date: string | null;
  start_date: string | null;
  end_date: string | null;
  uc_submitted: boolean;
  uc_submitted_at: string | null;
  audit_status: string;
  purpose: string | null;
  allowed_heads: string[];
  reporting_frequency: string;
  last_report_date: string | null;
  next_report_due: string | null;
  institution_id: string;
  created_at: string;
  updated_at: string;
}

export interface CreateGrantInput { name: string; funder: string; sanctioned_amount: number; institution_id: string; grant_number?: string; purpose?: string; start_date?: string; end_date?: string; }
export interface UpdateGrantInput extends Partial<CreateGrantInput> { received_amount?: number; utilized_amount?: number; uc_submitted?: boolean; audit_status?: string; }

export interface SSBudget {
  id: string;
  fiscal_year: string;
  quarter: string | null;
  category: string;
  subcategory: string | null;
  allocated_amount: number;
  spent_amount: number;
  committed_amount: number;
  grant_id: string | null;
  notes: string | null;
  approved_by: string | null;
  institution_id: string;
  created_at: string;
  updated_at: string;
}

export interface CreateBudgetInput { fiscal_year: string; category: string; allocated_amount: number; institution_id: string; quarter?: string; subcategory?: string; grant_id?: string; }
export interface UpdateBudgetInput extends Partial<CreateBudgetInput> { spent_amount?: number; committed_amount?: number; }

export interface SSRevenue {
  id: string;
  fiscal_year: string;
  month: number | null;
  source: string;
  amount: number;
  currency: string;
  description: string | null;
  is_self_generated: boolean;
  institution_id: string;
  created_at: string;
}

export interface RecordRevenueInput { fiscal_year: string; source: string; amount: number; institution_id: string; month?: number; description?: string; is_self_generated?: boolean; }

export interface SSAuditRecord {
  id: string;
  audit_type: string;
  audit_period_start: string;
  audit_period_end: string;
  auditor_name: string | null;
  auditor_organization: string | null;
  status: string;
  findings_count: number;
  critical_findings: number;
  findings_details: Record<string, unknown>[];
  management_response: string | null;
  action_plan: Record<string, unknown>[];
  all_findings_resolved: boolean;
  report_url: string | null;
  institution_id: string;
  created_at: string;
  updated_at: string;
}

export interface CreateAuditRecordInput { audit_type: string; audit_period_start: string; audit_period_end: string; institution_id: string; auditor_name?: string; auditor_organization?: string; }
export interface UpdateAuditRecordInput extends Partial<CreateAuditRecordInput> { status?: string; findings_count?: number; critical_findings?: number; management_response?: string; all_findings_resolved?: boolean; }

export interface SSGovernanceMember {
  id: string;
  name: string;
  designation: string | null;
  organization: string | null;
  email: string | null;
  phone: string | null;
  body: string;
  role: string;
  term_start: string | null;
  term_end: string | null;
  is_active: boolean;
  coi_declaration_filed: boolean;
  coi_details: string | null;
  institution_id: string;
  created_at: string;
  updated_at: string;
}

export interface CreateGovernanceMemberInput { name: string; body: string; role: string; institution_id: string; designation?: string; organization?: string; email?: string; }
export interface UpdateGovernanceMemberInput extends Partial<CreateGovernanceMemberInput> { is_active?: boolean; term_start?: string; term_end?: string; }

export interface SSComplianceItem {
  id: string;
  category: string;
  requirement: string;
  description: string | null;
  frequency: string;
  status: string;
  due_date: string | null;
  completed_date: string | null;
  completed_by: string | null;
  evidence_url: string | null;
  notes: string | null;
  reminder_days_before: number;
  is_critical: boolean;
  institution_id: string;
  created_at: string;
  updated_at: string;
}

export interface CreateComplianceItemInput { category: string; requirement: string; frequency: string; institution_id: string; description?: string; due_date?: string; is_critical?: boolean; }
export interface UpdateComplianceStatusInput { status: string; completed_date?: string; completed_by?: string; evidence_url?: string; notes?: string; }

export interface ComplianceDashboard {
  total: number;
  completed: number;
  overdue: number;
  in_progress: number;
  completion_rate: number;
  critical_overdue: number;
}

export interface SSReadinessAssessment {
  id: string;
  assessment_date: string;
  assessed_by: string | null;
  infra_score: number | null;
  finance_score: number | null;
  board_score: number | null;
  hr_score: number | null;
  legal_score: number | null;
  overall_score: number | null;
  overall_pct: number | null;
  weakest_pillar: string | null;
  improvement_plan: string | null;
  institution_id: string;
  created_at: string;
}

// ============================================================
// Phase 6: Marketing & Outreach
// ============================================================

export interface SSMarketingActivity {
  id: string;
  activity_type: string;
  title: string;
  description: string | null;
  target_audience: string | null;
  date_start: string | null;
  date_end: string | null;
  budget: number | null;
  actual_cost: number | null;
  reach_count: number;
  leads_generated: number;
  applications_from_activity: number;
  media_links: string[];
  photos: string[];
  roi_notes: string | null;
  status: string;
  conducted_by: string | null;
  institution_id: string;
  created_at: string;
  updated_at: string;
}

export interface CreateMarketingActivityInput { activity_type: string; title: string; institution_id: string; description?: string; target_audience?: string; date_start?: string; budget?: number; }
export interface UpdateMarketingActivityInput extends Partial<CreateMarketingActivityInput> { status?: string; actual_cost?: number; reach_count?: number; leads_generated?: number; }

export interface MarketingDashboard {
  total_activities: number;
  total_reach: number;
  total_leads: number;
  total_applications: number;
  avg_roi: number | null;
  by_type: Record<string, number>;
}

export type {
  SSTrlAssessment,
  CreateTrlAssessmentInput,
  TrlDistribution,
  SSRiskAssessment,
  CreateRiskAssessmentInput,
  RiskHeatmapEntry,
  SSCompetitiveMatrix,
  CreateCompetitorInput,
  UpdateCompetitorInput,
  PortfolioDashboardData,
  EnthusiasmCurve,
  LegalStructure,
  KycStatus,
  IpStatus,
  PrototypeMaturity,
  WillingnessToPay,
  CompetitionLevel,
  Coachability,
  InvestorInterestLevel,
  CompetitorType,
  RiskDimension,
  RiskLevel,
  SSNifCandidate,
  NifStage,
  SSNifStageHistory,
  NifCandidateFilters,
  CreateNifCandidateInput,
  UpdateNifCandidateInput,
  SSMentor,
  SSMentorMatch,
  SSMentorSession,
  SSMentorEvaluation,
  CreateMentorInput,
  UpdateMentorInput,
  CreateMatchInput,
  LogSessionInput,
  MentorFilters,
  MentorDashboardData,
  MentorType,
  MentorStatus,
  MatchStatus,
  SessionMode,
  MentorFocusArea,
  EvaluationRecommendation,
  SSGraduationCriteria,
  SSGraduationEvaluation,
  SSExitProcedure,
  SSAlumniTracking,
  CreateGraduationCriteriaInput,
  CreateExitProcedureInput,
  TrackAlumniInput,
  AlumniMetrics,
  SSReadinessAssessment,
  CreateReadinessAssessmentInput,
  SustainabilityMetrics,
  GrantUtilization,
  GrantAuditStatus,
  RevenueSource,
  AuditType,
  AuditRecordStatus,
  GovernanceBody,
  GovernanceRole,
  ComplianceCategory,
  ComplianceFrequency,
  ComplianceStatus,
  MarketingActivityType,
  MarketingActivityStatus,
} from './startup-studio/index';
