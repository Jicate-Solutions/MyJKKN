/**
 * Projects Module — Risk & Issue (RAID) Types
 *
 * Insert / Update / Filter / joined-read shapes for the RAID register
 * (project_risks, project_issues, project_risk_mitigation_steps,
 * project_risk_escalations).
 *
 * The base row interfaces (ProjectRisk, ProjectIssue, ProjectRiskMitigationStep,
 * ProjectRiskEscalation) already live in `types/projects.ts` — matched 1:1 to the
 * live schema (ref kvizhngldtiuufknvehv). This file ADDS the mutation/filter/derived
 * shapes the service + UI need, without touching the shared types file.
 *
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F3 (RAID register).
 */

import type {
  ProjectRisk,
  ProjectIssue,
  ProjectRiskMitigationStep,
  ProjectRiskEscalation,
  RagStatus,
} from '@/types/projects';

// ─── Shared union/literal types ─────────────────────────────────────────────────

/** project_risks.severity_simple — the simple (non-matrix) severity mode. */
export type RiskSeveritySimple = 'high' | 'medium' | 'low';

/**
 * Which severity scheme a risk uses.
 *  - 'simple' → severity_simple (H/M/L), likelihood/impact null
 *  - 'matrix' → likelihood (1-5) × impact (1-5), severity_simple null
 */
export type RiskSeverityMode = 'simple' | 'matrix';

/**
 * Configurable lifecycle status keys for risks. Stored free-form in
 * project_risks.status_key so an admin can extend the lifecycle; these are the
 * seed defaults the UI offers.
 */
export type RiskStatusKey =
  | 'identified'
  | 'analyzing'
  | 'mitigating'
  | 'monitoring'
  | 'closed'
  | (string & {});

/** Issue lifecycle status keys (project_issues.status_key). */
export type IssueStatusKey =
  | 'open'
  | 'in_progress'
  | 'resolved'
  | 'closed'
  | (string & {});

/** project_issues.severity — same simple scale as a risk's simple mode. */
export type IssueSeverity = RiskSeveritySimple;

/** project_risk_escalations.escalation_level — coarse rung of the escalation ladder. */
export type EscalationLevel = 'owner' | 'manager' | 'sponsor' | 'director' | (string & {});

// ─── Risk: mutation shapes ──────────────────────────────────────────────────────

export interface ProjectRiskInsert {
  project_id: string;
  task_id?: string | null;
  milestone_id?: string | null;
  title: string;
  description?: string | null;
  risk_category?: string | null;
  severity_simple?: RiskSeveritySimple | null;
  likelihood?: number | null;
  impact?: number | null;
  rag_status: RagStatus | string;
  status_key: RiskStatusKey;
  owner_staff_id?: string | null;
}

export interface ProjectRiskUpdate {
  task_id?: string | null;
  milestone_id?: string | null;
  title?: string;
  description?: string | null;
  risk_category?: string | null;
  severity_simple?: RiskSeveritySimple | null;
  likelihood?: number | null;
  impact?: number | null;
  rag_status?: RagStatus | string;
  status_key?: RiskStatusKey;
  owner_staff_id?: string | null;
  is_escalated?: boolean;
  escalated_at?: string | null;
}

export interface RiskFilters {
  projectId?: string | null;
  taskId?: string | null;
  milestoneId?: string | null;
  statusKey?: RiskStatusKey | null;
  ragStatus?: RagStatus | string | null;
  riskCategory?: string | null;
  ownerStaffId?: string | null;
  isEscalated?: boolean | null;
  search?: string | null;
}

// ─── Mitigation step: mutation shapes ───────────────────────────────────────────

export interface MitigationStepInsert {
  risk_id: string;
  description: string;
  owner_staff_id?: string | null;
  deadline?: string | null;
  order_index?: number;
}

export interface MitigationStepUpdate {
  description?: string;
  owner_staff_id?: string | null;
  deadline?: string | null;
  is_complete?: boolean;
  linked_task_id?: string | null;
  order_index?: number;
}

