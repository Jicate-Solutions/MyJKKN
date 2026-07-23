/**
 * HR Policy Audit types — Wave 3 B4
 * ==========================================================================
 * Standalone type definitions for the hr_policy_audit_log table and related
 * publish/unpublish flows. Complements the inline types in
 * lib/services/hr/wave3-policy-editor-service.ts but is importable from
 * hooks and UI components without pulling the full service.
 */

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

/** Matches hr_policy_audit_log.action CHECK constraint. */
export type PolicyChangeType =
  | 'edit_draft'
  | 'publish'
  | 'unpublish'
  | 'classify_change'
  | 'promote_to_global';

/** One row from hr_policy_audit_log, enriched with editor profile info. */
export interface HRPolicyAuditLogEntry {
  id: string;
  policy_id: string;
  policy_key: string;
  scope_type: 'global' | 'institution' | 'role' | 'user';
  scope_id: string | null;
  action: PolicyChangeType;
  old_value: unknown | null;
  new_value: unknown | null;
  reason: string;
  edited_by: string;
  edited_at: string;
  /** Joined from profiles — may be null if profile lookup fails. */
  editor_name?: string | null;
  editor_email?: string | null;
}

/** Query filters for paginated audit log endpoints. */
export interface PolicyAuditFilters {
  policy_key?: string;
  institution_id?: string;
  change_type?: PolicyChangeType;
  edited_by?: string;
  from_date?: string; // ISO date string
  to_date?: string;   // ISO date string
  page?: number;
  page_size?: number;
}

// ---------------------------------------------------------------------------
// Publication state (mirrors platform_policies columns)
// ---------------------------------------------------------------------------

export type PolicyPublicationState = 'draft_only' | 'published' | 'draft_pending';
export type PolicyClassification = 'operational' | 'major';

/** Subset of platform_policies columns relevant to the draft/publish toggle. */
export interface PolicyPublicationInfo {
  id: string;
  policy_key: string;
  publication_state: PolicyPublicationState;
  classification: PolicyClassification;
  draft_value: unknown | null;
  value: unknown;
  published_at: string | null;
  published_by: string | null;
  /** Joined from profiles on published_by. */
  publisher_name?: string | null;
  updated_at: string | null;
}

// ---------------------------------------------------------------------------
// API request/response shapes
// ---------------------------------------------------------------------------

export interface PublishPolicyRequest {
  policy_key: string;
  scope_type: 'global' | 'institution' | 'role' | 'user';
  scope_id: string | null;
  reason: string;
}

export interface UnpublishPolicyRequest {
  policy_key: string;
  scope_type: 'global' | 'institution' | 'role' | 'user';
  scope_id: string | null;
  reason: string;
}
