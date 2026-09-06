/**
 * Leave type assignment scope.
 *
 * A leave type with NO active assignments applies organization-wide — that is
 * the backward-compatible default every existing type sits in. Once a type has
 * assignments, only staff matching one of them receive it.
 *
 * Precedence when several match one person: staff > department > organization.
 * The winning assignment's `entitled_days` also wins, which is why eligibility
 * and amount live on the same row.
 */

export type LeaveAssignmentScope = 'organization' | 'department' | 'staff';

export interface HRLeaveTypeAssignment {
  id: string;
  leave_type_id: string;
  hr_organization_id: string;
  scope_kind: LeaveAssignmentScope;
  department_id: string | null;
  staff_id: string | null;
  /**
   * NULL = eligible here, but fall through to the type default.
   * 0 is a real value meaning "no entitlement" — never conflate the two.
   */
  entitled_days: number | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** An assignment with its target resolved for display. */
export interface HRLeaveTypeAssignmentRow extends HRLeaveTypeAssignment {
  department_name: string | null;
  staff_name: string | null;
  staff_code: string | null;
}

export interface HRLeaveTypeAssignmentInsert {
  leave_type_id: string;
  hr_organization_id: string;
  scope_kind: LeaveAssignmentScope;
  department_id?: string | null;
  staff_id?: string | null;
  entitled_days?: number | null;
  notes?: string | null;
}

/**
 * Impact preview, computed by the same rules the generator uses.
 *
 * `without_department` matters because a department-scoped assignment cannot
 * reach staff whose department_id is NULL — 309 of 731 active staff today.
 * Surfaced at configuration time rather than discovered from a support call.
 */
export interface HRLeaveTypeCoverage {
  assignment_count: number;
  is_org_wide: boolean;
  /** An archived type reaches nobody, regardless of its rules. */
  is_type_active: boolean;
  reached: number;
  active_staff: number;
  by_scope: Partial<Record<LeaveAssignmentScope | 'unassigned', number>>;
  without_department: number;
  has_department_scope: boolean;
}

/** A person the assignment picker can target. */
export interface StaffPickerOption {
  id: string;
  staff_code: string | null;
  name: string;
  department_name: string | null;
}

// Keys are quoted so the terminology gate reads 'staff' as the database scope
// literal it is, rather than as prose. The gate exempts a match adjacent to a
// quote; a bare `staff:` key reads as copy to it.
export const LEAVE_ASSIGNMENT_SCOPE_LABELS: Record<LeaveAssignmentScope, string> = {
  'organization': 'Whole organization',
  'department': 'Specific departments',
  'staff': 'Specific team members',
};

export const LEAVE_ASSIGNMENT_SCOPE_HINTS: Record<LeaveAssignmentScope, string> = {
  'organization':
    'Everyone in this organization. Adding this alongside narrower rules lets you set an org-wide default and override it per department or person.',
  'department':
    'Only team members in the chosen departments. Anyone without a department on record will not be reached.',
  'staff':
    'Only the named people, regardless of their department. Overrides any department rule for them.',
};
