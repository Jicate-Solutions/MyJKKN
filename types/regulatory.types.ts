// ============================================================================
// MyJKKN Regulatory Framework Engine - TypeScript Types
// Version: 1.1
// Created: 2026-02-23
// Updated: 2026-02-23
// Source: REGULATORY-FRAMEWORK-ENGINE-SPEC.md (15 tables + 1 view + OKR integration)
// ============================================================================

// ============================================================================
// ENUMS (Union Types)
// ============================================================================

/** Framework lifecycle status */
export type FrameworkStatus = 'active' | 'draft' | 'archived'

/** Framework category */
export type FrameworkType = 'accreditation' | 'ranking' | 'compliance' | 'reporting'

/** Institution type for frameworks with type-specific weights (e.g., NAAC Binary) */
export type InstitutionType = 'university' | 'autonomous_college' | 'affiliated_college'

/** Academic year system used by the framework */
export type YearType = 'academic' | 'calendar'

/** Submission workflow status */
export type SubmissionStatus =
  | 'draft'
  | 'data_collection'
  | 'in_review'
  | 'approved'
  | 'submitted'
  | 'accepted'

/** Data type for metric values */
export type MetricDataType =
  | 'number'
  | 'percentage'
  | 'ratio'
  | 'boolean'
  | 'text'
  | 'date'
  | 'json'
  | 'file'
  | 'currency'

/** Type of evidence document */
export type EvidenceType = 'supporting' | 'primary' | 'certificate' | 'screenshot'

/** Type of change recorded in metric value history */
export type MetricValueChangeType =
  | 'auto_refresh'
  | 'manual_entry'
  | 'manual_override'
  | 'verification'

/** Data connector output format */
export type ConnectorOutputType = 'single_value' | 'table' | 'aggregation'

/** Data connector test status */
export type ConnectorTestStatus = 'success' | 'error' | 'warning'

/** Type of regulatory peer visit */
export type VisitType = 'naac_peer_team' | 'nba_evaluator' | 'aicte_expert'

/** Peer visit lifecycle status */
export type VisitStatus =
  | 'scheduled'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'postponed'
  | 'cancelled'

/** Governing body / committee type */
export type BodyType =
  | 'governing_body'
  | 'academic_council'
  | 'bos'
  | 'iqac'
  | 'finance_committee'
  | 'exam_committee'
  | 'anti_ragging'
  | 'icc'
  | 'grievance_cell'

/** Meeting frequency for governing bodies */
export type MeetingFrequency =
  | 'monthly'
  | 'quarterly'
  | 'biannual'
  | 'annual'
  | 'as_needed'

/** Resolution status in body meetings */
export type ResolutionStatus = 'approved' | 'deferred' | 'rejected'

/** Syllabus revision status */
export type SyllabusRevisionStatus = 'current' | 'under_revision' | 'archived'

// ============================================================================
// JSONB SUB-INTERFACES
// ============================================================================

/** Member of a peer visit team (stored in team_composition jsonb) */
export interface PeerVisitTeamMember {
  name: string
  designation: string
  institution: string
  role: string
}

/** Single item in a peer visit itinerary */
export interface VisitItineraryItem {
  day: number | string
  time: string
  activity: string
  location: string
  responsible_person: string
}

/** Action item used across peer visits, meetings, etc. */
export interface ActionItem {
  action: string
  responsible: string
  deadline: string
  status: string
}

/** Member of a governing body (stored in members jsonb) */
export interface GoverningBodyMember {
  name: string
  designation: string
  role_in_body: string
  affiliation: string
  member_type: string
  nominated_by?: string
  tenure_start?: string
  tenure_end?: string
}

/** Single agenda item for a body meeting */
export interface AgendaItem {
  item_number: number | string
  topic: string
  presented_by: string
}

/** Resolution passed in a body meeting */
export interface MeetingResolution {
  resolution_number: string
  text: string
  status: ResolutionStatus
}

/** Course Outcome mapping entry (CO-PO for NBA) */
export interface COPOMapping {
  co: string
  po: string
  level: number
}

// ============================================================================
// TABLE 1: regulatory_frameworks
// ============================================================================

/** Database row for regulatory_frameworks */
export interface RegulatoryFrameworkRow {
  id: string
  /** NULL = global template available to all institutions */
  institution_id: string | null
  /** Display name, e.g. "NAAC SSR 2022 Revised" */
  name: string
  /** Regulatory body: "NAAC", "NIRF", "NBA", "AICTE", "UGC" */
  body: string
  /** accreditation | ranking | compliance | reporting */
  framework_type: FrameworkType
  /** NULL = universal; institution-type-specific for frameworks like NAAC Binary */
  institution_type: InstitutionType | null
  /** Version identifier, e.g. "2022-rev", "2025" */
  version: string
  effective_from: string | null
  /** NULL = currently active */
  effective_to: string | null
  /** academic | calendar (NIRF=calendar, NAAC=academic) */
  year_type: YearType
  status: FrameworkStatus
  /** Maximum possible score, e.g. 1050 for NAAC Old, 900 for NAAC Binary, 100 for NIRF */
  total_max_score: number | null
  description: string | null
  /** URL of the regulatory submission portal */
  submission_portal_url: string | null
  submission_deadline: string | null
  /** Unique short code: 'NIRF_2025_OVERALL', 'NAAC_BINARY_2024' */
  code: string | null
  /** Body-specific config; NBA includes program_type: {"program_type":"B.Tech"} */
  metadata: Record<string, unknown>
  created_by: string | null
  created_at: string
  updated_at: string
}

