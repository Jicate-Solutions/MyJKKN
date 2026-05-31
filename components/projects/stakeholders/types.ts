/**
 * Projects Module — Stakeholder & Status-Report Types
 *
 * Insert / Update / Filter shapes for:
 *   project_stakeholders   — CRUD mutation inputs + filters
 *   project_status_reports — CRUD mutation inputs + filters
 *
 * Base row interfaces (ProjectStakeholder, ProjectStatusReport) already live
 * in `types/projects.ts` — this file ADDS the mutation/filter shapes needed
 * by the service and UI, without touching the shared types file.
 *
 * NOTE: notification SENDING (email dispatch, in-app push) is intentionally
 * deferred.  This file only defines storage-layer shapes.
 *
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F8.
 */

import type { RagStatus } from '@/types/projects';

// ─── Stakeholder ─────────────────────────────────────────────────────────────────

export interface StakeholderInsert {
  project_id: string;
  /** Provide either staff_id (internal) OR external_name+external_email. */
  staff_id?: string | null;
  external_name?: string | null;
  external_email?: string | null;
  role?: string | null;
  notify_in_app?: boolean;
  notify_email?: boolean;
}

export type StakeholderUpdate = Partial<Omit<StakeholderInsert, 'project_id'>>;

export interface StakeholderFilters {
  projectId?: string | null;
  staffId?: string | null;
  role?: string | null;
}

// ─── Status Report ───────────────────────────────────────────────────────────────

export interface StatusReportInsert {
  project_id: string;
  report_period_start?: string | null;
  report_period_end?: string | null;
  summary?: string | null;
  rag_status?: RagStatus | string | null;
  /** Defaults to 'manual' for UI-created reports. */
  generated_type?: string;
  content?: Record<string, unknown>;
  storage_path?: string | null;
}

export type StatusReportUpdate = Partial<Omit<StatusReportInsert, 'project_id'>>;

export interface StatusReportFilters {
  projectId?: string | null;
  ragStatus?: RagStatus | string | null;
  generatedType?: string | null;
}

// ─── UI option lists ─────────────────────────────────────────────────────────────

export const STAKEHOLDER_ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: 'sponsor', label: 'Sponsor' },
  { value: 'owner', label: 'Owner' },
  { value: 'lead', label: 'Lead' },
  { value: 'contributor', label: 'Contributor' },
  { value: 'reviewer', label: 'Reviewer' },
  { value: 'approver', label: 'Approver' },
  { value: 'observer', label: 'Observer' },
  { value: 'external', label: 'External' },
];

export const RAG_STATUS_OPTIONS: { value: RagStatus; label: string; color: string }[] = [
  { value: 'green', label: 'Green — On track', color: 'text-green-600' },
  { value: 'amber', label: 'Amber — At risk', color: 'text-amber-500' },
  { value: 'red',   label: 'Red — Off track', color: 'text-red-600' },
];