// ─── Escalation: mutation shape ─────────────────────────────────────────────────

export interface EscalationInsert {
  risk_id: string;
  escalated_to_staff_id?: string | null;
  escalated_by?: string | null;
  escalation_level?: EscalationLevel | null;
  reason?: string | null;
  /** Always false from the UI — auto-escalation is a cron concern. */
  is_auto?: boolean;
}

// ─── Issue: mutation shapes ─────────────────────────────────────────────────────

export interface ProjectIssueInsert {
  project_id: string;
  task_id?: string | null;
  raised_from_risk_id?: string | null;
  title: string;
  description?: string | null;
  severity?: IssueSeverity | null;
  status_key: IssueStatusKey;
  owner_staff_id?: string | null;
}

export interface ProjectIssueUpdate {
  task_id?: string | null;
  raised_from_risk_id?: string | null;
  title?: string;
  description?: string | null;
  severity?: IssueSeverity | null;
  status_key?: IssueStatusKey;
  owner_staff_id?: string | null;
  resolved_at?: string | null;
  resolution_notes?: string | null;
}

export interface IssueFilters {
  projectId?: string | null;
  taskId?: string | null;
  raisedFromRiskId?: string | null;
  statusKey?: IssueStatusKey | null;
  severity?: IssueSeverity | null;
  ownerStaffId?: string | null;
  search?: string | null;
}

// ─── Joined / expanded read shapes ──────────────────────────────────────────────

/** A risk with its mitigation steps and escalation history resolved. */
export interface ProjectRiskWithRelations extends ProjectRisk {
  mitigation_steps?: ProjectRiskMitigationStep[];
  escalations?: ProjectRiskEscalation[];
}

// ─── Derived-severity helpers (pure, no DB) ─────────────────────────────────────

/** Default lifecycle the UI seeds for new risks. */
export const RISK_STATUS_OPTIONS: { key: RiskStatusKey; label: string }[] = [
  { key: 'identified', label: 'Identified' },
  { key: 'analyzing', label: 'Analyzing' },
  { key: 'mitigating', label: 'Mitigating' },
  { key: 'monitoring', label: 'Monitoring' },
  { key: 'closed', label: 'Closed' },
];

/** Default issue lifecycle. */
export const ISSUE_STATUS_OPTIONS: { key: IssueStatusKey; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'closed', label: 'Closed' },
];

export const RISK_SEVERITY_SIMPLE_OPTIONS: { key: RiskSeveritySimple; label: string }[] = [
  { key: 'high', label: 'High' },
  { key: 'medium', label: 'Medium' },
  { key: 'low', label: 'Low' },
];

export const RISK_CATEGORY_OPTIONS: string[] = [
  'schedule',
  'budget',
  'scope',
  'resource',
  'technical',
  'quality',
  'external',
  'compliance',
];

/**
 * Map a likelihood (1-5) × impact (1-5) score to a RAG band.
 * score = likelihood * impact, range 1-25.
 *   ≥ 15 → red, ≥ 6 → amber, else green.
 * Matches the substrate's intent (rag_status is NOT generated in-DB, so the
 * client computes it on write — flagged for the matrix mode).
 */
export function ragFromMatrix(likelihood: number, impact: number): RagStatus {
  const score = likelihood * impact;
  if (score >= 15) return 'red';
  if (score >= 6) return 'amber';
  return 'green';
}

/** Map the simple H/M/L severity to a RAG band. */
export function ragFromSimple(severity: RiskSeveritySimple): RagStatus {
  if (severity === 'high') return 'red';
  if (severity === 'medium') return 'amber';
  return 'green';
}

/** The numeric matrix score, or null when not in matrix mode. */
export function matrixScore(
  likelihood: number | null | undefined,
  impact: number | null | undefined
): number | null {
  if (likelihood == null || impact == null) return null;
  return likelihood * impact;
}
