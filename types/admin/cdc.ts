/**
 * types/admin/cdc.ts
 * Types for the /cdc/admin/* admin surface (Sprint 7a) and the
 * app/api/admin/cdc/* routes + lib/services/admin/cdc-admin-service.ts.
 *
 * These extend (not duplicate) the domain types in types/cdc.ts.
 * The master-table shape is thin — full types live in types/cdc.ts.
 *
 * History: authored in the Sprint 7a CDC admin build but never committed to
 * main — 7 files imported `@/types/admin/cdc` while the module only existed
 * in a local wip commit (4320b2152), so whole-repo tsc flagged TS2307
 * (builds passed only because Turbopack erases type-only imports).
 * Restored verbatim 2026-06-11; shapes verified against all 7 importers.
 */

// =====================================================================================
// Policy admin
// =====================================================================================

/**
 * A single platform_policies row in the cdc.* namespace, shaped for the admin UI.
 */
export interface CdcPolicyRow {
  policy_key: string;
  value: unknown; // raw JSONB — UI serialises before display
  description: string | null;
  data_type: 'boolean' | 'number' | 'string' | 'object';
  classification: 'major' | 'operational';
  updated_at: string | null;
  updated_by: string | null;
}

/** The categories used to group CDC policies in the UI. */
export type CdcPolicyCategory =
  | 'eligibility'
  | 'drive_lifecycle'
  | 'willingness'
  | 'escalation'
  | 'placement'
  | 'internship'
  | 'attachments'
  | 'export';

export interface CdcPolicyGroup {
  category: CdcPolicyCategory;
  label: string;
  description: string;
  policies: CdcPolicyRow[];
}

// =====================================================================================
// Master table admin — generic list/edit shape
// =====================================================================================

/** Allowed master table names — the API route validates this list. */
export type CdcMasterTable =
  | 'cdc_drive_types'
  | 'cdc_offer_types'
  | 'cdc_training_types'
  | 'cdc_workshop_types'
  | 'cdc_industry_sectors'
  | 'cdc_recruiters'
  | 'cdc_mentor_categories'
  | 'cdc_mentorship_categories'
  | 'cdc_internship_types'
  | 'cdc_expertise_areas'
  | 'cdc_exam_syllabus_topics';  // 2026-07-04 govt-job-readiness (PR-4 / Option B)

/** Minimal row shape used for listing; full shapes live in types/cdc.ts. */
export interface CdcMasterRow {
  id: string;
  display_name: string;
  is_active: boolean;
  is_system?: boolean;
  sort_order?: number;
  created_at: string;
  updated_at: string;
}

// =====================================================================================
// Cron status
// =====================================================================================

export interface CdcCronJobStatus {
  jobname: string;
  schedule: string;
  last_run: string | null;
  last_status: 'succeeded' | 'failed' | null;
  next_run: string | null;
}

// =====================================================================================
// API response types
// =====================================================================================

export interface CdcAdminApiOk<T> {
  ok: true;
  data: T;
}

export interface CdcAdminApiError {
  ok: false;
  error: string;
}

export type CdcAdminApiResult<T> = CdcAdminApiOk<T> | CdcAdminApiError;
