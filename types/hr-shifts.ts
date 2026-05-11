/**
 * HR Shifts — TypeScript contracts for templates + assignments.
 * Created: 2026-05-10 (T1.6 Phase 2a).
 * Spec: specs/hr-module-decomposition-2026-05-09.md
 *
 * Mirrors the schema in supabase/migrations/20260510004200_create_hr_shift_templates_and_assignments.sql
 * verbatim — no inference. The service (lib/services/hr/shift-service.ts) and
 * UI pages (app/(routes)/admin/hr/shift-templates/page.tsx,
 * app/(routes)/hr/shifts/page.tsx, app/(routes)/hr/shifts/my/page.tsx) read
 * these types as their source of truth.
 */

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export interface HRShiftTemplate {
  id: string;
  template_code: string;
  template_name: string;
  /** time string 'HH:MM:SS' (no timezone). */
  start_time: string;
  /** time string 'HH:MM:SS'. If end < start, the assignment spans midnight. */
  end_time: string;
  /** true = visible to all institutions; institution_id must be null. */
  is_global: boolean;
  /** Institution scope. Null when is_global=true; required otherwise. */
  institution_id: string | null;
  /** Optional grouping ('hostel','security','transport','lab','faculty'). */
  category: string | null;
  notes: string | null;
  is_active: boolean;
  valid_from: string;
  valid_until: string | null;
  superseded_by: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface HRShiftTemplateInsert {
  template_code: string;
  template_name: string;
  start_time: string;
  end_time: string;
  is_global?: boolean;
  institution_id?: string | null;
  category?: string | null;
  notes?: string | null;
  is_active?: boolean;
}

export type HRShiftTemplateUpdate = Partial<
  Pick<
    HRShiftTemplate,
    | 'template_code'
    | 'template_name'
    | 'start_time'
    | 'end_time'
    | 'is_global'
    | 'institution_id'
    | 'category'
    | 'notes'
    | 'is_active'
    | 'valid_until'
    | 'superseded_by'
  >
>;

export interface ShiftTemplateFilters {
  institutionId?: string | null;
  /** When set, only return active rows. Defaults to true in service. */
  activeOnly?: boolean;
  category?: string;
  search?: string;
}

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

export interface HRShiftAssignment {
  id: string;
  staff_id: string;
  template_id: string | null;
  start_time_override: string | null;
  end_time_override: string | null;
  effective_from: string;
  effective_until: string | null;
  /** 1=single-week (default); 2-4=multi-week opt-in. */
  rotation_weeks: number;
  /** Multi-week only. Expected: array of {week, template_id}. */
  rotation_pattern: unknown | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface HRShiftAssignmentInsert {
  staff_id: string;
  template_id?: string | null;
  start_time_override?: string | null;
  end_time_override?: string | null;
  effective_from: string;
  effective_until?: string | null;
  rotation_weeks?: number;
  rotation_pattern?: unknown | null;
  notes?: string | null;
}

export type HRShiftAssignmentUpdate = Partial<
  Pick<
    HRShiftAssignment,
    | 'template_id'
    | 'start_time_override'
    | 'end_time_override'
    | 'effective_from'
    | 'effective_until'
    | 'rotation_weeks'
    | 'rotation_pattern'
    | 'notes'
  >
>;

export interface ShiftAssignmentFilters {
  institutionId?: string | null;
  /** ISO date 'YYYY-MM-DD'. Returns assignments active on this date. */
  asOf?: string;
  staffId?: string;
}

// ---------------------------------------------------------------------------
// Joined / view shapes for UI rendering.
// ---------------------------------------------------------------------------

/**
 * Effective hours computed from template + override (override takes precedence).
 * Returned by service.getMyShiftAssignment() and the HR assignment listing.
 */
export interface EffectiveShiftHours {
  start_time: string;
  end_time: string;
  /** 'template' if inherited from template, 'override' if start/end override is set. */
  source: 'template' | 'override' | 'mixed';
}

/**
 * Assignment with template denormalized + computed effective hours.
 * UI-friendly shape; service composes this from two queries (assignment +
 * template) since hr_shift_assignments has no FK PostgREST embed convention
 * configured in this codebase.
 */
export interface HRShiftAssignmentWithTemplate extends HRShiftAssignment {
  template: HRShiftTemplate | null;
  effective: EffectiveShiftHours;
  /** Optional staff display fields for the HR assignments table. */
  staff_name?: string | null;
  staff_no?: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute effective shift hours: override wins per field; falls back to template.
 * Pure function — used both server-side (service) and client-side (UI).
 */
export function computeEffectiveHours(
  assignment: Pick<HRShiftAssignment, 'start_time_override' | 'end_time_override'>,
  template: Pick<HRShiftTemplate, 'start_time' | 'end_time'> | null,
): EffectiveShiftHours | null {
  const startOverride = assignment.start_time_override;
  const endOverride = assignment.end_time_override;
  const tplStart = template?.start_time ?? null;
  const tplEnd = template?.end_time ?? null;

  const start = startOverride ?? tplStart;
  const end = endOverride ?? tplEnd;
  if (!start || !end) return null;

  let source: EffectiveShiftHours['source'] = 'template';
  if (startOverride && endOverride) source = 'override';
  else if (startOverride || endOverride) source = 'mixed';

  return { start_time: start, end_time: end, source };
}

/**
 * Common categories surfaced in the admin UI dropdown. Free-form text in DB
 * (any value allowed); UI hints these as friendly defaults.
 */
export const SHIFT_CATEGORY_OPTIONS = [
  { value: 'hostel', label: 'Hostel' },
  { value: 'security', label: 'Security' },
  { value: 'transport', label: 'Transport' },
  { value: 'lab', label: 'Lab' },
  { value: 'faculty', label: 'Faculty' },
  { value: 'admin', label: 'Admin / Office' },
  { value: 'general', label: 'General' },
] as const;

// ---------------------------------------------------------------------------
// Swap Requests (T1.6 Phase 2b)
// ---------------------------------------------------------------------------

/**
 * Lifecycle state of a swap request. See migration COMMENT for transitions.
 *
 *   pending                 — requester filed; waiting on counterparty
 *   counterparty_accepted   — counterparty agreed; queued for HR review
 *   approved                — HR approved (per-day override on swap_date)
 *   rejected                — HR rejected (terminal)
 *   cancelled               — requester cancelled (terminal)
 *   expired                 — swap_date passed without resolution (terminal)
 */
export type HRShiftSwapStatus =
  | 'pending'
  | 'counterparty_accepted'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'expired';

export interface HRShiftSwapRequest {
  id: string;
  requester_assignment_id: string;
  requester_staff_id: string;
  /** Null when both counterparty fields are null (an "open swap" awaiting any willing partner). */
  counterparty_assignment_id: string | null;
  counterparty_staff_id: string | null;
  /** ISO date 'YYYY-MM-DD'. Single calendar date the swap applies to. */
  swap_date: string;
  reason: string | null;
  status: HRShiftSwapStatus;
  counterparty_consent_at: string | null;
  hr_approved_by: string | null;
  hr_approved_at: string | null;
  hr_review_notes: string | null;
  requested_at: string;
  created_at: string;
  updated_at: string;
}

export interface HRShiftSwapRequestInsert {
  requester_assignment_id: string;
  requester_staff_id: string;
  counterparty_assignment_id?: string | null;
  counterparty_staff_id?: string | null;
  swap_date: string;
  reason?: string | null;
}

/** Joined display shape for queues (HR review, employee inbox, employee outbox). */
export interface HRShiftSwapRequestWithStaff extends HRShiftSwapRequest {
  requester_name: string | null;
  requester_staff_no: string | null;
  counterparty_name: string | null;
  counterparty_staff_no: string | null;
}

export interface SwapRequestFilters {
  /** Filter by status. Omit to return all. Pass an array to combine. */
  status?: HRShiftSwapStatus | HRShiftSwapStatus[];
  /** Filter by requester staff. */
  requesterStaffId?: string;
  /** Filter by counterparty staff. */
  counterpartyStaffId?: string;
  /**
   * HR review queue helper: when true, returns rows in 'pending' or
   * 'counterparty_accepted' status (anything awaiting HR action), and
   * orders by swap_date ascending (soonest first).
   */
  hrReviewQueue?: boolean;
  /** ISO date inclusive lower bound on swap_date. */
  swapDateFrom?: string;
  /** ISO date inclusive upper bound on swap_date. */
  swapDateTo?: string;
  /** Pagination cap (defaults to 200 in service). */
  limit?: number;
}

/**
 * Plain-English label for a status badge. Lives next to the type so all
 * surfaces (HR queue, employee inbox/outbox) render consistently.
 */
export const SWAP_STATUS_LABEL: Record<HRShiftSwapStatus, string> = {
  pending: 'Pending counterparty',
  counterparty_accepted: 'Awaiting HR review',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

/**
 * Multi-week rotation pattern entry — one per week in a 1..4 cycle.
 * Stored as jsonb on hr_shift_assignments.rotation_pattern.
 */
export interface RotationPatternEntry {
  /** 1-indexed week number within the rotation. */
  week: number;
  /** Template id applied that week. */
  template_id: string;
}

/**
 * Validate a rotation_pattern jsonb against a declared rotation_weeks count.
 * Returns null when valid; error string when invalid. Used by both the form
 * validator (immediate UX) and the service (defense in depth).
 */
export function validateRotationPattern(
  rotationWeeks: number,
  pattern: unknown,
): string | null {
  if (rotationWeeks <= 1) {
    if (pattern == null) return null;
    return 'Rotation pattern must be empty when rotation_weeks=1.';
  }
  if (!Array.isArray(pattern)) {
    return `Rotation pattern must be a list of ${rotationWeeks} entries when rotation_weeks=${rotationWeeks}.`;
  }
  if (pattern.length !== rotationWeeks) {
    return `Rotation pattern needs exactly ${rotationWeeks} entries — got ${pattern.length}.`;
  }
  const seen = new Set<number>();
  for (const raw of pattern) {
    if (
      !raw ||
      typeof raw !== 'object' ||
      typeof (raw as { week?: unknown }).week !== 'number' ||
      typeof (raw as { template_id?: unknown }).template_id !== 'string'
    ) {
      return 'Each rotation pattern entry needs {week: number, template_id: string}.';
    }
    const w = (raw as { week: number }).week;
    if (w < 1 || w > rotationWeeks || !Number.isInteger(w)) {
      return `Week numbers must be 1..${rotationWeeks}.`;
    }
    if (seen.has(w)) return `Week ${w} appears more than once in the rotation pattern.`;
    seen.add(w);
    if (!(raw as { template_id: string }).template_id.trim()) {
      return `Week ${w} is missing a template selection.`;
    }
  }
  return null;
}
