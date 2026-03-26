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
  build_tool: 'lovable' | 'matlab' | 'code' | 'other' | null;
  matlab_toolboxes_used: string[] | null;
  github_repo_url: string | null;
  tool_name: string | null;
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
  recommended_tools: string[];
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

export type EnthusiasmCurve = 'uninformed_optimism' | 'informed_pessimism' | 'valley_of_despair' | 'informed_optimism' | 'success';
export type LegalStructure = 'proprietorship' | 'partnership' | 'llp' | 'private_limited' | 'section_8' | 'opc';
export type KycStatus = 'pending' | 'submitted' | 'verified' | 'rejected';
export type IpStatus = 'none' | 'trade_secret' | 'patent_filed' | 'patent_granted';
export type PrototypeMaturity = 'concept' | 'proof_of_concept' | 'alpha' | 'beta' | 'production';
export type WillingnessToPay = 'unknown' | 'interested' | 'verbal_commit' | 'paid' | 'recurring';
export type CompetitionLevel = 'blue_ocean' | 'few_competitors' | 'moderate' | 'crowded' | 'monopolized';
export type Coachability = 'resistant' | 'passive' | 'receptive' | 'proactive';
export type InvestorInterestLevel = 'none' | 'exploring' | 'in_discussion' | 'term_sheet' | 'committed';
export type CompetitorType = 'direct' | 'indirect' | 'substitute';
export type RiskDimension = 'magic' | 'market' | 'management' | 'money';
export type RiskLevel = 'low' | 'moderate' | 'high' | 'critical';

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
  deployment_platform: string | null;
  sh_product_id: string | null;
  sh_solution_id: string | null;
  jobs_created: number;
  revenue_generated: number;
  // Portfolio Intelligence fields (Phase 1 enrichment)
  current_trl: number | null;
  trl_assessed_at: string | null;
  enthusiasm_curve: EnthusiasmCurve | null;
  capital_assessment: Record<string, number>;
  dipp_number: string | null;
  incorporation_number: string | null;
  incorporation_date: string | null;
  legal_structure: LegalStructure | null;
  gst_number: string | null;
  pan_number: string | null;
  pitch_deck_url: string | null;
  elevator_pitch: string | null;
  business_plan_url: string | null;
  logo_url: string | null;
  founder_profiles: Array<{ name: string; role: string; linkedin?: string; experience_years?: number; domain?: string }>;
  customer_count: number;
  market_sector: string | null;
  target_geography: string | null;
  patents_filed: number;
  patents_granted: number;
  trademarks: number;
  incubation_agreement_signed: boolean;
  incubation_agreement_date: string | null;
  allocated_space: string | null;
  equity_given_pct: number | null;
  kyc_status: KycStatus;
  kyc_documents: any[];
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
  recommended_tools?: string[];
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
  // Portfolio Intelligence enrichment fields
  current_trl?: number;
  trl_assessed_at?: string;
  enthusiasm_curve?: EnthusiasmCurve;
  capital_assessment?: Record<string, number>;
  dipp_number?: string;
  incorporation_number?: string;
  incorporation_date?: string;
  legal_structure?: LegalStructure;
  gst_number?: string;
  pan_number?: string;
  pitch_deck_url?: string;
  elevator_pitch?: string;
  business_plan_url?: string;
  logo_url?: string;
  founder_profiles?: Array<{ name: string; role: string; linkedin?: string; experience_years?: number; domain?: string }>;
  customer_count?: number;
  market_sector?: string;
  target_geography?: string;
  patents_filed?: number;
  patents_granted?: number;
  trademarks?: number;
  incubation_agreement_signed?: boolean;
  incubation_agreement_date?: string;
  allocated_space?: string;
  equity_given_pct?: number;
  kyc_status?: KycStatus;
  kyc_documents?: any[];
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

// ============================================
// PORTFOLIO INTELLIGENCE: TRL ASSESSMENTS
// ============================================

export interface SSTrlAssessment {
  id: string;
  candidate_id: string;
  trl_level: number;
  previous_trl: number | null;
  assessment_date: string;
  assessed_by: string | null;
  evidence_description: string;
  evidence_urls: string[];
  lab_validated: boolean;
  relevant_env_validated: boolean;
  prototype_demonstrated: boolean;
  system_qualified: boolean;
  operational_proven: boolean;
  blockers: string[];
  next_steps: string | null;
  estimated_months_to_next: number | null;
  created_at: string;
}

