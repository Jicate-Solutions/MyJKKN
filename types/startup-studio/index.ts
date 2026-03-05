// types/startup-studio/index.ts
// Shared types for the Startup Studio module (ss_ tables)

import type { PaginationParams } from '@/lib/services/solutions/types';

// ============================================
// ENUMS (matching DB enums)
// ============================================

export type CycleStatus = 'active' | 'completed' | 'abandoned';
export type ProblemFrequency = 'daily' | 'weekly' | 'monthly' | 'occasional';
export type DecisionType = 'proceed' | 'iterate' | 'pivot' | 'stop';
export type WorkflowType =
  | 'AUDIT' | 'GENERATION' | 'TRANSFORMATION' | 'CLASSIFICATION'
  | 'EXTRACTION' | 'SYNTHESIS' | 'PREDICTION' | 'RECOMMENDATION'
  | 'MONITORING' | 'ORCHESTRATION';
export type ProblemBankStatus = 'open' | 'claimed' | 'in_progress' | 'solved' | 'archived';
export type ProblemTheme =
  | 'healthcare' | 'education' | 'agriculture' | 'environment'
  | 'community' | 'operations' | 'productivity' | 'other';
export type AttemptOutcome = 'building' | 'deployed' | 'abandoned' | 'success' | 'partial';
export type NifStage =
  | 'identified' | 'screened' | 'shortlisted' | 'incubating'
  | 'graduated' | 'rejected' | 'on_hold';
export type SubmissionStatus = 'draft' | 'submitted' | 'under_review' | 'shortlisted' | 'winner' | 'rejected';

// Metrics fields (Appathon 2.0 tiered objectives)
export interface SubmissionMetrics {
  mrr_amount: number;
  paying_users_count: number;
  total_users: number;
  active_users: number;
  proof_urls: string[];
  metrics_updated_at: string | null;
}
export type ReviewStatus = 'pending' | 'in_review' | 'approved' | 'needs_revision' | 'flagged';

// ============================================
// CORE ENTITIES
// ============================================

