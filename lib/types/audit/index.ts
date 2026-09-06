// Audit Workflow Sprint 01 — shared types
// Spec: specs/myjkkn-audit-workflow-sprint-01-plan.md
// Substrate: supabase/migrations/20260422_audit_workflow_*.sql

// ============================================================================
// Enums (DB check constraints mirror these)
// ============================================================================

export type AuditCyclePhase =
  | 'draft'
  | 'in-progress'
  | 'rectification'
  | 'peer-visit'
  | 'closed';

export type AttestationLevel =
  | 'pending'
  | 'compliant'
  | 'partial'
  | 'non-compliant';

// Group 5 arrived with CARRE v2.0 (migration 20260705120000_carre_audit_v2),
// which widened the catalog CHECK and seeded CARRE-E1..E5 into it
// (pillar map: C=1 A=2 R=3 RS=4 E=5). This type was never widened to match, so
// every group-5 row was silently dropped by the UI's group buckets.
export type ParameterGroup = 1 | 2 | 3 | 4 | 5;

export type FindingSeverity = 'red' | 'yellow' | 'green';

// ============================================================================
// Framework mapping (parameter → per-body criterion code)
// ============================================================================

export type AccreditationBodyCode =
  | 'naac'
  | 'nba'
  | 'nirf'
  | 'ugc'
  | 'qs'
  | 'aicte'
  | 'ncte'
  | 'dci'
  | 'pci'
  | 'inc';

export type FrameworkMapping = Partial<Record<AccreditationBodyCode, string>>;

// ============================================================================
// Evidence requirement schema (per parameter)
// ============================================================================

export interface EvidenceRequirementItem {
  label: string;
  required: boolean;
  mime_types?: string[];
  description?: string;
}

// ============================================================================
// Cosigner signature shape
// ============================================================================

export interface CosignerSignature {
  user_id: string;
  at: string; // ISO timestamp
}

export type CosignersMap = Partial<Record<'cao' | 'ceo' | 'md_caio', CosignerSignature>>;

// ============================================================================
// Core entities (1:1 with DB rows)
// ============================================================================

