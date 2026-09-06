/**
 * HR Recruitment Need Signal — TypeScript Types
 *
 * Maps to 3 migrations:
 *   - 20260524000000_hr_recruitment_need_foundation.sql (7 tables)
 *   - 20260525000000_hr_recruitment_need_signal_tables.sql (7 tables)
 *   - 20260525100000_hr_recruitment_need_signal_rpc.sql (custom type + 8 RPCs)
 *
 * Spec: specs/hr-recruitment-need-signal-2026-05-24.md
 */

// ─── Signal Input Result (mirrors pg custom type hr_signal_input_result) ────────

export type SignalStatus = 'green' | 'amber' | 'red' | 'insufficient_data';
export type OverallSignalStatus = 'green' | 'amber' | 'red' | 'blocked' | 'insufficient_data';

export interface HRSignalInputResult {
  input_key: string;
  status: SignalStatus;
  value: number | null;
  norm: number | null;
  gap: number | null;
  pct_of_norm: number | null;
  raw_data: Record<string, unknown> | null;
}

// ─── Signal Input Keys ──────────────────────────────────────────────────────────

export type SignalInputKey =
  | 'sanctioned_gap'
  | 'sfr'
  | 'specialization_gap'
  | 'workload'
  | 'projected_intake'
  | 'attrition_pipeline'
  | 'peer_benchmark';

// ─── Signal Cache (hr_recruitment_signal_cache) ─────────────────────────────────

export type GranularityLevel = 'program' | 'department';

export interface HRRecruitmentSignalCache {
  id: string;
  institution_id: string;
  program_id: string | null;
  department_id: string | null;
  granularity_level: GranularityLevel;
  composite_score: number | null;
  input_signals: Record<SignalInputKey, {
    status: SignalStatus;
    value: number | null;
    norm: number | null;
    gap: number | null;
    pct_of_norm: number | null;
  }>;
  overall_status: OverallSignalStatus;
  blocked_inputs: string[] | null;
  computed_at: string;
  computed_by_function: string | null;
  financial_year: string | null;
  raw_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// ─── Signal Inputs Registry (hr_recruitment_signal_inputs) ──────────────────────

export interface HRRecruitmentSignalInput {
  id: string;
  input_key: SignalInputKey;
  label: string;
  description: string | null;
  computation_function_ref: string | null;
  default_weight: number;
  is_active: boolean;
  is_system: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

// ─── Signal Suppressions (hr_recruitment_signal_suppressions) ────────────────────

export interface HRRecruitmentSignalSuppression {
  id: string;
  institution_id: string;
  program_id: string | null;
  department_id: string | null;
  suppressed_by: string;
  reason: string;
  suppress_until: string;
  unsnoozed_at: string | null;
  unsnoozed_reason: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface HRRecruitmentSignalSuppressionInsert {
  institution_id: string;
  program_id?: string | null;
  department_id?: string | null;
  reason: string;
  suppress_until: string;
}

// ─── Escalations (hr_recruitment_escalations) ───────────────────────────────────

export type EscalationStatus = 'pending' | 'acknowledged' | 'resolved' | 'dismissed';

export interface HRRecruitmentEscalation {
  id: string;
  institution_id: string;
  program_id: string | null;
  department_id: string | null;
  escalated_by: string;
  reason: string;
  status: EscalationStatus;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  documents: Record<string, unknown>[] | null;
  created_at: string;
  updated_at: string;
}

export interface HRRecruitmentEscalationInsert {
  institution_id: string;
  program_id?: string | null;
  department_id?: string | null;
  reason: string;
  documents?: Record<string, unknown>[] | null;
}

export interface HRRecruitmentEscalationUpdate {
  status?: EscalationStatus;
  resolution_notes?: string;
}

// ─── User Visits (hr_recruitment_user_visits) ───────────────────────────────────

export interface HRRecruitmentUserVisit {
  id: string;
  user_id: string;
  last_visited_at: string;
  signals_at_visit: Record<string, unknown> | null;
}

// ─── Signal Snapshots (hr_recruitment_signal_snapshots) ─────────────────────────

export interface HRRecruitmentSignalSnapshot {
  id: string;
  snapshot_name: string;
  snapshot_description: string | null;
  taken_by: string;
  taken_at: string;
  financial_year: string | null;
  scope_institution_id: string | null;
  signal_data: Record<string, unknown>;
  metadata: Record<string, unknown> | null;
  is_archived: boolean;
  created_at: string;
}

export interface HRRecruitmentSignalSnapshotInsert {
  snapshot_name: string;
  snapshot_description?: string | null;
  financial_year?: string | null;
  scope_institution_id?: string | null;
  signal_data: Record<string, unknown>;
  metadata?: Record<string, unknown> | null;
}

// ─── Faculty Workload (hr_faculty_workload) ─────────────────────────────────────

export type WorkloadSource = 'manual' | 'timetable_import' | 'self_report';

export interface HRFacultyWorkload {
  id: string;
  staff_id: string;
  institution_id: string;
  academic_year: string;
  semester: 1 | 2;
  weekly_contact_hours: number;
  weekly_admin_hours: number | null;
  weekly_research_hours: number | null;
  source: WorkloadSource;
  entered_by: string | null;
  verified_at: string | null;
  verified_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Foundation Tables ──────────────────────────────────────────────────────────

export interface HRRegulatoryBody {
  id: string;
  name: string;
  abbreviation: string;
  description: string | null;
  website_url: string | null;
  is_active: boolean;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface HRSpecialization {
  id: string;
  name: string;
  body_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface HRRegulatoryNorm {
  id: string;
  body_id: string;
  program_type: string;
  sfr_norm_ratio: number;
  sfr_denominator_type: 'student' | 'bed' | 'custom';
  count_adjunct: boolean;
  adjunct_weight: number;
  count_visiting: boolean;
  visiting_weight: number;
  threshold_amber_pct: number;
  threshold_red_pct: number;
  computation_function_ref: string | null;
  effective_from: string | null;
  effective_until: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface InstitutionProgramApproval {
  id: string;
  institution_id: string;
  program_id: string;
  body_id: string;
  sanctioned_faculty_count: number;
  approved_intake: number | null;
  approval_date: string | null;
  renewal_due_date: string | null;
  approval_reference: string | null;
  norm_version_at_approval: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface HRStaffInstitutionAllocation {
  id: string;
  staff_id: string;
  institution_id: string;
  allocation_percentage: number;
  academic_year: string | null;
  effective_from: string;
  effective_until: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface HRPeerBenchmark {
  id: string;
  institution_name: string;
  naac_grade: string | null;
  program_type: string;
  faculty_count: number | null;
  student_count: number | null;
  sfr_ratio: number | null;
  source_url: string | null;
  data_year: number | null;
  notes: string | null;
  entered_by: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Compute Signal Parameters ──────────────────────────────────────────────────

export interface ComputeSignalParams {
  institution_id: string;
  program_id?: string | null;
}

export interface SignalFilters {
  institution_id?: string;
  program_id?: string | null;
  overall_status?: OverallSignalStatus;
}
