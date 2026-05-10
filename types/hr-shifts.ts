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