export interface AuditCycle {
  id: string;
  name: string;
  description: string | null;
  frameworks: string[]; // e.g., ['NAAC','NBA','NIRF']
  start_date: string;   // YYYY-MM-DD
  end_date: string;
  lead_auditor_id: string;
  cosigner_roles: string[];
  institution_ids: string[] | null; // NULL = all institutions creator has scope for
  /** The single standing "Whole Institution" audit that holds org-wide checks
   *  (loop health, exam integrity). Never closes; not a per-college cycle. */
  is_standing?: boolean;
  /** Which module's audit this is. Free text on the DB (no CHECK/FK/enum);
   *  live values include 'academic', 'campus-living', 'learners-council' and
   *  'sustainability' (the yearly green audit, which emits NAAC 10.4 on close).
   *  NULL = a general cycle not tied to one module. */
  module_key?: string | null;
  phase: AuditCyclePhase;
  parameter_catalog_snapshot: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

export interface AuditAttestation {
  id: string;
  audit_cycle_id: string;
  parameter_code: string;
  institution_id: string;
  attestation: AttestationLevel;
  attested_by: string | null;
  attested_at: string | null;
  cosigners: CosignersMap;
  framework_mapping: FrameworkMapping;
  evidence_count: number;
  open_findings_count: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditParameterCatalogRow {
  id: string;
  code: string;
  name: string;
  parameter_group: ParameterGroup;
  description: string | null;
  framework_mapping: FrameworkMapping;
  discovery_query_sql: string | null;
  discovery_query_ai: string | null;
  default_owner_role: string;
  escalation_role: string | null;
  p1_sla_days: number;
  p2_sla_days: number;
  /** Severity the log-finding dialog pre-selects for this parameter (auditor can
   *  override). Culture (CARRE) params default to 'green'; others to 'yellow'. */
  default_severity: FindingSeverity;
  /** True for institution-wide checks (loop health, exam integrity) that are
   *  audited once in the standing "Whole Institution" audit, not per college. */
  is_org_wide: boolean;
  evidence_required: EvidenceRequirementItem[];
  institution_id: string | null;
  is_system: boolean;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Gate ③ capture — audit_parameter_results (per parameter × institution × cycle).
// Written by fn_audit_capture_cycle_results; the audit's cross-cycle memory.
// ============================================================================

// 'unchecked' = no findings AND not signed off yet ("Not checked yet"). 'partial' =
// had findings, all now closed, but not re-signed. (Director decision 2026-07-14.)
export type AuditParameterVerdict = 'pass' | 'partial' | 'fail' | 'unchecked';

export interface AuditParameterResultMeasured {
  finding_count: number;
  open_finding_count: number;
  attested: boolean;
}

export interface AuditParameterResultDelta {
  /** finding_count(this cycle) − finding_count(prior cycle). */
  finding_count_change: number;
  /** Of the prior cycle's findings for this pair, how many are now closed. */
  closed_from_prior: number;
  /** Of the prior cycle's findings for this pair, how many are still open. */
  still_open_from_prior: number;
}

export interface AuditParameterResult {
  id: string;
  audit_cycle_id: string;
  parameter_code: string;
  institution_id: string | null;
  finding_count: number;
  open_finding_count: number;
  attested: boolean;
  verdict: AuditParameterVerdict;
  measured_value: AuditParameterResultMeasured | null;
  prior_result_id: string | null;
  delta: AuditParameterResultDelta | null;
  /** Consecutive cycles this pair has carried findings — the "keeps failing" signal. */
  recurrence_count: number;
  computed_at: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Gate ④ — adapt. Recommendations the audit makes about ITSELF each cycle,
// read from audit_parameter_results history + findings. Recommend-only:
// applying (which can change a parameter's rigor) is human-gated.
// ---------------------------------------------------------------------------

export type AuditAdaptationRule =
  | 'reduce_frequency' // clean K cycles running → sample less often
  | 'escalate_recurring' // keeps failing → bump owner + shorten SLA
  | 'add_discovery' // found by hand, no auto-check → add a discovery query
  | 'tune_threshold'; // findings mostly dismissed / mostly actioned → tune the bar

export type AuditAdaptationStatus = 'proposed' | 'applied' | 'dismissed';
export type AuditAdaptationSeverity = 'high' | 'medium' | 'low';

export interface AuditAdaptation {
  id: string;
  audit_cycle_id: string;
  rule: AuditAdaptationRule;
  parameter_code: string;
  /** null for a parameter-level recommendation (not tied to one college). */
  institution_id: string | null;
  severity: AuditAdaptationSeverity;
  title: string;
  detail: string;
  /** { kind, ...payload } — the apply-time instructions (e.g. new_owner_role, new_frequency). */
  suggested_action: {
    kind?: 'escalate' | 'reduce_frequency' | 'add_discovery' | 'tune_threshold';
    [key: string]: unknown;
  };
  status: AuditAdaptationStatus;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Standing "Whole Institution" report card. Org-wide params (is_org_wide) are
// graded by their DISCOVERY output, not by findings — so the standing cycle
// needs its own board. fn_audit_standing_board runs each org-wide param's
// discovery over the cycle window and reports whether it produced fresh evidence.
// ---------------------------------------------------------------------------

export type AuditStandingBoardStatus = 'measured' | 'no_data' | 'error';

export interface AuditStandingBoardRow {
  parameter_code: string;
  name: string;
  framework_mapping: Record<string, string> | null;
  discovery_source: string;
  measured_count: number;
  status: AuditStandingBoardStatus;
  /** First few discovery evidence rows (verdict values, dates, etc.). */
  sample: Array<Record<string, unknown>>;
}

export interface AuditFindingType {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_system: boolean;
  is_active: boolean;
  institution_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditFindingDelegation {
  id: string;
  finding_id: string;
  delegated_to: string;
  delegated_by: string;
  delegated_at: string;
  revoked_at: string | null;
  revoke_reason: string | null;
}

// ============================================================================
// Audit finding = service_requests row with slug='audit_finding'
// form_data JSONB holds audit-specific fields
// ============================================================================

export interface AuditFindingFormData {
  audit_cycle_id: string;
  parameter_code: string;
  severity: FindingSeverity;
  framework_mapping?: FrameworkMapping;
  evidence_required?: EvidenceRequirementItem[];
  evidence_uploaded?: Array<{ label: string; storage_path: string; uploaded_at: string; uploaded_by: string }>;
  resolution?: 'rectified' | 'not-fixable' | 'deferred' | null;
  notes?: string | null;
}

// Lightweight view of an audit finding joined from service_requests
export interface AuditFindingView {
  finding_id: string;              // service_requests.id
  request_number: string | null;
  audit_cycle_id: string;
  parameter_code: string;
  severity: FindingSeverity;
  status: string;                  // service_request status enum
  priority: string | null;
  institution_id: string;
  assigned_to: string | null;
  requester_id: string;
  submitted_at: string | null;
  closed_at: string | null;
  form_data: AuditFindingFormData;
}

// ============================================================================
// Create / update DTOs
// ============================================================================

export interface CreateAuditCycleDto {
  name: string;
  description?: string | null;
  frameworks: string[];
  start_date: string;
  end_date: string;
  lead_auditor_id: string;
  institution_ids?: string[] | null;
  cosigner_roles?: string[];
  /** Discriminates the cycle's module. Pass 'sustainability' to create the
   *  yearly green audit — closing it emits NAAC 10.4 via the existing
   *  audit_cycles evidence trigger. */
  module_key?: string | null;
}

export interface LogAuditFindingDto {
  audit_cycle_id: string;
  parameter_code: string;
  severity: FindingSeverity;
  institution_id: string;
  assigned_to?: string | null;
  notes?: string;
  // Matches the service_request_priority DB enum (no 'medium').
  priority?: 'low' | 'normal' | 'high' | 'urgent';
}

export interface SignAttestationDto {
  audit_cycle_id: string;
  parameter_code: string;
  institution_id: string;
  attestation: Exclude<AttestationLevel, 'pending'>;
  notes?: string;
  expected_updated_at?: string; // Thrash T3: optimistic lock
}

export interface CosignAttestationDto {
  attestation_id: string;
  role: 'cao' | 'ceo' | 'md_caio';
  expected_updated_at?: string;
}

// ============================================================================
// Coverage aggregates
// ============================================================================

export interface CoverageCell {
  institution_id: string;
  body_code: string;
  parameter_count: number;
  evidence_count: number;
  coverage_pct: number;
}

export interface CycleProgressRollup {
  total_parameters: number;
  attested: number;
  compliant: number;
  partial: number;
  non_compliant: number;
  pending: number;
  findings_open: number;
  findings_closed: number;
  findings_overdue: number;
}
