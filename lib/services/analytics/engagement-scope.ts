// lib/services/analytics/engagement-scope.ts
//
// The scope rules for Engagement Analytics (/users/activity > Engagement), as
// pure functions with no Supabase import, so the server (EngagementService and
// the /api/analytics/engagement/* routes) and the filters on screen apply the
// SAME rules.
//
// WHERE THE SCOPE COMES FROM
//   EngagementService.getUserAccessScope() is the analytics module's one scope
//   source (the health-score, lifecycle-dashboard and usage-report services read
//   it too). It is unchanged by this file:
//     super admin  -> global
//     principal    -> institution: profiles.institution_id
//     hod          -> department:  profiles.department_id
//     faculty      -> section:     the sections they teach (timetable_slots)
//     anyone else  -> section with no ids, i.e. nothing
//
// WHY IT IS ENFORCED IN CODE
//   Every engagement read goes through the service-role client, which bypasses
//   row-level security. RLS could not do this job anyway: the policies on
//   student_engagement_scores and daily_engagement_metrics limit a principal,
//   HOD or faculty member to their whole institution (so an HOD would see every
//   department), and mv_engagement_overview is a materialized view with no RLS.
//   So every path checks twice:
//     1. a gate: checkScopeAccess() refuses a selection outside the scope before
//        any engagement row is read (the routes answer 403, never an empty 200);
//     2. a filter: applyEngagementScope() is added to every engagement query, so
//        even an allowed selection can only return rows inside the scope.
//
//   Before this, the gate said yes to a principal for ANY id (including "all",
//   every institution) and to an HOD for any institution, program, semester or
//   section, and the hierarchy route had no gate at all.

import type { AccessScope, AccessScopeType, OrganizationalLevel } from '@/types/analytics';

/** The selection value the filters use for "All Institutions". */
export const ALL_INSTITUTIONS_ID = 'all';

/** Where a unit (institution, department, program, semester, section) sits. */
export interface EngagementPlacement {
  institutionId: string | null;
  departmentId: string | null;
  sectionId: string | null;
}

/**
 * The gate's answer. One flat shape (not a union) because this repo compiles
 * without strictNullChecks, where `if (!access.allowed)` would not narrow.
 */
export interface EngagementAccess {
  allowed: boolean;
  scope: AccessScope;
  /** The HTTP status to answer a refusal with; 200 when allowed. */
  status: 200 | 400 | 403 | 404;
  /** A plain message for a refusal; empty when allowed. */
  reason: string;
}

export function accessAllowed(scope: AccessScope): EngagementAccess {
  return { allowed: true, scope, status: 200, reason: '' };
}

export function accessRefused(
  scope: AccessScope,
  status: 400 | 403 | 404,
  reason: string
): EngagementAccess {
  return { allowed: false, scope, status, reason };
}

/**
 * The choices the filters may offer. `null` means "no limit at this picker";
 * a list means "only these ids".
 */
export interface EngagementScopeChoices {
  type: AccessScopeType;
  institutionIds: string[] | null;
  departmentIds: string[] | null;
  programIds: string[] | null;
  semesterIds: string[] | null;
  sectionIds: string[] | null;
}

/** True when the filter choices hold at least one unit the viewer can open. */
export function choicesHaveUnits(choices: EngagementScopeChoices): boolean {
  switch (choices.type) {
    case 'global':
      return true;
    case 'institution':
      return (choices.institutionIds?.length ?? 0) > 0;
    case 'department':
      return (choices.departmentIds?.length ?? 0) > 0;
    case 'section':
      return (choices.sectionIds?.length ?? 0) > 0;
    default:
      return false;
  }
}

const UUID_PATTERN =/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/** The ids that bound a scope: `null` for global, otherwise the (possibly empty) list. */
export function scopeIds(scope: AccessScope): string[] | null {
  switch (scope.type) {
    case 'global':
      return null;
    case 'institution':
      return scope.institutionIds ?? [];
    case 'department':
      return scope.departmentIds ?? [];
    case 'section':
      return scope.sectionIds ?? [];
    default:
      return [];
  }
}