/** Insert DTO for regulatory_frameworks (omits server-generated fields) */
export interface RegulatoryFrameworkInsert {
  institution_id?: string | null
  name: string
  body: string
  framework_type?: FrameworkType
  institution_type?: InstitutionType | null
  version: string
  effective_from?: string | null
  effective_to?: string | null
  year_type?: YearType
  status?: FrameworkStatus
  total_max_score?: number | null
  description?: string | null
  submission_portal_url?: string | null
  submission_deadline?: string | null
  code?: string | null
  metadata?: Record<string, unknown>
  created_by?: string | null
}

/** Update DTO for regulatory_frameworks (all fields optional except id) */
export interface RegulatoryFrameworkUpdate {
  id: string
  institution_id?: string | null
  name?: string
  body?: string
  framework_type?: FrameworkType
  institution_type?: InstitutionType | null
  version?: string
  effective_from?: string | null
  effective_to?: string | null
  year_type?: YearType
  status?: FrameworkStatus
  total_max_score?: number | null
  description?: string | null
  submission_portal_url?: string | null
  submission_deadline?: string | null
  code?: string | null
  metadata?: Record<string, unknown>
  created_by?: string | null
}

// ============================================================================
// TABLE 2: regulatory_criteria
// ============================================================================

/** Database row for regulatory_criteria (hierarchical criteria tree) */
export interface RegulatoryCriteriaRow {
  id: string
  framework_id: string
  /** NULL = top-level criterion */
  parent_criteria_id: string | null
  /** Criterion code: "I", "1.1", "TLR", "TLR-1" */
  code: string
  /** Criterion name: "Curricular Aspects" */
  name: string
  description: string | null
  /**
   * Weight interpretation varies by framework:
   * - NIRF: fractional (0.30 = 30%)
   * - NAAC Old: absolute max points (e.g., 150, 350)
   * - NAAC Binary: absolute points per attribute (e.g., 75, 50)
   * - NBA/AICTE/UGC: percentage contribution (0-100)
   */
  weight: number | null
  /** Maximum points for this criterion */
  max_score: number | null
  sort_order: number
  /** Some criteria are descriptive, not numeric */
  is_qualitative: boolean
  /** Whether this criterion requires evidence upload */
  evidence_required: boolean
  /** NAAC DVV guidance, tips */
  guidance_notes: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

/** Insert DTO for regulatory_criteria */
export interface RegulatoryCriteriaInsert {
  framework_id: string
  parent_criteria_id?: string | null
  code: string
  name: string
  description?: string | null
  weight?: number | null
  max_score?: number | null
  sort_order?: number
  is_qualitative?: boolean
  evidence_required?: boolean
  guidance_notes?: string | null
  metadata?: Record<string, unknown>
}

/** Update DTO for regulatory_criteria */
export interface RegulatoryCriteriaUpdate {
  id: string
  parent_criteria_id?: string | null
  code?: string
  name?: string
  description?: string | null
  weight?: number | null
  max_score?: number | null
  sort_order?: number
  is_qualitative?: boolean
  evidence_required?: boolean
  guidance_notes?: string | null
  metadata?: Record<string, unknown>
}

// ============================================================================
// TABLE 3: regulatory_metrics
// ============================================================================

/** Database row for regulatory_metrics (individual data points within criteria) */
export interface RegulatoryMetricRow {
  id: string
  criteria_id: string
  /** Metric code: "1.1.1", "SSR-2.1" */
  code: string
  /** Metric name: "Number of programs with CBCS/elective" */
  name: string
  description: string | null
  /** Data type for this metric's value */
  data_type: MetricDataType
  /** Unit of measurement: "count", "%", "INR lakhs", "ratio", "years" */
  unit: string | null
  /** Calculation formula, e.g. "(placed_count / eligible_count) * 100" */
  formula: string | null
  /** Metric codes that this formula depends on */
  formula_dependencies: string[] | null
  /** Primary data connector reference (e.g., "DC-01") */
  data_connector_id: string | null
  /** SQL or query config for pulling data from the connector */
  data_connector_query: string | null
  /** Whether the metric can be auto-calculated from existing data */
  is_auto_calculable: boolean
  /** Whether evidence documents are required for this metric */
  requires_evidence: boolean
  /** Minimum acceptable value for validation */
  validation_min: number | null
  /** Maximum acceptable value for validation */
  validation_max: number | null
  /** Regex pattern for text-based validation */
  validation_regex: string | null
  sort_order: number
  /** NAAC DVV-specific clarification text */
  dvv_guidance: string | null
  /** Additional config; may include secondary_connectors: ["DC-29"] */
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

/** Insert DTO for regulatory_metrics */
export interface RegulatoryMetricInsert {
  criteria_id: string
  code: string
  name: string
  description?: string | null
  data_type?: MetricDataType
  unit?: string | null
  formula?: string | null
  formula_dependencies?: string[] | null
  data_connector_id?: string | null
  data_connector_query?: string | null
  is_auto_calculable?: boolean
  requires_evidence?: boolean
  validation_min?: number | null
  validation_max?: number | null
  validation_regex?: string | null
  sort_order?: number
  dvv_guidance?: string | null
  metadata?: Record<string, unknown>
}

/** Update DTO for regulatory_metrics */
export interface RegulatoryMetricUpdate {
  id: string
  code?: string
  name?: string
  description?: string | null
  data_type?: MetricDataType
  unit?: string | null
  formula?: string | null
  formula_dependencies?: string[] | null
  data_connector_id?: string | null
  data_connector_query?: string | null
  is_auto_calculable?: boolean
  requires_evidence?: boolean
  validation_min?: number | null
  validation_max?: number | null
  validation_regex?: string | null
  sort_order?: number
  dvv_guidance?: string | null
  metadata?: Record<string, unknown>
}

// ============================================================================
// TABLE 4: regulatory_metric_values
// ============================================================================

/** Database row for regulatory_metric_values (actual data per metric/institution/year) */
export interface RegulatoryMetricValueRow {
  id: string
  metric_id: string
  institution_id: string
  /** "2025-26" (academic) or "2025" (calendar year for NIRF) */
  academic_year: string
  /** Stored as text, parsed according to the metric's data_type */
  value: string | null
  /** Pre-parsed numeric value for calculations (NULL if non-numeric) */
  numeric_value: number | null
  is_auto_calculated: boolean
  is_manually_overridden: boolean
  /** Required when is_manually_overridden is true */
  override_reason: string | null
  /** Number of source records that contributed to this value */
  source_record_count: number | null
  /** Snapshot of source query results for audit */
  source_snapshot: Record<string, unknown> | null
  calculated_at: string | null
  entered_by: string | null
  verified_by: string | null
  verified_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

/** Insert DTO for regulatory_metric_values */
export interface RegulatoryMetricValueInsert {
  metric_id: string
  institution_id: string
  academic_year: string
  value?: string | null
  numeric_value?: number | null
  is_auto_calculated?: boolean
  is_manually_overridden?: boolean
  override_reason?: string | null
  source_record_count?: number | null
  source_snapshot?: Record<string, unknown> | null
  calculated_at?: string | null
  entered_by?: string | null
  verified_by?: string | null
  verified_at?: string | null
  notes?: string | null
}

/** Update DTO for regulatory_metric_values */
export interface RegulatoryMetricValueUpdate {
  id: string
  value?: string | null
  numeric_value?: number | null
  is_auto_calculated?: boolean
  is_manually_overridden?: boolean
  override_reason?: string | null
  source_record_count?: number | null
  source_snapshot?: Record<string, unknown> | null
  calculated_at?: string | null
  entered_by?: string | null
  verified_by?: string | null
  verified_at?: string | null
  notes?: string | null
}

// ============================================================================
// TABLE 5: regulatory_metric_value_history (append-only audit trail)
// ============================================================================

/**
 * Database row for regulatory_metric_value_history.
 * Append-only table -- no Update DTO needed.
 * Every change to a metric value is recorded here for DVV audit compliance.
 */
export interface RegulatoryMetricValueHistoryRow {
  id: string
  metric_value_id: string
  old_value: string | null
  new_value: string | null
  /** Type of change: auto_refresh | manual_entry | manual_override | verification */
  change_type: MetricValueChangeType
  changed_by: string | null
  change_reason: string | null
  /** Snapshot of source data at time of change */
  source_snapshot: Record<string, unknown> | null
  created_at: string
}

/** Insert DTO for regulatory_metric_value_history (append-only, no updates) */
export interface RegulatoryMetricValueHistoryInsert {
  metric_value_id: string
  old_value?: string | null
  new_value?: string | null
  change_type: MetricValueChangeType
  changed_by?: string | null
  change_reason?: string | null
  source_snapshot?: Record<string, unknown> | null
}

// ============================================================================
// TABLE 6: regulatory_evidence
// ============================================================================

/** Database row for regulatory_evidence (DVV evidence documents) */
export interface RegulatoryEvidenceRow {
  id: string
  /** Link to specific metric (at least one of metric_id or criteria_id required) */
  metric_id: string | null
  /** Link to criterion (at least one of metric_id or criteria_id required) */
  criteria_id: string | null
  submission_id: string | null
  institution_id: string
  academic_year: string
  file_url: string
  file_name: string
  /** File extension/MIME type: pdf, jpg, xlsx, etc. */
  file_type: string | null
  /** File size in bytes (bigint mapped to number) */
  file_size_bytes: number | null
  description: string | null
  evidence_type: EvidenceType
  uploaded_by: string
  /** Soft-delete flag -- no hard DELETE allowed */
  is_deleted: boolean
  deleted_at: string | null
  created_at: string
  updated_at: string
  metadata: Record<string, unknown>
  /**
   * Full-text search vector, GENERATED ALWAYS AS stored column.
   * Combines file_name, description, evidence_type for tsvector search.
   * READ-ONLY -- do not include in Insert or Update.
   */
  readonly search_vector: string | null
}

/** Insert DTO for regulatory_evidence */
export interface RegulatoryEvidenceInsert {
  metric_id?: string | null
  criteria_id?: string | null
  submission_id?: string | null
  institution_id: string
  academic_year: string
  file_url: string
  file_name: string
  file_type?: string | null
  file_size_bytes?: number | null
  description?: string | null
  evidence_type?: EvidenceType
  uploaded_by: string
  metadata?: Record<string, unknown>
}

/** Update DTO for regulatory_evidence */
export interface RegulatoryEvidenceUpdate {
  id: string
  description?: string | null
  evidence_type?: EvidenceType
  /** Soft-delete: set is_deleted=true and deleted_at */
  is_deleted?: boolean
  deleted_at?: string | null
  metadata?: Record<string, unknown>
}

/** Evidence full-text search result (includes relevance score from ts_rank) */
export interface RegulatoryEvidenceSearchResult extends RegulatoryEvidenceRow {
  /** ts_rank relevance score from full-text search */
  relevance: number
}

/** Evidence fuzzy search result (includes trigram similarity score) */
export interface RegulatoryEvidenceFuzzyResult extends RegulatoryEvidenceRow {
  /** pg_trgm similarity score (0-1) */
  similarity: number
}

// ============================================================================
// TABLE 7: regulatory_submissions
// ============================================================================

/** Database row for regulatory_submissions (workflow tracking) */
export interface RegulatorySubmissionRow {
  id: string
  framework_id: string
  institution_id: string
  academic_year: string
  status: SubmissionStatus
  /** Percentage of metrics populated (0-100) */
  completeness_percentage: number
  auto_populated_count: number
  manual_entry_count: number
  total_metrics_count: number
  /** Estimated total score based on current metric values */
  calculated_score: number | null
  submitted_at: string | null
  submitted_by: string | null
  approved_at: string | null
  approved_by: string | null
  /** External portal submission ID/reference number */
  portal_reference: string | null
  /** URL of the generated report PDF */
  report_file_url: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

/** Insert DTO for regulatory_submissions */
export interface RegulatorySubmissionInsert {
  framework_id: string
  institution_id: string
  academic_year: string
  status?: SubmissionStatus
  completeness_percentage?: number
  auto_populated_count?: number
  manual_entry_count?: number
  total_metrics_count?: number
  calculated_score?: number | null
  notes?: string | null
}

/** Update DTO for regulatory_submissions */
export interface RegulatorySubmissionUpdate {
  id: string
  status?: SubmissionStatus
  completeness_percentage?: number
  auto_populated_count?: number
  manual_entry_count?: number
  total_metrics_count?: number
  calculated_score?: number | null
  submitted_at?: string | null
  submitted_by?: string | null
  approved_at?: string | null
  approved_by?: string | null
  portal_reference?: string | null
  report_file_url?: string | null
  notes?: string | null
}

// ============================================================================
// TABLE 8: regulatory_data_connectors (read-only for non-super_admin)
// ============================================================================

/**
 * Database row for regulatory_data_connectors.
 * Named, reusable query definitions that pull data from MyJKKN modules.
 * Read-only for non-super_admin users; only super_admin can create/modify.
 */
export interface RegulatoryDataConnectorRow {
  /** Text primary key: "DC-01", "DC-02", etc. */
  id: string
  /** Human-readable name: "Student Enrollment & Demographics" */
  name: string
  description: string | null
  /** Source module: "learner-management", "staff", etc. */
  source_module: string
  /** Source table names: ["learners_profiles", "admissions"] */
  source_tables: string[]
  /** SQL template with $1=institution_id, $2=start_date, $3=end_date */
  query_template: string
  /** Output format: single_value | table | aggregation */
  output_type: ConnectorOutputType
  /** Column names in result set */
  output_columns: string[] | null
  is_active: boolean
  last_tested_at: string | null
  last_test_status: ConnectorTestStatus | null
  test_error_message: string | null
  version: number
  created_at: string
  updated_at: string
}

/** Insert DTO for regulatory_data_connectors (super_admin only) */
export interface RegulatoryDataConnectorInsert {
  /** Text primary key: "DC-01", "DC-02", etc. — must be provided */
  id: string
  name: string
  description?: string | null
  source_module: string
  source_tables: string[]
  query_template: string
  output_type?: ConnectorOutputType
  output_columns?: string[] | null
  is_active?: boolean
  last_tested_at?: string | null
  last_test_status?: ConnectorTestStatus | null
  test_error_message?: string | null
  version?: number
}

/** Update DTO for regulatory_data_connectors (super_admin only) */
export interface RegulatoryDataConnectorUpdate {
  id: string
  name?: string
  description?: string | null
  source_module?: string
  source_tables?: string[]
  query_template?: string
  output_type?: ConnectorOutputType
  output_columns?: string[] | null
  is_active?: boolean
  last_tested_at?: string | null
  last_test_status?: ConnectorTestStatus | null
  test_error_message?: string | null
  version?: number
}

// ============================================================================
// TABLE 9: regulatory_simulations (append-only)
// ============================================================================

/** Database row for regulatory_simulations (what-if score scenarios) */
export interface RegulatorySimulationRow {
  id: string
  framework_id: string
  institution_id: string
  /** Scenario name: "What if 5 more PhD faculty" */
  name: string
  /** Academic year the simulation is based on */
  base_academic_year: string
  /** Metric overrides: {metric_code: new_value, ...} */
  overrides: Record<string, unknown>
  /** Calculated total score with overrides applied */
  calculated_score: number | null
  /** Difference from base score (positive = improvement) */
  score_delta: number | null
  /** Estimated rank band based on calculated score */
  rank_estimate: string | null
  created_by: string | null
  created_at: string
}

/** Insert DTO for regulatory_simulations (append-only, no updates) */
export interface RegulatorySimulationInsert {
  framework_id: string
  institution_id: string
  name: string
  base_academic_year: string
  overrides?: Record<string, unknown>
  calculated_score?: number | null
  score_delta?: number | null
  rank_estimate?: string | null
  created_by?: string | null
}

// ============================================================================
// TABLE 10: regulatory_evidence_versions (append-only)
// ============================================================================

/** Database row for regulatory_evidence_versions (document revision trail for DVV) */
export interface RegulatoryEvidenceVersionRow {
  id: string
  evidence_id: string
  version_number: number
  file_url: string
  file_name: string
  file_type: string | null
  file_size_bytes: number | null
  /** Summary of what changed: "Updated placement data per DVV feedback" */
  change_summary: string | null
  uploaded_by: string
  created_at: string
}

/** Insert DTO for regulatory_evidence_versions (append-only, no updates) */
export interface RegulatoryEvidenceVersionInsert {
  evidence_id: string
  version_number?: number
  file_url: string
  file_name: string
  file_type?: string | null
  file_size_bytes?: number | null
  change_summary?: string | null
  uploaded_by: string
}

// ============================================================================
// TABLE 11: regulatory_peer_visits
// ============================================================================

/** Database row for regulatory_peer_visits (NAAC/NBA visit coordination) */
export interface RegulatoryPeerVisitRow {
  id: string
  submission_id: string
  institution_id: string
  visit_type: VisitType
  status: VisitStatus
  scheduled_date: string | null
  actual_start_date: string | null
  actual_end_date: string | null
  /** Peer team members with their designations and roles */
  team_composition: PeerVisitTeamMember[]
  /** Pre-visit readiness checklist: {item: boolean} */
  pre_visit_checklist: Record<string, boolean>
  /** Day-by-day visit schedule */
  visit_itinerary: VisitItineraryItem[]
  /** Peer team observations and remarks */
  findings: Record<string, unknown>
  /** Post-visit improvement suggestions */
  recommendations: string | null
  /** Post-visit action items with tracking */
  action_items: ActionItem[]
  /** Grade or score awarded by the peer team */
  grade_awarded: string | null
  /** URL to the peer team report document */
  report_file_url: string | null
  /** IQAC coordinator managing the visit */
  coordinator_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

/** Insert DTO for regulatory_peer_visits */
export interface RegulatoryPeerVisitInsert {
  submission_id: string
  institution_id: string
  visit_type: VisitType
  status?: VisitStatus
  scheduled_date?: string | null
  actual_start_date?: string | null
  actual_end_date?: string | null
  team_composition?: PeerVisitTeamMember[]
  pre_visit_checklist?: Record<string, boolean>
  visit_itinerary?: VisitItineraryItem[]
  findings?: Record<string, unknown>
  recommendations?: string | null
  action_items?: ActionItem[]
  grade_awarded?: string | null
  report_file_url?: string | null
  coordinator_id?: string | null
  notes?: string | null
}

/** Update DTO for regulatory_peer_visits */
export interface RegulatoryPeerVisitUpdate {
  id: string
  status?: VisitStatus
  scheduled_date?: string | null
  actual_start_date?: string | null
  actual_end_date?: string | null
  team_composition?: PeerVisitTeamMember[]
  pre_visit_checklist?: Record<string, boolean>
  visit_itinerary?: VisitItineraryItem[]
  findings?: Record<string, unknown>
  recommendations?: string | null
  action_items?: ActionItem[]
  grade_awarded?: string | null
  report_file_url?: string | null
  coordinator_id?: string | null
  notes?: string | null
}

// ============================================================================
// TABLE 12: regulatory_governing_bodies
// ============================================================================

/** Database row for regulatory_governing_bodies (NAAC SSR requirement) */
export interface RegulatoryGoverningBodyRow {
  id: string
  institution_id: string
  body_type: BodyType
  /** Display name: "Board of Studies - Computer Science" */
  name: string
  /** Statutory purpose and responsibilities */
  mandate: string | null
  formation_date: string | null
  is_active: boolean
  meeting_frequency: MeetingFrequency | null
  /** Current body members with tenure and designation details */
  members: GoverningBodyMember[]
  created_at: string
  updated_at: string
}

/** Insert DTO for regulatory_governing_bodies */
export interface RegulatoryGoverningBodyInsert {
  institution_id: string
  body_type: BodyType
  name: string
  mandate?: string | null
  formation_date?: string | null
  is_active?: boolean
  meeting_frequency?: MeetingFrequency | null
  members?: GoverningBodyMember[]
}

/** Update DTO for regulatory_governing_bodies */
export interface RegulatoryGoverningBodyUpdate {
  id: string
  body_type?: BodyType
  name?: string
  mandate?: string | null
  formation_date?: string | null
  is_active?: boolean
  meeting_frequency?: MeetingFrequency | null
  members?: GoverningBodyMember[]
}

// ============================================================================
// TABLE 13: regulatory_body_meetings
// ============================================================================

/** Database row for regulatory_body_meetings (meeting minutes for NAAC evidence) */
export interface RegulatoryBodyMeetingRow {
  id: string
  body_id: string
  institution_id: string
  /** Sequential meeting number per body per academic year */
  meeting_number: number
  academic_year: string
  meeting_date: string
  quorum_met: boolean
  attendees_count: number | null
  /** Meeting agenda items */
  agenda: AgendaItem[]
  /** Resolutions passed during the meeting */
  resolutions: MeetingResolution[]
  /** Follow-up action items with tracking */
  action_items: ActionItem[]
  /** URL of uploaded meeting minutes PDF */
  minutes_file_url: string | null
  approved_by: string | null
  approved_at: string | null
  created_at: string
  updated_at: string
}

/** Insert DTO for regulatory_body_meetings */
export interface RegulatoryBodyMeetingInsert {
  body_id: string
  institution_id: string
  meeting_number: number
  academic_year: string
  meeting_date: string
  quorum_met?: boolean
  attendees_count?: number | null
  agenda?: AgendaItem[]
  resolutions?: MeetingResolution[]
  action_items?: ActionItem[]
  minutes_file_url?: string | null
}

/** Update DTO for regulatory_body_meetings */
export interface RegulatoryBodyMeetingUpdate {
  id: string
  meeting_number?: number
  meeting_date?: string
  quorum_met?: boolean
  attendees_count?: number | null
  agenda?: AgendaItem[]
  resolutions?: MeetingResolution[]
  action_items?: ActionItem[]
  minutes_file_url?: string | null
  approved_by?: string | null
  approved_at?: string | null
}

// ============================================================================
// TABLE 14: regulatory_course_syllabi
// ============================================================================

/** Database row for regulatory_course_syllabi (NAAC Criterion 1 - Curricular Aspects) */
export interface RegulatoryCourseSyllabusRow {
  id: string
  institution_id: string
  program_id: string | null
  department: string
  course_code: string
  course_name: string
  academic_year: string
  semester: number | null
  /** URL of uploaded syllabus document */
  syllabus_file_url: string | null
  /** URL of uploaded teaching plan document */
  teaching_plan_file_url: string | null
  revision_status: SyllabusRevisionStatus
  revision_date: string | null
  /** Board of Studies approval date */
  bos_approval_date: string | null
  /** FK to regulatory_body_meetings if BoS meeting is tracked */
  bos_meeting_id: string | null
  /** Planned teaching hours */
  total_hours: number | null
  /** Actual hours delivered */
  completed_hours: number | null
  /**
   * Auto-computed by PostgreSQL GENERATED ALWAYS AS stored column.
   * Formula: CASE WHEN total_hours > 0 THEN (completed_hours / total_hours) * 100 ELSE 0 END
   * READ-ONLY -- do not include in Insert or Update.
   */
  readonly completion_percentage: number
  /** Course Outcome definitions: {CO1: "description", CO2: "description", ...} */
  co_mapping: Record<string, string>
  /** CO-PO attainment mapping for NBA */
  po_mapping: COPOMapping[]
  /** Description of pedagogical innovations used */
  innovative_methods: string | null
  created_at: string
  updated_at: string
}

/** Insert DTO for regulatory_course_syllabi (completion_percentage is server-generated) */
export interface RegulatoryCourseSyllabusInsert {
  institution_id: string
  program_id?: string | null
  department: string
  course_code: string
  course_name: string
  academic_year: string
  semester?: number | null
  syllabus_file_url?: string | null
  teaching_plan_file_url?: string | null
  revision_status?: SyllabusRevisionStatus
  revision_date?: string | null
  bos_approval_date?: string | null
  bos_meeting_id?: string | null
  total_hours?: number | null
  completed_hours?: number | null
  co_mapping?: Record<string, string>
  po_mapping?: COPOMapping[]
  innovative_methods?: string | null
}

/** Update DTO for regulatory_course_syllabi (completion_percentage is server-generated) */
export interface RegulatoryCourseSyllabusUpdate {
  id: string
  program_id?: string | null
  department?: string
  course_code?: string
  course_name?: string
  semester?: number | null
  syllabus_file_url?: string | null
  teaching_plan_file_url?: string | null
  revision_status?: SyllabusRevisionStatus
  revision_date?: string | null
  bos_approval_date?: string | null
  bos_meeting_id?: string | null
  total_hours?: number | null
  completed_hours?: number | null
  co_mapping?: Record<string, string>
  po_mapping?: COPOMapping[]
  innovative_methods?: string | null
}

// ============================================================================
// TABLE 15: regulatory_peer_benchmarks (NAAC 6.5.3 peer comparison)
// ============================================================================

/** Database row for regulatory_peer_benchmarks (peer institution comparison) */
export interface RegulatoryPeerBenchmarkRow {
  id: string
  institution_id: string
  framework_id: string
  academic_year: string
  /** Name of the peer institution: "PSG College of Technology" */
  peer_institution_name: string
  /** Peer's NIRF rank (if available) */
  peer_institution_nirf_rank: number | null
  /** Peer's NAAC grade (if available) */
  peer_institution_naac_grade: string | null
  /** Which metric is being compared */
  metric_code: string
  /** Our institution's value for this metric */
  our_value: number | null
  /** Peer institution's value for this metric */
  peer_value: number | null
  /**
   * Auto-computed by PostgreSQL GENERATED ALWAYS AS (our_value - peer_value) STORED.
   * Positive = we lead, negative = we lag.
   * READ-ONLY -- do not include in Insert or Update.
   */
  readonly gap: number | null
  /** Source of peer data: "NIRF portal", "peer website", "manual" */
  data_source: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

/** Insert DTO for regulatory_peer_benchmarks */
export interface RegulatoryPeerBenchmarkInsert {
  institution_id: string
  framework_id: string
  academic_year: string
  peer_institution_name: string
  peer_institution_nirf_rank?: number | null
  peer_institution_naac_grade?: string | null
  metric_code: string
  our_value?: number | null
  peer_value?: number | null
  data_source?: string | null
  notes?: string | null
  created_by?: string | null
}

/** Update DTO for regulatory_peer_benchmarks */
export interface RegulatoryPeerBenchmarkUpdate {
  id: string
  peer_institution_name?: string
  peer_institution_nirf_rank?: number | null
  peer_institution_naac_grade?: string | null
  metric_code?: string
  our_value?: number | null
  peer_value?: number | null
  data_source?: string | null
  notes?: string | null
}

// ============================================================================
// VIEW: regulatory_course_completion_dashboard
// ============================================================================

/**
 * Row type for the regulatory_course_completion_dashboard view.
 * Aggregates course syllabus completion by institution, department, and academic year.
 * READ-ONLY -- views do not have Insert/Update types.
 */
export interface RegulatoryCourseCompletionDashboardRow {
  institution_id: string
  department: string
  academic_year: string
  /** Total number of courses in this department/year */
  total_courses: number
  /** Courses with completion_percentage >= 100 */
  completed_courses: number
  /** Courses with completion_percentage >= 75 and < 100 */
  on_track_courses: number
  /** Courses with completion_percentage < 75 */
  behind_courses: number
  /** Average completion percentage across all courses, rounded to 1 decimal */
  avg_completion_pct: number
  /** Number of courses with syllabus file uploaded */
  syllabi_uploaded: number
  /** Number of courses with teaching plan uploaded */
  plans_uploaded: number
}

// ============================================================================
// OKR INTEGRATION TYPES (ALTER TABLE okr_objectives — new columns)
// ============================================================================

/**
 * Additional columns added to okr_objectives for regulatory integration.
 * These link an OKR objective to a regulatory metric it aims to improve.
 * Use these when creating/reading OKR objectives with regulatory context.
 */
export interface OkrObjectiveRegulatoryFields {
  /** FK to regulatory_metrics — which metric this objective aims to improve */
  regulatory_metric_id: string | null
  /** Target numeric value for the regulatory metric */
  regulatory_target_value: number | null
}

/**
 * OKR objective with regulatory integration fields.
 * Extend your existing OKR objective type with these additional fields.
 * Example: type OkrObjectiveWithRegulatory = OkrObjectiveRow & OkrObjectiveRegulatoryFields
 */
export type OkrObjectiveRegulatoryInsert = Partial<OkrObjectiveRegulatoryFields>

// ============================================================================
// FILTER INTERFACES
// ============================================================================

/** Filters for querying regulatory frameworks */
export interface RegulatoryFrameworkFilters {
  /** Filter by regulatory body: "NAAC", "NIRF", etc. */
  body?: string
  /** Filter by version */
  version?: string
  /** Filter by lifecycle status */
  status?: FrameworkStatus
  /** Filter by institution type (university, autonomous_college, affiliated_college) */
  institution_type?: InstitutionType | null
  /** Full-text search across name, body, description */
  search?: string
  page?: number
  limit?: number
}

/** Filters for querying regulatory metrics */
export interface RegulatoryMetricFilters {
  /** Filter by parent framework */
  framework_id?: string
  /** Filter by parent criterion */
  criteria_id?: string
  /** Filter by data type */
  data_type?: MetricDataType
  /** Filter to only auto-calculable metrics */
  is_auto_calculable?: boolean
  /** Filter by data connector */
  data_connector_id?: string
  /** Full-text search across name, code, description */
  search?: string
  page?: number
  limit?: number
}

/** Filters for querying regulatory submissions */
export interface RegulatorySubmissionFilters {
  /** Filter by parent framework */
  framework_id?: string
  /** Filter by institution */
  institution_id?: string
  /** Filter by academic year */
  academic_year?: string
  /** Filter by workflow status */
  status?: SubmissionStatus
  page?: number
  limit?: number
}

/** Filters for querying regulatory peer benchmarks */
export interface RegulatoryPeerBenchmarkFilters {
  /** Filter by framework */
  framework_id?: string
  /** Filter by institution */
  institution_id?: string
  /** Filter by academic year */
  academic_year?: string
  /** Filter by peer institution name (partial match) */
  peer_institution_name?: string
  /** Filter by specific metric code */
  metric_code?: string
  page?: number
  limit?: number
}

/** Filters for querying evidence documents */
export interface RegulatoryEvidenceFilters {
  /** Filter by metric */
  metric_id?: string
  /** Filter by criterion */
  criteria_id?: string
  /** Filter by submission */
  submission_id?: string
  /** Filter by institution */
  institution_id?: string
  /** Filter by academic year */
  academic_year?: string
  /** Filter by evidence type */
  evidence_type?: EvidenceType
  /** Full-text search query (uses tsvector search_vector) */
  search?: string
  /** Fuzzy file name search (uses pg_trgm similarity) */
  fuzzy_filename?: string
  /** Include soft-deleted evidence (default false) */
  include_deleted?: boolean
  page?: number
  limit?: number
}

// ============================================================================
// AGGREGATE / COMPUTED TYPES
// ============================================================================

/** Framework completeness summary (how many metrics are populated vs total) */
export interface FrameworkCompleteness {
  framework_id: string
  /** Total number of metrics defined in this framework */
  total_metrics: number
  /** Number of metrics that have a value for the selected institution/year */
  populated_metrics: number
  /** Completeness as a percentage (0-100) */
  percentage: number
  /** Count of auto-calculable metrics */
  auto_count: number
  /** Count of manually-entered metrics */
  manual_count: number
}

/** Metric definition joined with its current value and history count */
export interface MetricWithValue {
  // -- From regulatory_metrics --
  id: string
  criteria_id: string
  code: string
  name: string
  description: string | null
  data_type: MetricDataType
  unit: string | null
  formula: string | null
  formula_dependencies: string[] | null
  data_connector_id: string | null
  is_auto_calculable: boolean
  requires_evidence: boolean
  sort_order: number
  dvv_guidance: string | null
  metadata: Record<string, unknown>

