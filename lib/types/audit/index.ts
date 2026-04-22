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

export type ParameterGroup = 1 | 2 | 3 | 4;

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
  evidence_required: EvidenceRequirementItem[];
  institution_id: string | null;
  is_system: boolean;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
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
}

export interface LogAuditFindingDto {
  audit_cycle_id: string;
  parameter_code: string;
  severity: FindingSeverity;
  institution_id: string;
  assigned_to?: string | null;
  notes?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
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
