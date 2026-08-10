// ============================================
// STAFF INCOMPLETE-PROFILE FILTER CONTRACT
// ============================================
// Created: 2026-08-10
// Both directions of the wire contract for
// GET /api/staff/incomplete-profiles, deliberately in ONE file: the client's
// buildIncompleteStaffQuery and the server's parseIncompleteStaffParams are
// two halves of the same agreement, and keeping them apart is exactly how a
// renamed param becomes a filter that silently does nothing. The round-trip
// test in __tests__/lib/utils/staff/ guards that.
// ============================================

import type { StaffFieldScope } from './incomplete-profile-fields';

/** Sentinel for "no filter applied" — Radix Select forbids an empty item value. */
export const ALL = 'all';
/** Sentinel for "this column has no value". */
export const FIELD_MISSING = '__missing__';
/** Biometric only: "has any code at all" — the inverse of FIELD_MISSING. */
export const FIELD_ASSIGNED = '__assigned__';

export const MAX_INCOMPLETE_STAFF_LIMIT = 100;
export const DEFAULT_INCOMPLETE_STAFF_LIMIT = 25;
export const DEFAULT_SORT_BY = 'missing_count';

/**
 * Sort keys the API honours. `missing_count` is synthetic (computed in JS);
 * everything else is a real `staff` column. Columns backed by an embedded join
 * are absent on purpose — the table must not offer a sort the API ignores.
 */
export const SORTABLE_STAFF_COLUMNS = new Set([
  'missing_count',
  'first_name',
  'last_name',
  'email',
  'staff_id',
  'designation',
  'date_of_joining',
  // 'created_at' is deliberately NOT allowlisted here: DataTable defaults its
  // sortBy state to 'created_at', so allowlisting it would make that the
  // silent default sort instead of DEFAULT_SORT_BY ('missing_count') below —
  // inverting the feature's headline behaviour with no visible signal (there
  // is no created_at column, so no sort arrow would appear).
  'biometric_id',
]);

export interface IncompleteStaffFilterState {
  // Completion
  fieldScope: StaffFieldScope;
  missingField: string; // a staff column name, or ALL

  // Organisation (cascading; both accept FIELD_MISSING)
  institutionId: string;
  departmentId: string;

  // Employment
  categoryId: string;
  designation: string;
  isActive: string; // 'active' | 'inactive' | ALL
  recordStatus: string; // 'draft' | 'published' | ALL

  // Demographic
  gender: string;
  maritalStatus: string;
  bloodGroup: string;
  joinedFrom: string; // ISO date, '' when unset
  joinedTo: string;

  // Identity
  staffIdQuery: string; // free text, or FIELD_MISSING
  biometricCode: string; // free text, FIELD_MISSING, or FIELD_ASSIGNED
  biometricMachineId: string; // machine id, or FIELD_MISSING
}

export const DEFAULT_INCOMPLETE_STAFF_FILTERS: IncompleteStaffFilterState = {
  // 'all' reproduces exactly what the table showed before this feature.
  fieldScope: 'all',
  missingField: ALL,
  institutionId: ALL,
  departmentId: ALL,
  categoryId: ALL,
  designation: ALL,
  isActive: ALL,
  recordStatus: ALL,
  gender: ALL,
  maritalStatus: ALL,
  bloodGroup: ALL,
  joinedFrom: '',
  joinedTo: '',
  staffIdQuery: '',
  biometricCode: '',
  biometricMachineId: ALL,
};

/**
 * Apply a patch, cascading the resets it implies.
 *
 * Institution owns Department: a department id belongs to exactly one
 * institution, so carrying a stale one across an institution change would
 * filter to another college's department and return nothing — an empty table
 * that looks like a data problem rather than a filter problem.
 */