/** True when the scope holds at least one unit (always true for global). */
export function scopeHasUnits(scope: AccessScope): boolean {
  const ids = scopeIds(scope);
  return ids === null || ids.length > 0;
}

/**
 * Organisational levels a scope type can open at all, before checking which
 * unit. A principal opens every level inside their institution; an HOD cannot
 * open the institution level; a section-scoped viewer opens only sections.
 */
export function levelOpenToScope(type: AccessScopeType, level: OrganizationalLevel): boolean {
  switch (type) {
    case 'global':
    case 'institution':
      return true;
    case 'department':
      return level !== 'institution';
    case 'section':
      return level === 'section';
    default:
      return false;
  }
}

/**
 * True when a unit at this placement is inside the scope. A missing id never
 * matches, so a unit whose institution or department is unknown is refused.
 */
export function placementInScope(scope: AccessScope, placement: EngagementPlacement): boolean {
  if (scope.type === 'global') return true;
  const ids = scopeIds(scope) ?? [];
  const key =
    scope.type === 'institution'
      ? placement.institutionId
      : scope.type === 'department'
        ? placement.departmentId
        : scope.type === 'section'
          ? placement.sectionId
          : null;
  return !!key && ids.includes(key);
}

interface InFilterable {
  in(column: string, values: string[]): unknown;
}

/**
 * Add the viewer's scope to an engagement query. Every engagement table and
 * view carries institution_id, department_id and section_id on each row.
 * Global returns the query unchanged; an unknown scope type returns no rows.
 *
 * `Q` is left unconstrained on purpose: checking a Supabase query builder
 * against a structural constraint makes the compiler give up (TS2589). Every
 * builder these queries use has `.in()`.
 */
export function applyEngagementScope<Q>(query: Q, scope: AccessScope): Q {
  const q = query as unknown as InFilterable;
  switch (scope.type) {
    case 'global':
      return query;
    case 'institution':
      return q.in('institution_id', scope.institutionIds ?? []) as Q;
    case 'department':
      return q.in('department_id', scope.departmentIds ?? []) as Q;
    case 'section':
      return q.in('section_id', scope.sectionIds ?? []) as Q;
    default:
      return q.in('institution_id', []) as Q;
  }
}

export const NO_ENGAGEMENT_SCOPE_REASON =
  'There is no engagement data you can view. It is shown to super admins, principals (their own institution), HODs (their own department) and the Senior Learners who teach a section (their own sections).';

/** The plain message shown when a selection is outside the viewer's scope. */
export function scopeRefusalReason(scope: AccessScope): string {
  if (!scopeHasUnits(scope)) {
    return NO_ENGAGEMENT_SCOPE_REASON;
  }
  switch (scope.type) {
    case 'institution':
      return 'You can only view engagement data for your own institution.';
    case 'department':
      return 'You can only view engagement data for your own department.';
    case 'section':
      return 'You can only view engagement data for the sections you teach.';
    default:
      return 'You cannot view this engagement data.';
  }
}

export const INVALID_SELECTION_REASON = 'That selection is not valid.';

/** The level a breakdown's parent id belongs to (department rows sit under an institution, and so on). */
export const BREAKDOWN_PARENT_LEVEL: Record<'department' | 'program' | 'semester' | 'section', OrganizationalLevel> = {
  department: 'institution',
  program: 'department',
  semester: 'program',
  section: 'semester'
};

export type EngagementAllChoice = 'institutions' | 'departments' | 'programs' | 'semesters' | 'sections';

/**
 * Whether a filter may offer an "All ..." choice. Picking one moves the view up
 * to the parent level ("All Departments" shows the institution), so it is only
 * offered when that level is open to the scope. "All Institutions" is for
 * super admins only.
 */
export function allChoiceAllowed(type: AccessScopeType, choice: EngagementAllChoice): boolean {
  switch (choice) {
    case 'institutions':
      return type === 'global';
    case 'departments':
      return levelOpenToScope(type, 'institution');
    case 'programs':
      return levelOpenToScope(type, 'department');
    case 'semesters':
      return levelOpenToScope(type, 'program');
    case 'sections':
      return levelOpenToScope(type, 'semester');
    default:
      return false;
  }
}