export interface CreateTrlAssessmentInput {
  candidate_id: string;
  trl_level: number;
  evidence_description: string;
  evidence_urls?: string[];
  lab_validated?: boolean;
  relevant_env_validated?: boolean;
  prototype_demonstrated?: boolean;
  system_qualified?: boolean;
  operational_proven?: boolean;
  blockers?: string[];
  next_steps?: string;
  estimated_months_to_next?: number;
  assessed_by?: string;
}

export interface TrlDistribution {
  trl_level: number;
  count: number;
}

// ============================================
// PORTFOLIO INTELLIGENCE: RISK ASSESSMENTS (4M)
// ============================================

export interface SSRiskAssessment {
  id: string;
  candidate_id: string;
  assessment_date: string;
  assessed_by: string | null;
  // Magic
  magic_score: number;
  magic_trl_level: number | null;
  magic_ip_status: IpStatus | null;
  magic_has_tech_advisory: boolean;
  magic_prototype_maturity: PrototypeMaturity | null;
  magic_notes: string | null;
  magic_mitigation_plan: string | null;
  // Market
  market_score: number;
  market_customers_validated: number;
  market_willingness_to_pay: WillingnessToPay | null;
  market_tam_estimate: number | null;
  market_tam_currency: string;
  market_competition_level: CompetitionLevel | null;
  market_notes: string | null;
  market_mitigation_plan: string | null;
  // Management
  management_score: number;
  management_team_size: number;
  management_has_domain_expert: boolean;
  management_has_tech_lead: boolean;
  management_has_business_lead: boolean;
  management_coachability: Coachability | null;
  management_has_advisory_board: boolean;
  management_notes: string | null;
  management_mitigation_plan: string | null;
  // Money
  money_score: number;
  money_monthly_burn: number | null;
  money_runway_months: number | null;
  money_funding_raised: number;
  money_funding_currency: string;
  money_revenue_monthly: number;
  money_has_financial_plan: boolean;
  money_investor_interest_level: InvestorInterestLevel | null;
  money_notes: string | null;
  money_mitigation_plan: string | null;
  // Computed
  overall_risk_score: number;
  overall_risk_level: RiskLevel;
  // Action tracking
  priority_risk: RiskDimension | null;
  action_items: Array<{ action: string; owner?: string; due_date?: string; status?: string }>;
  created_at: string;
}

export interface CreateRiskAssessmentInput {
  candidate_id: string;
  magic_score: number;
  magic_trl_level?: number;
  magic_ip_status?: IpStatus;
  magic_has_tech_advisory?: boolean;
  magic_prototype_maturity?: PrototypeMaturity;
  magic_notes?: string;
  magic_mitigation_plan?: string;
  market_score: number;
  market_customers_validated?: number;
  market_willingness_to_pay?: WillingnessToPay;
  market_tam_estimate?: number;
  market_competition_level?: CompetitionLevel;
  market_notes?: string;
  market_mitigation_plan?: string;
  management_score: number;
  management_team_size?: number;
  management_has_domain_expert?: boolean;
  management_has_tech_lead?: boolean;
  management_has_business_lead?: boolean;
  management_coachability?: Coachability;
  management_has_advisory_board?: boolean;
  management_notes?: string;
  management_mitigation_plan?: string;
  money_score: number;
  money_monthly_burn?: number;
  money_runway_months?: number;
  money_funding_raised?: number;
  money_revenue_monthly?: number;
  money_has_financial_plan?: boolean;
  money_investor_interest_level?: InvestorInterestLevel;
  money_notes?: string;
  money_mitigation_plan?: string;
  priority_risk?: RiskDimension;
  action_items?: Array<{ action: string; owner?: string; due_date?: string; status?: string }>;
  assessed_by?: string;
}

export interface RiskHeatmapEntry {
  candidate_id: string;
  startup_name: string | null;
  stage: NifStage;
  magic_score: number;
  market_score: number;
  management_score: number;
  money_score: number;
  overall_risk_score: number;
  overall_risk_level: RiskLevel;
}

// ============================================
// PORTFOLIO INTELLIGENCE: COMPETITIVE MATRIX
// ============================================