export function applyFilterPatch(
  state: IncompleteStaffFilterState,
  patch: Partial<IncompleteStaffFilterState>
): IncompleteStaffFilterState {
  const next = { ...state, ...patch };
  // Only reset when the patch is silent on departmentId — a patch that sets
  // both together (e.g. restoring state from a URL) is deliberately choosing
  // that pair, not carrying a stale department across an institution change.
  if (
    patch.institutionId !== undefined &&
    patch.institutionId !== state.institutionId &&
    patch.departmentId === undefined
  ) {
    next.departmentId = ALL;
  }
  return next;
}

export function countActiveFilters(state: IncompleteStaffFilterState): number {
  const keys = Object.keys(
    DEFAULT_INCOMPLETE_STAFF_FILTERS
  ) as (keyof IncompleteStaffFilterState)[];
  return keys.filter((key) => state[key] !== DEFAULT_INCOMPLETE_STAFF_FILTERS[key]).length;
}

export interface IncompleteStaffQuery extends Partial<IncompleteStaffFilterState> {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export function buildIncompleteStaffQuery(query: IncompleteStaffQuery): string {
  const params = new URLSearchParams();
  const put = (key: string, value: string | undefined | null) => {
    if (value === undefined || value === null || value === '' || value === ALL) return;
    params.set(key, value);
  };

  // 'all' is the default scope, so omitting it keeps the URL short.
  put('fieldScope', query.fieldScope === 'all' ? undefined : query.fieldScope);
  put('missingField', query.missingField);
  put('institutionId', query.institutionId);
  put('departmentId', query.departmentId);
  put('categoryId', query.categoryId);
  put('designation', query.designation);
  put('isActive', query.isActive);
  put('recordStatus', query.recordStatus);
  put('gender', query.gender);
  put('maritalStatus', query.maritalStatus);
  put('bloodGroup', query.bloodGroup);
  put('joinedFrom', query.joinedFrom);
  put('joinedTo', query.joinedTo);
  // The UI calls this staffIdQuery to avoid colliding with the staff_id column
  // in row data; the wire name is the plain one.
  put('staffId', query.staffIdQuery);
  put('biometricCode', query.biometricCode);
  put('biometricMachineId', query.biometricMachineId);
  put('search', query.search);
  put('sortBy', query.sortBy);
  put('sortOrder', query.sortOrder);

  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));

  return params.toString();
}

export interface ParsedIncompleteStaffParams {
  fieldScope: StaffFieldScope;
  missingField?: string;
  institutionId?: string;
  departmentId?: string;
  categoryId?: string;
  designation?: string;
  isActive?: 'active' | 'inactive';
  recordStatus?: string;
  gender?: string;
  maritalStatus?: string;
  bloodGroup?: string;
  joinedFrom?: string;
  joinedTo?: string;
  staffId?: string;
  biometricCode?: string;
  biometricMachineId?: string;
  search: string;
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const parsed = parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(min, parsed), max);
}

export function parseIncompleteStaffParams(
  searchParams: URLSearchParams
): ParsedIncompleteStaffParams {
  const get = (key: string): string | undefined => {
    const value = searchParams.get(key);
    return value && value !== ALL ? value : undefined;
  };

  const rawScope = searchParams.get('fieldScope');
  const fieldScope: StaffFieldScope =
    rawScope === 'required' || rawScope === 'optional' ? rawScope : 'all';

  const rawActive = searchParams.get('isActive');
  const isActive =
    rawActive === 'active' || rawActive === 'inactive' ? rawActive : undefined;

  const rawSortBy = searchParams.get('sortBy') ?? '';
  const sortBy = SORTABLE_STAFF_COLUMNS.has(rawSortBy) ? rawSortBy : DEFAULT_SORT_BY;

  return {
    fieldScope,
    missingField: get('missingField'),
    institutionId: get('institutionId'),
    departmentId: get('departmentId'),
    categoryId: get('categoryId'),
    designation: get('designation'),
    isActive,
    recordStatus: get('recordStatus'),
    gender: get('gender'),
    maritalStatus: get('maritalStatus'),
    bloodGroup: get('bloodGroup'),
    joinedFrom: get('joinedFrom'),
    joinedTo: get('joinedTo'),
    staffId: get('staffId'),
    biometricCode: get('biometricCode'),
    biometricMachineId: get('biometricMachineId'),
    search: (searchParams.get('search') ?? '').trim(),
    page: clampInt(searchParams.get('page'), 1, 1, Number.MAX_SAFE_INTEGER),
    limit: clampInt(
      searchParams.get('limit'),
      DEFAULT_INCOMPLETE_STAFF_LIMIT,
      1,
      MAX_INCOMPLETE_STAFF_LIMIT
    ),
    sortBy,
    sortOrder: searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc',
  };
}