export interface SSEvent {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  config: Record<string, any>;
  banner_color: string;
  institution_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SSCycle {
  id: string;
  user_id: string;
  event_id: string | null;
  name: string | null;
  status: CycleStatus;
  current_step: number;
  impact_score: number | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SSCycleWithSteps extends SSCycle {
  problems?: SSProblem[];
  contexts?: SSContext[];
  value_assessments?: SSValueAssessment[];
  workflow_classifications?: SSWorkflowClassification[];
  prompts?: SSPrompt[];
  builds?: SSBuild[];
  impacts?: SSImpact[];
  user?: { id: string; full_name: string };
  event?: SSEvent;
}

// ============================================
// FLYWHEEL STEPS
// ============================================

export interface SSProblem {
  id: string;
  cycle_id: string;
  statement: string | null;
  refined_statement: string | null;
  pain_level: number | null;
  frequency: ProblemFrequency | null;
  answers: Record<string, any>;
  completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface SSContext {
  id: string;
  cycle_id: string;
  who: string | null;
  primary_users: string | null;
  secondary_users: string | null;
  when_occurs: string | null;
  where_occurs: string | null;
  frequency: string | null;
  pain_level: number | null;
  workaround_satisfaction: number | null;
  current_workaround: string | null;
  completed: boolean;
  created_at: string;
  updated_at: string;
  interviews?: SSInterview[];
}

export interface SSInterview {
  id: string;
  context_id: string;
  interviewee_name: string | null;
  interviewee_role: string | null;
  key_quote: string | null;
  pain_level: number | null;
  referrals: string[] | null;
  created_at: string;
}

export interface SSValueAssessment {
  id: string;
  cycle_id: string;
  desperate_user_score: number | null;
  quadrant: string | null;
  decision: DecisionType | null;
  reasoning: string | null;
  criteria: Record<string, any>;
  evidence: Record<string, any>;
  completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface SSWorkflowClassification {
  id: string;
  cycle_id: string;
  workflow_type: WorkflowType | null;
  classification_path: any[];
  confidence: string | null;
  features: string[] | null;
  completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface SSPrompt {
  id: string;
  cycle_id: string;
  generated_prompt: string | null;
  user_edited_prompt: string | null;
  final_prompt: string | null;
  copied_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SSBuild {
  id: string;
  cycle_id: string;
  lovable_project_url: string | null;
  deployed_url: string | null;
  screenshot_urls: string[] | null;
  notes: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SSImpact {
  id: string;
  cycle_id: string;
  users_reached: number;
  time_saved_minutes: number;
  satisfaction_score: number | null;
  total_users: number | null;
  potential_users: number | null;
  adoption_rate: number | null;
  pain_before: number | null;
  pain_after: number | null;
  nps_score: number | null;
  impact_score: number | null;
  feedback: string | null;
  lessons_learned: string | null;
  new_problems: string[] | null;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// PROBLEM BANK
// ============================================

export interface SSProblemBank {
  id: string;
  original_cycle_id: string | null;
  source_type: string;
  source_year: number | null;
  source_event: string | null;
  event_id: string | null;
  title: string;
  problem_statement: string | null;
  theme: ProblemTheme;
  sub_theme: string | null;
  who_affected: string | null;
  when_occurs: string | null;
  where_occurs: string | null;
  frequency: string | null;
  severity_rating: number | null;
  current_workaround: string | null;
  validation_status: string;
  users_interviewed: number;
  desperate_user_count: number;
  desperate_user_score: number;
  institution_id: string | null;
  department: string | null;
  submitted_by: string | null;
  status: ProblemBankStatus;
  is_open_for_attempts: boolean;
  best_solution_cycle_id: string | null;
  best_solution_url: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface SSProblemBankWithDetails extends SSProblemBank {
  attempts?: SSProblemAttempt[];
  tags?: SSProblemTag[];
  scores?: SSProblemScore[];
  nif_candidate?: SSNifCandidate;
}

export interface SSProblemAttempt {
  id: string;
  problem_id: string;
  cycle_id: string | null;
  user_id: string | null;
  team_name: string | null;
  outcome: AttemptOutcome;
  outcome_notes: string | null;
  users_reached: number;
  impact_score: number | null;
  app_url: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface SSProblemTag {
  id: string;
  problem_id: string;
  tag: string;
  tag_type: string;
  created_by: string | null;
}

export interface SSProblemScore {
  id: string;
  problem_id: string;
  severity_score: number | null;
  validation_score: number | null;
  uniqueness_score: number | null;
  feasibility_score: number | null;
  impact_potential_score: number | null;
  composite_score: number;
  scored_by: string;
  scored_by_user: string | null;
  notes: string | null;
  created_at: string;
}

// ============================================
// NIF PIPELINE
// ============================================

export interface SSNifCandidate {
  id: string;
  problem_id: string;
  stage: NifStage;
  identified_at: string;
  screened_at: string | null;
  shortlisted_at: string | null;
  incubation_started_at: string | null;
  graduated_at: string | null;
  rejected_at: string | null;
  identified_by: string | null;
  decision_notes: string | null;
  rejection_reason: string | null;
  startup_name: string | null;
  startup_status: string | null;
  startup_website: string | null;
  team_members: any[];
  funding_stage: string | null;
  funding_amount: number | null;
  jobs_created: number;
  revenue_generated: number;
  created_at: string;
  updated_at: string;
}

export interface SSNifStageHistory {
  id: string;
  candidate_id: string;
  from_stage: NifStage | null;
  to_stage: NifStage;
  changed_by: string | null;
  change_reason: string | null;
  created_at: string;
}

// ============================================
// APPATHON / JUDGING
// ============================================

export interface SSAppathonSubmission {
  id: string;
  cycle_id: string | null;
  event_id: string;
  user_id: string;
  participation_type: string;
  team_name: string | null;
  team_members: any[];
  applicant_name: string | null;
  applicant_email: string | null;
  institution_id: string | null;
  department: string | null;
  app_name: string | null;
  problem_statement: string | null;
  solution_summary: string | null;
  live_url: string | null;
  lovable_url: string | null;
  elevator_pitch: string | null;
  demo_video_url: string | null;
  github_repo_url: string | null;
  screenshots: any[];
  category: string | null;
  status: SubmissionStatus;
  submission_number: string | null;
  score: number | null;
  mrr_amount: number;
  paying_users_count: number;
  proof_urls: string[];
  metrics_updated_at: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SSJudgeScore {
  id: string;
  submission_id: string;
  judge_id: string;
  track_id: string | null;
  /** Real Problem - backed by discovery interviews (25% weight, 1-5) */
  real_problem: number | null;
  /** Working App - actually functions (25% weight, 1-5) */
  working_app: number | null;
  /** User Tested - real people tried it (20% weight, 1-5) */
  user_tested: number | null;
  /** Completeness - usable today (15% weight, 1-5) */
  completeness: number | null;
  /** Presentation - clear, confident, within time (15% weight, 1-5) */
  presentation: number | null;
  weighted_score: number | null;
  total_score: number | null;
  notes: string | null;
  strengths: string | null;
  improvements: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// FILTER TYPES
// ============================================

export interface CycleFilters extends PaginationParams {
  user_id?: string;
  event_id?: string;
  status?: CycleStatus;
}

export interface ProblemBankFilters extends PaginationParams {
  theme?: ProblemTheme;
  status?: ProblemBankStatus;
  institution_id?: string;
  event_id?: string;
  min_severity?: number;
}

export interface NifCandidateFilters extends PaginationParams {
  stage?: NifStage;
}

export interface SubmissionFilters extends PaginationParams {
  event_id?: string;
  status?: SubmissionStatus;
  user_id?: string;
}

// ============================================
// INPUT TYPES
// ============================================

export interface CreateCycleInput {
  user_id: string;
  event_id?: string;
  name?: string;
}

export interface UpdateCycleInput {
  name?: string;
  status?: CycleStatus;
  current_step?: number;
  impact_score?: number;
  completed_at?: string;
}

export interface CreateProblemBankInput {
  title: string;
  problem_statement?: string;
  theme?: ProblemTheme;
  sub_theme?: string;
  who_affected?: string;
  severity_rating?: number;
  event_id?: string;
  institution_id?: string;
  department?: string;
  submitted_by?: string;
  original_cycle_id?: string;
}

export interface CreateNifCandidateInput {
  problem_id: string;
  identified_by?: string;
  decision_notes?: string;
}

export interface UpdateNifCandidateInput {
  stage?: NifStage;
  decision_notes?: string;
  rejection_reason?: string;
  startup_name?: string;
  startup_status?: string;
  startup_website?: string;
  team_members?: any[];
  funding_stage?: string;
  funding_amount?: number;
  jobs_created?: number;
  revenue_generated?: number;
}

export interface CreateSubmissionInput {
  event_id: string;
  user_id: string;
  cycle_id?: string;
  participation_type?: string;
  team_name?: string;
  team_members?: any[];
  applicant_name?: string;
  applicant_email?: string;
  institution_id?: string;
  department?: string;
  app_name?: string;
  problem_statement?: string;
  solution_summary?: string;
  live_url?: string;
  lovable_url?: string;
  elevator_pitch?: string;
  github_repo_url?: string;
  category?: string;
}

export interface CreateEventInput {
  slug: string;
  name: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  config?: Record<string, any>;
  banner_color?: string;
  institution_id?: string;
  created_by?: string;
}

// ============================================
// v2.0 ENUMS
// ============================================

export type SolutionTrack = 'app' | 'product' | 'hybrid';
export type VentureStage =
  | 'forming' | 'discovering' | 'designing' | 'building'
  | 'validating' | 'revenue' | 'scaling' | 'graduated'
  | 'stalled' | 'disbanded';
export type CohortStatus = 'planned' | 'active' | 'completed';
export type PrototypeType = 'software' | 'hardware' | 'algorithm' | 'formulation' | 'device' | 'mixed';

// ============================================
// v2.0 CORE ENTITIES
// ============================================

export interface SSTeam {
  id: string;
  name: string;
  cohort_id: string | null;
  anchor_id: string;
  event_id: string | null;
  institution_id: string | null;
  preliminary_track: SolutionTrack | null;
  assigned_business_name: string | null;
  assigned_business_contact: string | null;
  assigned_business_phone: string | null;
  assigned_business_type: string | null;
  assigned_business_location: string | null;
  business_assigned_at: string | null;
  venture_stage: VentureStage;
  venture_stage_updated_at: string | null;
  sh_product_id: string | null;
  mentor_id: string | null;
  mentor_assigned_at: string | null;
  is_lighthouse: boolean;
  agreement_signed: boolean;
  agreement_signed_at: string | null;
  member_count: number;
  discipline_count: number;
  created_at: string;
  updated_at: string;
}

export interface SSTeamWithDetails extends SSTeam {
  cohort?: SSCohort;
  anchor?: { id: string; full_name: string };
  institution?: { id: string; name: string };
  members?: SSTeamMember[];
  cycles?: SSCycle[];
  visits?: SSBusinessVisit[];
  stage_history?: SSVentureStageHistory[];
}

export interface SSTeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role: string;
  is_anchor: boolean;
  department: string | null;
  has_laptop?: boolean;
  joined_at: string;
  user?: { id: string; full_name: string };
}

export interface SSCohort {
  id: string;
  name: string;
  description: string | null;
  target_teams: number | null;
  actual_teams: number;
  start_date: string | null;
  end_date: string | null;
  status: CohortStatus;
  created_at: string;
  updated_at: string;
}

export interface SSBusinessVisit {
  id: string;
  team_id: string;
  visited_by: string | null;
  visit_date: string | null;
  contact_person: string | null;
  key_findings: string | null;
  pain_points_discovered: string[] | null;
  would_pay: boolean | null;
  willing_to_pay_amount: string | null;
  photos: string[] | null;
  notes: string | null;
  created_at: string;
  visitor?: { id: string; full_name: string };
}

export interface SSVentureStageHistory {
  id: string;
  team_id: string;
  from_stage: VentureStage | null;
  to_stage: VentureStage;
  evidence_text: string | null;
  evidence_url: string | null;
  changed_by: string | null;
  created_at: string;
  changer?: { id: string; full_name: string };
}

export interface SSTeamDashboard {
  id: string;
  team_name: string;
  venture_stage: VentureStage;
  preliminary_track: SolutionTrack | null;
  assigned_business_name: string | null;
  assigned_business_type: string | null;
  assigned_business_location: string | null;
  is_lighthouse: boolean;
  member_count: number;
  discipline_count: number;
  agreement_signed: boolean;
  sh_product_id: string | null;
  cohort_name: string | null;
  anchor_name: string | null;
  institution_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface SSVentureFunnel {
  venture_stage: VentureStage;
  team_count: number;
  lighthouse_count: number;
  app_track_count: number;
  product_track_count: number;
  hybrid_track_count: number;
  agreements_signed: number;
  avg_team_size: number;
  avg_disciplines: number;
}

// ============================================
// v2.0 FILTER TYPES
// ============================================

export interface TeamFilters extends PaginationParams {
  cohort_id?: string;
  event_id?: string;
  institution_id?: string;
  venture_stage?: VentureStage;
  preliminary_track?: SolutionTrack;
  is_lighthouse?: boolean;
  search?: string;
}

export interface CohortFilters extends PaginationParams {
  status?: CohortStatus;
}

// ============================================
// v2.0 INPUT TYPES
// ============================================

export interface CreateTeamInput {
  name: string;
  anchor_id: string;
  event_id?: string;
  cohort_id?: string;
  institution_id?: string;
  preliminary_track?: SolutionTrack;
}

export interface UpdateTeamInput {
  name?: string;
  cohort_id?: string;
  preliminary_track?: SolutionTrack;
  assigned_business_name?: string;
  assigned_business_contact?: string;
  assigned_business_phone?: string;
  assigned_business_type?: string;
  assigned_business_location?: string;
  venture_stage?: VentureStage;
  mentor_id?: string;
  is_lighthouse?: boolean;
  agreement_signed?: boolean;
}

export interface CreateCohortInput {
  name: string;
  description?: string;
  target_teams?: number;
  start_date?: string;
  end_date?: string;
}

export interface UpdateCohortInput {
  name?: string;
  description?: string;
  target_teams?: number;
  actual_teams?: number;
  start_date?: string;
  end_date?: string;
  status?: CohortStatus;
}

export interface CreateBusinessVisitInput {
  team_id: string;
  visited_by?: string;
  visit_date?: string;
  contact_person?: string;
  key_findings?: string;
  pain_points_discovered?: string[];
  would_pay?: boolean;
  willing_to_pay_amount?: string;
  notes?: string;
}

export interface AdvanceVentureStageInput {
  to_stage: VentureStage;
  evidence_text?: string;
  evidence_url?: string;
  changed_by?: string;
}

// ============================================
// v2.1 EVENT REGISTRATION TYPES
// ============================================

export type RegistrationStatus = 'draft' | 'registered' | 'confirmed' | 'checked_in';
export type ChecklistPhase = 'pre_event' | 'on_day' | 'post_event';
export type PresentationStatus = 'scheduled' | 'presenting' | 'completed' | 'skipped';

export interface SSTeamMemberWithLaptop extends SSTeamMember {
  has_laptop: boolean;
}

export interface SSEventChecklist {
  id: string;
  event_id: string;
  phase: ChecklistPhase;
  title: string;
  description: string | null;
  sort_order: number;
  created_at: string;
}

export interface SSChecklistResponse {
  id: string;
  checklist_id: string;
  user_id: string;
  institution_id: string | null;
  is_completed: boolean;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface SSChecklistWithResponses extends SSEventChecklist {
  responses?: SSChecklistResponse[];
}

export interface SSPresentationSlot {
  id: string;
  event_id: string;
  team_id: string | null;
  submission_id: string | null;
  slot_time: string;
  duration_mins: number;
  room: string | null;
  judge_panel: string | null;
  status: PresentationStatus;
  created_at: string;
  team?: { id: string; name: string };
  submission?: { id: string; app_name: string | null; team_name: string | null };
}

export interface RegisterTeamInput {
  event_id: string;
  name: string;
  problem_idea: string;
  institution_id?: string;
  preliminary_track?: SolutionTrack;
  members: {
    user_id: string;
    role?: string;
    department?: string;
    is_anchor?: boolean;
    has_laptop?: boolean;
  }[];
}

export interface EventRegistrationStats {
  total_teams: number;
  total_members: number;
  laptops_confirmed: number;
  by_institution: { institution_name: string; team_count: number; member_count: number; laptop_count: number }[];
}

// ============================================
// VENUE ALLOCATION
// ============================================

export interface SSEventVenue {
  id: string;
  event_id: string;
  resource_id: string | null;
  day_type: 'build_day' | 'demo_day';
  venue_name: string;
  institution_id: string | null;
  capacity: number;
  location_info: string | null;
  status: string;
  created_at: string;
  // Joined data
  staff?: SSVenueStaff[];
  teams?: SSTeam[];
  institution?: { id: string; name: string };
  resource?: { id: string; name: string; building_number: string; room_number: string };
}

export interface SSVenueStaff {
  id: string;
  venue_id: string;
  user_id: string;
  role: 'mentor' | 'lead_mentor' | 'judge' | 'panel_chair';
  created_at: string;
  // Joined
  user?: { id: string; full_name: string; email: string };
}

export interface VenueStats {
  total_venues: number;
  total_capacity: number;
  teams_allocated: number;
  teams_unallocated: number;
  staff_assigned: number;
}