export interface SSCompetitiveMatrix {
  id: string;
  candidate_id: string;
  competitor_name: string;
  competitor_website: string | null;
  competitor_type: CompetitorType;
  attributes: Record<string, { us: number; them: number }>;
  our_advantage: string | null;
  their_advantage: string | null;
  strategic_response: string | null;
  last_updated: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCompetitorInput {
  candidate_id: string;
  competitor_name: string;
  competitor_website?: string;
  competitor_type?: CompetitorType;
  attributes?: Record<string, { us: number; them: number }>;
  our_advantage?: string;
  their_advantage?: string;
  strategic_response?: string;
  updated_by?: string;
}

export interface UpdateCompetitorInput {
  competitor_name?: string;
  competitor_website?: string;
  competitor_type?: CompetitorType;
  attributes?: Record<string, { us: number; them: number }>;
  our_advantage?: string;
  their_advantage?: string;
  strategic_response?: string;
  updated_by?: string;
}

// ============================================
// PORTFOLIO INTELLIGENCE: DASHBOARD
// ============================================

export interface PortfolioDashboardData {
  kpis: {
    active_startups: number;
    avg_trl: number | null;
    avg_risk_score: number | null;
    at_risk_count: number;
  };
  trl_distribution: TrlDistribution[];
  risk_heatmap: RiskHeatmapEntry[];
  attention_needed: Array<SSNifCandidate & { latest_risk_score?: number; risk_level?: RiskLevel }>;
  pipeline_funnel: Record<NifStage, number>;
}

// ============================================
// PORTFOLIO INTELLIGENCE: MENTOR ECOSYSTEM
// ============================================

export type MentorType = 'resident' | 'visiting' | 'industry_expert' | 'academic' | 'investor' | 'alumni' | 'functional';
export type MentorStatus = 'prospect' | 'screening' | 'onboarded' | 'inactive' | 'retired';
export type MatchStatus = 'proposed' | 'active' | 'paused' | 'completed' | 'terminated';
export type SessionMode = 'in_person' | 'virtual' | 'phone';
export type MentorFocusArea =
  | 'sales_marketing' | 'market_research' | 'financing' | 'business_law'
  | 'tax_ip_law' | 'accounting' | 'product_development' | 'hr_recruiting'
  | 'leadership' | 'communications' | 'networking' | 'technology'
  | 'go_to_market' | 'fundraising' | 'governance' | 'other';
export type EvaluationRecommendation = 'continue' | 'reduce_load' | 'retrain' | 'retire';

export interface SSMentor {
  id: string;
  user_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  photo_url: string | null;
  linkedin_url: string | null;
  designation: string | null;
  organization: string | null;
  mentor_type: MentorType;
  status: MentorStatus;
  domain_expertise: string[];
  functional_expertise: string[];
  years_experience: number | null;
  source: string | null;
  referred_by: string | null;
  max_mentees: number;
  current_mentees: number;
  preferred_session_frequency: string;
  preferred_session_mode: string;
  availability_notes: string | null;
  screened_at: string | null;
  screened_by: string | null;
  screening_score: number | null;
  screening_notes: string | null;
  onboarded_at: string | null;
  orientation_completed: boolean;
  nda_signed: boolean;
  agreement_signed: boolean;
  total_sessions: number;
  total_hours: number;
  avg_mentee_rating: number | null;
  startups_mentored: number;
  successful_exits: number;
  institution_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SSMentorMatch {
  id: string;
  mentor_id: string;
  candidate_id: string;
  status: MatchStatus;
  match_reason: string | null;
  matched_by: string | null;
  matched_at: string;
  primary_goal: string | null;
  expected_duration_months: number | null;
  session_frequency: string;
  sessions_completed: number;
  goals_met: string[];
  goals_pending: string[];
  started_at: string | null;
  paused_at: string | null;
  pause_reason: string | null;
  completed_at: string | null;
  completion_reason: string | null;
  terminated_at: string | null;
  termination_reason: string | null;
  mentor_satisfaction: number | null;
  mentee_satisfaction: number | null;
  created_at: string;
  updated_at: string;
  mentor?: SSMentor;
  candidate?: { id: string; startup_name: string | null; stage: string };
}

export interface SSMentorSession {
  id: string;
  match_id: string;
  session_date: string;
  duration_minutes: number;
  mode: SessionMode;
  location: string | null;
  topics_discussed: string[];
  key_takeaways: string | null;
  action_items: string[];
  blockers_identified: string[];
  focus_area: MentorFocusArea | null;
  mentee_progress_notes: string | null;
  next_session_date: string | null;
  mentor_rating_of_session: number | null;
  mentee_rating_of_session: number | null;
  recorded_by: string | null;
  created_at: string;
}

export interface SSMentorEvaluation {
  id: string;
  mentor_id: string;
  evaluation_period_start: string;
  evaluation_period_end: string;
  evaluated_by: string | null;
  sessions_conducted: number;
  total_hours: number;
  mentees_served: number;
  action_items_given: number;
  action_items_completed: number;
  avg_mentee_satisfaction: number | null;
  domain_relevance_score: number | null;
  communication_score: number | null;
  availability_score: number | null;
  impact_score: number | null;
  overall_rating: number | null;
  strengths: string | null;
  areas_for_improvement: string | null;
  recommendation: EvaluationRecommendation | null;
  created_at: string;
}

export interface CreateMentorInput {
  name: string;
  email?: string;
  phone?: string;
  mentor_type: MentorType;
  domain_expertise: string[];
  user_id?: string;
  designation?: string;
  organization?: string;
  functional_expertise?: string[];
  years_experience?: number;
  source?: string;
  referred_by?: string;
  max_mentees?: number;
  preferred_session_frequency?: string;
  preferred_session_mode?: string;
  institution_id?: string;
}

export interface UpdateMentorInput {
  name?: string;
  email?: string;
  phone?: string;
  mentor_type?: MentorType;
  status?: MentorStatus;
  domain_expertise?: string[];
  functional_expertise?: string[];
  designation?: string;
  organization?: string;
  years_experience?: number;
  max_mentees?: number;
  preferred_session_frequency?: string;
  preferred_session_mode?: string;
  availability_notes?: string;
  screening_score?: number;
  screening_notes?: string;
  linkedin_url?: string;
  photo_url?: string;
}

export interface CreateMatchInput {
  mentor_id: string;
  candidate_id: string;
  match_reason?: string;
  matched_by?: string;
  primary_goal?: string;
  expected_duration_months?: number;
  session_frequency?: string;
}

export interface LogSessionInput {
  match_id: string;
  session_date: string;
  duration_minutes: number;
  mode?: SessionMode;
  location?: string;
  topics_discussed: string[];
  key_takeaways?: string;
  action_items?: string[];
  blockers_identified?: string[];
  focus_area?: MentorFocusArea;
  mentee_progress_notes?: string;
  next_session_date?: string;
  mentor_rating_of_session?: number;
  mentee_rating_of_session?: number;
  recorded_by?: string;
}

export interface MentorFilters {
  status?: MentorStatus;
  mentor_type?: MentorType;
  domain?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface MentorDashboardData {
  total_mentors: number;
  active_mentors: number;
  active_matches: number;
  sessions_this_month: number;
  avg_satisfaction: number | null;
  top_domains: Array<{ domain: string; count: number }>;
  utilization: Array<{
    mentor_id: string;
    name: string;
    current_mentees: number;
    max_mentees: number;
    utilization_pct: number;
  }>;
}

// ============================================
// GRADUATION & EXIT
// ============================================

export interface SSGraduationCriteria {
  id: string;
  name: string;
  description: string | null;
  criteria_type: string;
  threshold_value: number | null;
  threshold_unit: string | null;
  is_active: boolean;
  min_criteria_to_graduate: number;
  institution_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SSGraduationEvaluation {
  id: string;
  candidate_id: string;
  evaluation_date: string;
  evaluated_by: string | null;
  criteria_results: Array<{
    criteria_id: string;
    criteria_name: string;
    met: boolean;
    evidence?: string;
    value?: number;
  }>;
  criteria_met_count: number;
  is_graduation_ready: boolean;
  decision: 'graduate' | 'extend' | 'exit_non_performance' | 'defer' | null;
  decision_notes: string | null;
  decision_by: string | null;
  extension_months: number | null;
  extension_conditions: string | null;
  graduation_type: 'successful' | 'time_limit' | 'capacity' | 'acquisition' | null;
  created_at: string;
}

export interface SSExitProcedure {
  id: string;
  candidate_id: string;
  exit_type: 'graduation' | 'voluntary' | 'non_performance' | 'acquisition' | 'closure';
  notice_given_at: string | null;
  notice_period_days: number;
  fees_outstanding: number;
  fees_reconciled: boolean;
  deposit_returned: boolean;
  exit_interview_completed: boolean;
  exit_interview_notes: string | null;
  ip_agreements_settled: boolean;
  nda_status: string;
  equipment_returned: boolean;
  access_revoked: boolean;
  alumni_network_joined: boolean;
  testimonial_provided: boolean;
  exit_initiated_at: string;
  exit_completed_at: string | null;
  processed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SSAlumniTracking {
  id: string;
  candidate_id: string;
  tracking_year: number;
  tracking_date: string;
  is_operational: boolean;
  pivot_description: string | null;
  annual_revenue: number | null;
  revenue_currency: string;
  revenue_growth_pct: number | null;
  total_funding_raised: number | null;
  latest_funding_round: string | null;
  latest_valuation: number | null;
  employees_count: number;
  jobs_created_this_year: number;
  customers_count: number;
  patents_filed: number;
  patents_granted: number;
  awards: string[];
  media_mentions: number;
  is_mentor_back: boolean;
  is_investor_back: boolean;
  referred_startups: number;
  incubator_helpfulness_rating: number | null;
  most_valuable_support: string | null;
  improvement_suggestion: string | null;
  recorded_by: string | null;
  created_at: string;
  candidate?: { id: string; startup_name: string | null; stage: string };
}

export interface CreateGraduationCriteriaInput {
  name: string;
  description?: string;
  criteria_type: string;
  threshold_value?: number;
  threshold_unit?: string;
  is_active?: boolean;
  min_criteria_to_graduate?: number;
  institution_id?: string;
}

export interface CreateExitProcedureInput {
  candidate_id: string;
  exit_type: string;
  notice_period_days?: number;
  fees_outstanding?: number;
}

export interface TrackAlumniInput {
  candidate_id: string;
  tracking_year: number;
  is_operational?: boolean;
  pivot_description?: string;
  annual_revenue?: number;
  revenue_growth_pct?: number;
  total_funding_raised?: number;
  latest_funding_round?: string;
  latest_valuation?: number;
  employees_count?: number;
  jobs_created_this_year?: number;
  customers_count?: number;
  patents_filed?: number;
  patents_granted?: number;
  awards?: string[];
  is_mentor_back?: boolean;
  is_investor_back?: boolean;
  referred_startups?: number;
  incubator_helpfulness_rating?: number;
  most_valuable_support?: string;
  improvement_suggestion?: string;
  recorded_by?: string;
}

export interface AlumniMetrics {
  total_alumni: number;
  operational_count: number;
  operational_pct: number;
  total_revenue: number;
  total_jobs: number;
  total_funding: number;
  give_back_mentors: number;
  give_back_investors: number;
  avg_helpfulness_rating: number | null;
}

// ============================================
// FINANCE, GOVERNANCE & COMPLIANCE (Phase 5)
// ============================================

export type GrantAuditStatus = 'pending' | 'in_progress' | 'completed' | 'flagged';

export type RevenueSource =
  | 'rental_income' | 'service_fees' | 'equity_returns' | 'licensing_ip'
  | 'event_sponsorship' | 'corporate_partnership' | 'government_grant'
  | 'consulting' | 'training_programs' | 'other';

export type AuditType = 'internal_quarterly' | 'external_annual' | 'grant_specific' | 'special';

export type AuditRecordStatus = 'scheduled' | 'in_progress' | 'completed' | 'findings_open';

export type GovernanceBody =
  | 'board_of_directors' | 'advisory_council' | 'finance_audit_committee'
  | 'startup_selection_committee' | 'hr_compliance_committee' | 'internal_complaints_committee';

export type GovernanceRole = 'chairperson' | 'member' | 'secretary' | 'ex_officio' | 'invitee';

export type ComplianceCategory = 'legal' | 'financial' | 'hr' | 'startup' | 'reporting' | 'safety';

export type ComplianceFrequency = 'one_time' | 'monthly' | 'quarterly' | 'annually' | 'as_needed';

export type ComplianceStatus = 'pending' | 'in_progress' | 'completed' | 'overdue' | 'not_applicable';

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
  audit_status: GrantAuditStatus;
  purpose: string | null;
  allowed_heads: string[] | null;
  reporting_frequency: string;
  last_report_date: string | null;
  next_report_due: string | null;
  institution_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateGrantInput {
  name: string;
  funder: string;
  grant_number?: string;
  sanctioned_amount: number;
  received_amount?: number;
  utilized_amount?: number;
  currency?: string;
  sanction_date?: string;
  start_date?: string;
  end_date?: string;
  purpose?: string;
  allowed_heads?: string[];
  reporting_frequency?: string;
  institution_id?: string;
}

export interface UpdateGrantInput {
  name?: string;
  funder?: string;
  grant_number?: string;
  sanctioned_amount?: number;
  received_amount?: number;
  utilized_amount?: number;
  sanction_date?: string;
  start_date?: string;
  end_date?: string;
  uc_submitted?: boolean;
  uc_submitted_at?: string;
  audit_status?: GrantAuditStatus;
  purpose?: string;
  allowed_heads?: string[];
  reporting_frequency?: string;
  last_report_date?: string;
  next_report_due?: string;
}

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
  institution_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateBudgetInput {
  fiscal_year: string;
  quarter?: string;
  category: string;
  subcategory?: string;
  allocated_amount: number;
  spent_amount?: number;
  committed_amount?: number;
  grant_id?: string;
  notes?: string;
  approved_by?: string;
  institution_id?: string;
}

export interface UpdateBudgetInput {
  allocated_amount?: number;
  spent_amount?: number;
  committed_amount?: number;
  notes?: string;
  approved_by?: string;
}

export interface SSRevenue {
  id: string;
  fiscal_year: string;
  month: number | null;
  source: RevenueSource;
  amount: number;
  currency: string;
  description: string | null;
  is_self_generated: boolean;
  institution_id: string | null;
  created_at: string;
}

export interface RecordRevenueInput {
  fiscal_year: string;
  month?: number;
  source: RevenueSource;
  amount: number;
  currency?: string;
  description?: string;
  is_self_generated?: boolean;
  institution_id?: string;
}

export interface SSAuditRecord {
  id: string;
  audit_type: AuditType;
  audit_period_start: string;
  audit_period_end: string;
  auditor_name: string | null;
  auditor_organization: string | null;
  status: AuditRecordStatus;
  findings_count: number;
  critical_findings: number;
  findings_details: any[];
  management_response: string | null;
  action_plan: any[];
  all_findings_resolved: boolean;
  report_url: string | null;
  institution_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateAuditRecordInput {
  audit_type: AuditType;
  audit_period_start: string;
  audit_period_end: string;
  auditor_name?: string;
  auditor_organization?: string;
  institution_id?: string;
}

export interface UpdateAuditRecordInput {
  status?: AuditRecordStatus;
  auditor_name?: string;
  auditor_organization?: string;
  findings_count?: number;
  critical_findings?: number;
  findings_details?: any[];
  management_response?: string;
  action_plan?: any[];
  all_findings_resolved?: boolean;
  report_url?: string;
}

export interface SSGovernanceMember {
  id: string;
  name: string;
  designation: string | null;
  organization: string | null;
  email: string | null;
  phone: string | null;
  body: GovernanceBody;
  role: GovernanceRole;
  term_start: string | null;
  term_end: string | null;
  is_active: boolean;
  coi_declaration_filed: boolean;
  coi_details: string | null;
  institution_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateGovernanceMemberInput {
  name: string;
  designation?: string;
  organization?: string;
  email?: string;
  phone?: string;
  body: GovernanceBody;
  role: GovernanceRole;
  term_start?: string;
  term_end?: string;
  is_active?: boolean;
  coi_declaration_filed?: boolean;
  coi_details?: string;
  institution_id?: string;
}

export interface UpdateGovernanceMemberInput {
  name?: string;
  designation?: string;
  organization?: string;
  email?: string;
  phone?: string;
  body?: GovernanceBody;
  role?: GovernanceRole;
  term_start?: string;
  term_end?: string;
  is_active?: boolean;
  coi_declaration_filed?: boolean;
  coi_details?: string;
}

export interface SSComplianceItem {
  id: string;
  category: ComplianceCategory;
  requirement: string;
  description: string | null;
  frequency: ComplianceFrequency;
  status: ComplianceStatus;
  due_date: string | null;
  completed_date: string | null;
  completed_by: string | null;
  evidence_url: string | null;
  notes: string | null;
  reminder_days_before: number;
  is_critical: boolean;
  institution_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateComplianceItemInput {
  category: ComplianceCategory;
  requirement: string;
  description?: string;
  frequency: ComplianceFrequency;
  due_date?: string;
  is_critical?: boolean;
  reminder_days_before?: number;
  institution_id?: string;
}

export interface UpdateComplianceStatusInput {
  status: ComplianceStatus;
  completed_date?: string;
  completed_by?: string;
  evidence_url?: string;
  notes?: string;
}

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
  // Infrastructure pillar
  infra_score: number | null;
  infra_physical_facilities: number | null;
  infra_it_systems: number | null;
  infra_lab_equipment: number | null;
  infra_connectivity: number | null;
  infra_co_working_space: number | null;
  // Finance pillar
  finance_score: number | null;
  finance_budget_process: number | null;
  finance_audit_compliance: number | null;
  finance_grant_management: number | null;
  finance_sustainability_plan: number | null;
  // Board / Governance pillar
  board_score: number | null;
  board_governance_structure: number | null;
  board_meeting_regularity: number | null;
  board_committee_formation: number | null;
  board_strategic_planning: number | null;
  // HR pillar
  hr_score: number | null;
  hr_staff_capacity: number | null;
  hr_training_programs: number | null;
  hr_mentor_network: number | null;
  hr_policies_in_place: number | null;
  // Legal pillar
  legal_score: number | null;
  legal_registration_complete: number | null;
  legal_ip_policy: number | null;
  legal_incubation_policy: number | null;
  legal_sop_documentation: number | null;
  // Summary
  weakest_pillar: string | null;
  improvement_plan: string | null;
  institution_id: string | null;
  created_at: string;
}

export interface CreateReadinessAssessmentInput {
  assessed_by?: string;
  assessment_date?: string;
  // Infrastructure
  infra_physical_facilities?: number;
  infra_it_systems?: number;
  infra_lab_equipment?: number;
  infra_connectivity?: number;
  infra_co_working_space?: number;
  // Finance
  finance_budget_process?: number;
  finance_audit_compliance?: number;
  finance_grant_management?: number;
  finance_sustainability_plan?: number;
  // Board
  board_governance_structure?: number;
  board_meeting_regularity?: number;
  board_committee_formation?: number;
  board_strategic_planning?: number;
  // HR
  hr_staff_capacity?: number;
  hr_training_programs?: number;
  hr_mentor_network?: number;
  hr_policies_in_place?: number;
  // Legal
  legal_registration_complete?: number;
  legal_ip_policy?: number;
  legal_incubation_policy?: number;
  legal_sop_documentation?: number;
  // Summary
  improvement_plan?: string;
  institution_id?: string;
}

export interface SustainabilityMetrics {
  self_generated_ratio: number;
  total_revenue: number;
  grant_income: number;
  self_income: number;
}

export interface GrantUtilization {
  id: string;
  name: string;
  funder: string;
  sanctioned_amount: number;
  received_amount: number;
  utilized_amount: number;
  utilization_pct: number;
  remaining: number;
  end_date: string | null;
  days_remaining: number | null;
  audit_status: GrantAuditStatus;
}

// ============================================
// KPI & IMPACT FRAMEWORK (Phase 4)
// ============================================

export type KpiFramework = 'dst' | 'msh' | 'moe_innovation_cell' | 'nirf' | 'internal' | 'custom';
export type KpiCategory = 'input' | 'output' | 'outcome' | 'impact';
export type KpiDataType = 'integer' | 'decimal' | 'currency' | 'percentage' | 'boolean' | 'text';
export type KpiCollectionFrequency = 'monthly' | 'quarterly' | 'annually' | 'real_time';
export type ImpactReportType = 'annual_report' | 'quarterly_report' | 'funder_specific' | 'nirf_submission' | 'custom';
export type ImpactReportAudience = 'funders' | 'board' | 'startups' | 'policymakers' | 'public' | 'custom';
export type ImpactReportStatus = 'draft' | 'review' | 'approved' | 'published';

export interface KpiDefinition {
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
  institution_id: string | null;
  created_at: string;
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
  institution_id: string | null;
  created_at: string;
}

export interface ImpactReport {
  id: string;
  report_title: string;
  report_type: ImpactReportType;
  target_audience: ImpactReportAudience;
  period_start: string | null;
  period_end: string | null;
  executive_summary: string | null;
  startup_highlights: any[];
  kpi_snapshot: Record<string, any>;
  report_url: string | null;
  infographic_url: string | null;
  status: ImpactReportStatus;
  approved_by: string | null;
  published_at: string | null;
  institution_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface KpiDashboardData {
  kpis_by_framework: Record<string, Array<KpiDefinition & { latest_value?: number; latest_period_end?: string }>>;
  overall_compliance: {
    total: number;
    measured: number;
    unmeasured: number;
    compliance_pct: number;
  };
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
  institutionId?: string;
}

export interface ImpactReportFilters {
  status?: ImpactReportStatus;
  report_type?: ImpactReportType;
  institutionId?: string;
}

export interface CreateKpiDefinitionInput {
  name: string;
  code: string;
  description?: string;
  framework: KpiFramework;
  category: KpiCategory;
  data_type: KpiDataType;
  unit?: string;
  measurement_method?: string;
  target_value?: number;
  target_period?: string;
  collection_frequency?: KpiCollectionFrequency;
  source_table?: string;
  source_query?: string;
  is_auto_calculated?: boolean;
  relevant_to?: string[];
  is_active?: boolean;
  institution_id?: string;
}

export interface UpdateKpiDefinitionInput {
  name?: string;
  code?: string;
  description?: string;
  framework?: KpiFramework;
  category?: KpiCategory;
  data_type?: KpiDataType;
  unit?: string;
  measurement_method?: string;
  target_value?: number;
  target_period?: string;
  collection_frequency?: KpiCollectionFrequency;
  source_table?: string;
  source_query?: string;
  is_auto_calculated?: boolean;
  relevant_to?: string[];
  is_active?: boolean;
}

export interface RecordMeasurementInput {
  period_start: string;
  period_end: string;
  value: number;
  notes?: string;
  data_source?: string;
  institution_id?: string;
}

export interface CreateImpactReportInput {
  report_title: string;
  report_type: ImpactReportType;
  target_audience: ImpactReportAudience;
  period_start?: string;
  period_end?: string;
  executive_summary?: string;
  startup_highlights?: any[];
  kpi_snapshot?: Record<string, any>;
  report_url?: string;
  infographic_url?: string;
  status?: ImpactReportStatus;
  approved_by?: string;
  published_at?: string;
  institution_id?: string;
}

export interface UpdateImpactReportInput {
  report_title?: string;
  report_type?: ImpactReportType;
  target_audience?: ImpactReportAudience;
  period_start?: string;
  period_end?: string;
  executive_summary?: string;
  startup_highlights?: any[];
  kpi_snapshot?: Record<string, any>;
  report_url?: string;
  infographic_url?: string;
  status?: ImpactReportStatus;
  approved_by?: string;
  published_at?: string;
}

// ============================================
// MARKETING & OUTREACH (Phase 6)
// ============================================

export type MarketingActivityType =
  | 'awareness_campaign'
  | 'workshop'
  | 'demo_day'
  | 'media_coverage'
  | 'social_media'
  | 'website_update'
  | 'brochure'
  | 'newsletter'
  | 'podcast'
  | 'webinar'
  | 'conference'
  | 'stakeholder_visit'
  | 'other';

export type MarketingActivityStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled';

export interface SSMarketingActivity {
  id: string;
  activity_type: MarketingActivityType;
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
  status: MarketingActivityStatus;
  conducted_by: string | null;
  institution_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateMarketingActivityInput {
  activity_type: MarketingActivityType;
  title: string;
  description?: string;
  target_audience?: string;
  date_start?: string;
  date_end?: string;
  budget?: number;
  actual_cost?: number;
  reach_count?: number;
  leads_generated?: number;
  applications_from_activity?: number;
  media_links?: string[];
  photos?: string[];
  roi_notes?: string;
  status?: MarketingActivityStatus;
  conducted_by?: string;
  institution_id?: string;
}

export type UpdateMarketingActivityInput = Partial<CreateMarketingActivityInput>;

export interface MarketingDashboard {
  total_activities: number;
  total_reach: number;
  total_leads: number;
  total_applications: number;
  avg_roi: number;
  by_type_breakdown: Array<{
    activity_type: MarketingActivityType;
    count: number;
    reach: number;
    leads: number;
  }>;
  monthly_trend: Array<{
    month: string;
    activities: number;
    reach: number;
    leads: number;
  }>;
}