/**
 * Columns where comparing to '' is a type error, not just a false match — the
 * rule is not "uuid", it is "any column where `= ''` doesn't typecheck":
 * uuid, date, timestamp, boolean, numeric all qualify. Postgres raises
 * "invalid input syntax for type X" and PostgREST fails the whole request
 * with a 400 (surfaced by the route as a 500). Text columns must check both
 * null and '', because several `staff` columns store '' where others store
 * NULL, and isFieldMissing() treats the two identically.
 *
 * Verified against information_schema: date_of_birth/date_of_joining are
 * `date`, created_at is `timestamptz`, is_active is `boolean` — none of the
 * four can be compared to ''.
 */
const NULL_ONLY_COLUMNS = new Set([
  'institution_id',
  'department_id',
  'category_id',
  'biometric_institution_id',
  'profile_id',
  'date_of_birth',
  'date_of_joining',
  'created_at',
  'is_active',
]);

/** PostgREST `.or()` argument meaning "this column has no value". */
export function missingColumnFilter(column: string): string {
  return NULL_ONLY_COLUMNS.has(column)
    ? `${column}.is.null`
    : `${column}.is.null,${column}.eq.`;
}

const SEARCH_COLUMNS = [
  'first_name',
  'last_name',
  'email',
  'institution_email',
  'staff_id',
  'biometric_id',
] as const;

export function matchesSearch(row: Record<string, unknown>, term: string): boolean {
  if (!term) return true;
  const needle = term.toLowerCase();
  for (const column of SEARCH_COLUMNS) {
    if (String(row[column] ?? '').toLowerCase().includes(needle)) return true;
  }
  // Also match across the name boundary, so "asha kum" finds a row whose
  // columns hold the two halves separately.
  return `${row.first_name ?? ''} ${row.last_name ?? ''}`.toLowerCase().includes(needle);
}

/**
 * Order two rows. Ties always fall back to a stable key: without one, rows with
 * equal sort values can swap between two fetches and a user paging forward sees
 * the same person twice while another never appears.
 */
export function compareIncompleteRows(
  a: Record<string, unknown> & { missing_count: number },
  b: Record<string, unknown> & { missing_count: number },
  sortBy: string,
  sortOrder: 'asc' | 'desc'
): number {
  const direction = sortOrder === 'asc' ? 1 : -1;

  if (sortBy === 'missing_count') {
    const diff = (a.missing_count - b.missing_count) * direction;
    if (diff !== 0) return diff;
    return String(a.first_name ?? '').localeCompare(String(b.first_name ?? ''));
  }

  const left = a[sortBy];
  const right = b[sortBy];
  const leftText = left === null || left === undefined ? '' : String(left);
  const rightText = right === null || right === undefined ? '' : String(right);

  // Blanks sort last in BOTH directions — an empty cell is not "smallest",
  // it is absent, and burying it under a desc sort would hide it entirely.
  if (leftText === '' && rightText !== '') return 1;
  if (rightText === '' && leftText !== '') return -1;

  const compared = leftText.localeCompare(rightText, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
  if (compared !== 0) return compared * direction;
  return String(a.id ?? '').localeCompare(String(b.id ?? ''));
}
