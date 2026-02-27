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
  screenshots: any[];
  category: string | null;
  status: SubmissionStatus;
  submission_number: string | null;
  score: number | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SSJudgeScore {
  id: string;
  submission_id: string;
  judge_id: string;
  track_id: string | null;
  problem_impact: number | null;
  solution_innovation: number | null;
  working_prototype: number | null;
  user_validation: number | null;
  presentation_quality: number | null;
  bioconvergence_alignment: number | null;
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