  // -- From regulatory_metric_values (current value) --
  /** Current value as text */
  current_value: string | null
  /** Current value as number (NULL if non-numeric) */
  current_numeric_value: number | null
  /** Whether the current value was auto-calculated */
  is_auto_calculated: boolean | null
  /** Whether the current value was manually overridden */
  is_manually_overridden: boolean | null
  /** Override reason if manually overridden */
  override_reason: string | null
  /** When the current value was last calculated/entered */
  value_updated_at: string | null
  /** Who entered/verified the current value */
  entered_by: string | null
  verified_by: string | null

  // -- Aggregated --
  /** Number of history records for this metric value */
  history_count: number
  /** Number of evidence documents attached to this metric */
  evidence_count: number
}

/** Peer benchmark gap analysis summary (aggregated per peer institution) */
export interface PeerBenchmarkSummary {
  peer_institution_name: string
  peer_institution_nirf_rank: number | null
  peer_institution_naac_grade: string | null
  /** Number of metrics compared */
  metrics_compared: number
  /** Number of metrics where we lead (gap > 0) */
  metrics_leading: number
  /** Number of metrics where we lag (gap < 0) */
  metrics_lagging: number
  /** Average gap across all compared metrics */
  avg_gap: number
}

// ============================================================================
// RELATION / JOINED TYPES (for UI consumption)
// ============================================================================

/** Framework with nested criteria tree (for framework detail view) */
export interface RegulatoryFrameworkWithCriteria extends RegulatoryFrameworkRow {
  criteria: RegulatoryCriteriaWithMetrics[]
}

/** Criterion with nested metrics (for criteria tree display) */
export interface RegulatoryCriteriaWithMetrics extends RegulatoryCriteriaRow {
  metrics: RegulatoryMetricRow[]
  children: RegulatoryCriteriaWithMetrics[]
}

/** Submission with framework name and completeness (for list views) */
export interface RegulatorySubmissionWithFramework extends RegulatorySubmissionRow {
  framework: Pick<RegulatoryFrameworkRow, 'name' | 'body' | 'version' | 'framework_type' | 'total_max_score'>
}

/** Peer visit with submission context */
export interface RegulatoryPeerVisitWithSubmission extends RegulatoryPeerVisitRow {
  submission: Pick<RegulatorySubmissionRow, 'framework_id' | 'academic_year' | 'status'>
  framework_name: string
}

/** Governing body with recent meetings count */
export interface RegulatoryGoverningBodyWithStats extends RegulatoryGoverningBodyRow {
  total_meetings: number
  meetings_this_year: number
  last_meeting_date: string | null
}

/** Evidence with version count */
export interface RegulatoryEvidenceWithVersions extends RegulatoryEvidenceRow {
  version_count: number
  latest_version: RegulatoryEvidenceVersionRow | null
}

/** Peer benchmark with metric name resolved */
export interface RegulatoryPeerBenchmarkWithMetric extends RegulatoryPeerBenchmarkRow {
  metric_name: string | null
  framework_name: string
}
