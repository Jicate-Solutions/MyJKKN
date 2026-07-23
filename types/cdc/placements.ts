/**
 * CDC Sprint 3 — Placement types
 *
 * Mapped to live schema (verified 2026-05-18 via Management API).
 * DO NOT modify types/cdc.ts (Sprint 1+2 namespace).
 *
 * Schema source: supabase/migrations/20260518_cdc_substrate_01_masters_enums_roles_policies.sql
 * cdc_placement_status enum: offered | accepted | declined | rescinded
 */

import type { CdcPlacementStatus } from '@/types/cdc';

// Re-export for convenience — single import point for Sprint 3 consumers.
export type { CdcPlacementStatus } from '@/types/cdc';

// =====================================================================================
// Core placement row (maps cdc_placements exactly)
// =====================================================================================

export interface CdcPlacement {
  id: string;
  learner_id: string;
  drive_id: string | null;
  recruiter_id: string;
  offer_type_id: string;
  status: CdcPlacementStatus;
  round_no: number | null;
  batch_no: number;
  package_lpa: number | null;
  package_inr_total: number | null;
  job_role: string | null;
  job_location: string | null;
  is_remote: boolean;
  joining_date: string | null;          // DATE as ISO string
  offer_letter_url: string | null;
  acceptance_letter_url: string | null;
  offered_at: string;
  accepted_at: string | null;
  declined_at: string | null;
  rescinded_at: string | null;
  decline_reason: string | null;
  rescind_reason: string | null;
  is_walk_in: boolean;
  placement_mode: CdcPlacementMode;     // on_campus | off_campus | walk_in | job_fair (BUG-004045, BUG-004297)
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

// =====================================================================================
// Placement snapshot row (maps cdc_placement_snapshots exactly)
// =====================================================================================

export interface CdcPlacementSnapshot {
  id: string;
  snapshot_at: string;
  snapshot_period: string;              // e.g. '2025-Q4' or 'AY25-26'
  placement_id: string;
  learner_id: string;
  drive_id: string | null;
  recruiter_id: string;
  offer_type_id: string;
  status: CdcPlacementStatus;
  package_lpa: number | null;
  package_inr_total: number | null;
  job_role: string | null;
  job_location: string | null;
  offered_at: string | null;
  accepted_at: string | null;
  notes: string | null;
}

// =====================================================================================
// Insert / Update payloads
// =====================================================================================

export interface CdcPlacementInsert {
  learner_id: string;
  recruiter_id: string;
  offer_type_id: string;
  drive_id?: string | null;
  round_no?: number | null;
  batch_no?: number;
  package_lpa?: number | null;
  package_inr_total?: number | null;
  job_role?: string | null;
  job_location?: string | null;
  is_remote?: boolean;
  joining_date?: string | null;
  offer_letter_url?: string | null;
  is_walk_in?: boolean;
  placement_mode?: CdcPlacementMode;    // on_campus | off_campus | walk_in | job_fair (BUG-004045, BUG-004297); DB defaults on_campus
  notes?: string | null;
}

export interface CdcPlacementStatusUpdate {
  status: CdcPlacementStatus;
  // Status-specific audit fields — service layer sets these based on status
  decline_reason?: string | null;
  rescind_reason?: string | null;
  acceptance_letter_url?: string | null;
}

// =====================================================================================
// Placement mode (BUG-004045; job_fair added BUG-004297) — how/where the placement
// happened. Structural enum with an exhaustive set of 4 values; backs the text+CHECK
// column `placement_mode` on cdc_placements (NOT a master table). Only `walk_in` is
// kept in sync with the legacy `is_walk_in` boolean so the drive-required conditional
// and the NAAC/AICTE export-service (both still read is_walk_in) continue to work —
// `job_fair` leaves is_walk_in false (a career fair may still be linked to a drive).
// =====================================================================================

export const CDC_PLACEMENT_MODES = ['on_campus', 'off_campus', 'walk_in', 'job_fair'] as const;
export type CdcPlacementMode = (typeof CDC_PLACEMENT_MODES)[number];

export const CDC_PLACEMENT_MODE_LABELS: Record<CdcPlacementMode, string> = {
  on_campus: 'On-campus',
  off_campus: 'Off-campus',
  walk_in: 'Walk-in',
  job_fair: 'Job fair / Career fair',
};

// =====================================================================================
// API response shapes
// =====================================================================================

/** Extended placement with denormalised recruiter name + drive title for list view */
export interface CdcPlacementRow extends CdcPlacement {
  recruiter_name?: string;
  drive_title?: string | null;
  offer_type_label?: string;
  learner_name?: string;
  learner_roll_no?: string;
}

export interface CdcPlacementListResponse {
  data: CdcPlacementRow[];
  metadata: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

export interface CdcPlacementDetailResponse {
  placement: CdcPlacementRow;
  /** Other placement offers for the same learner — shown on detail to support accept/cascade flow */
  other_offers: Pick<CdcPlacement, 'id' | 'status' | 'drive_id' | 'recruiter_id' | 'package_lpa' | 'offered_at'>[];
}

// =====================================================================================
// Snapshot RPC response
// =====================================================================================

export interface CdcSnapshotCaptureResponse {
  cycle: string;
  rows_inserted: number;
}

// =====================================================================================
// List filters (mirrors service layer)
// =====================================================================================

export interface CdcPlacementFilters {
  drive_id?: string;
  status?: CdcPlacementStatus | CdcPlacementStatus[];
  recruiter_id?: string;
  offer_type_id?: string;
  learner_id?: string;
  institution_id?: string;     // joined through drive.institutions[]
  cycle?: string;              // academic year label for snapshot filtering
  search?: string;             // ilike on job_role or recruiter name
  page?: number;
  pageSize?: number;
}

// =====================================================================================
// Status labels (UI display)
// =====================================================================================

export const CDC_PLACEMENT_STATUS_LABELS: Record<CdcPlacementStatus, string> = {
  offered: 'Offered',
  accepted: 'Accepted',
  declined: 'Declined',
  rescinded: 'Rescinded',
};

export const CDC_PLACEMENT_STATUS_COLORS: Record<CdcPlacementStatus, string> = {
  offered: 'bg-blue-100 text-blue-800',
  accepted: 'bg-green-100 text-green-800',
  declined: 'bg-gray-100 text-gray-600',
  rescinded: 'bg-red-100 text-red-800',
};

/**
 * Returns true when the coordinator can still transition this placement.
 * Accepted / declined / rescinded are terminal.
 */
export function isPlacementTerminal(status: CdcPlacementStatus): boolean {
  return status === 'accepted' || status === 'declined' || status === 'rescinded';
}
