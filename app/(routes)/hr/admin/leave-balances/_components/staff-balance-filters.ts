/**
 * Filter vocabulary for the Staff Balances tab.
 *
 * Pure module, same split as balance-flags.ts next door: the table, the facet
 * counts, the active-filter chips and the XLSX export all need to agree on what
 * "matching" means, and four copies of that predicate drift the first time a
 * filter is added.
 *
 * THE `except` PARAMETER IS THE WHOLE POINT. Facet option counts must be
 * computed against the rows that pass every OTHER active filter, never against
 * the raw array. Counting against the raw array is what made
 * /hr/payroll/organisation advertise "JKKN Main Office (104)" while the table
 * ANDed four filters and rendered a bare "No results." — the count and the
 * table read the same array, so a divergence can only mean a second filter is
 * excluding the rows, and the UI gave no signal which.
 */

import type { HRStaffBalanceRow } from '@/types/hr-leave-staff-balances';
import type { BalanceFlag } from './balance-flags';
import { rowNeedsAttention } from './balance-flags';

/**
 * Bucket for rows whose attribute is null. A real sentinel rather than '' so
 * it survives a Radix Select, which treats '' as "no selection".
 */
export const UNASSIGNED = '__unassigned__';
/** "No filter on this facet." Radix Select cannot hold a null value either. */
export const ANY = '__any__';

export type TeachingFilter = 'all' | 'teaching' | 'non_teaching';
/** 'any' = the old boolean toggle; the four flags narrow it to one problem. */
export type AttentionFilter = 'all' | 'any' | BalanceFlag;

export interface StaffBalanceFilters {
  search: string;
  departmentId: string;
  categoryId: string;
  teaching: TeachingFilter;
  designation: string;
  roleKey: string;
  gender: string;
  attention: AttentionFilter;
}

export const EMPTY_FILTERS: StaffBalanceFilters = {
  search: '',
  departmentId: ANY,
  categoryId: ANY,
  teaching: 'all',
  designation: ANY,
  roleKey: ANY,
  gender: ANY,
  attention: 'all',
};

export type StaffBalanceFilterKey = keyof StaffBalanceFilters;

/** Human labels, used by the chips and by the blocking-filter empty state. */
export const FILTER_LABELS: Record<StaffBalanceFilterKey, string> = {
  search: 'Search',
  departmentId: 'Department',
  categoryId: 'Category',
  teaching: 'Teaching',
  designation: 'Designation',
  roleKey: 'Role',
  gender: 'Gender',
  attention: 'Attention',
};

/** True when the key is narrowing anything. */
export function isFilterActive(f: StaffBalanceFilters, key: StaffBalanceFilterKey): boolean {
  if (key === 'search') return f.search.trim() !== '';
  return f[key] !== EMPTY_FILTERS[key];
}

export function activeFilterKeys(f: StaffBalanceFilters): StaffBalanceFilterKey[] {
  return (Object.keys(EMPTY_FILTERS) as StaffBalanceFilterKey[]).filter((k) =>
    isFilterActive(f, k)
  );
}

/* ─────────────────────────── the predicate ─────────────────────────── */

/** Nullable attribute → its facet value, collapsing null into one bucket. */
const facetValue = (v: string | null | undefined) =>
  v == null || v === '' ? UNASSIGNED : v;

/**
 * Everything the search box looks at. Deliberately wider than what the table
 * renders: role, category and email are not columns, but an admin who pastes an
 * institution email or types "hod" expects a hit. Client-side search can afford
 * to be generous — unlike the /staff/list box, which builds a PostgREST `.or()`
 * and therefore needs per-field toggles to stay cheap.
 */
function haystack(row: HRStaffBalanceRow): string {
  return [
    row.name,
    row.staff_code,
    row.designation,
    row.department,
    row.email,
    row.role_name,
    row.category_name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/**
 * Tokens are ANDed, not matched as one string, so "john prof" finds
 * "John Doe — Professor". A single substring match would not.
 */
function matchesSearch(row: HRStaffBalanceRow, search: string): boolean {
  const tokens = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const hay = haystack(row);
  return tokens.every((t) => hay.includes(t));
}

function matchesAttention(row: HRStaffBalanceRow, attention: AttentionFilter): boolean {
  switch (attention) {
    case 'all':
      return true;
    case 'any':
      return rowNeedsAttention(row.flags);
    case 'no_row':
      return row.flags.missing_rows > 0;
    case 'negative':
      return row.flags.negative > 0;
    case 'overdrawn':
      return row.flags.overdrawn > 0;
    case 'off_policy':
      return row.flags.off_policy > 0;
    case 'sto_exhausted':
      return (row.flags.sto_exhausted ?? 0) > 0;
  }
}

/**
 * The single source of truth for "does this row survive the filters".
 *
 * @param except skip this one filter — pass the facet's own key when counting
 *               its options, so an option never counts against itself.
 */
export function matchesStaffBalanceFilters(
  row: HRStaffBalanceRow,
  f: StaffBalanceFilters,
  except?: StaffBalanceFilterKey
): boolean {
  const on = (k: StaffBalanceFilterKey) => k !== except;

  if (on('search') && !matchesSearch(row, f.search)) return false;

  if (on('departmentId') && f.departmentId !== ANY) {
    if (facetValue(row.department_id) !== f.departmentId) return false;
  }
  if (on('categoryId') && f.categoryId !== ANY) {
    if (facetValue(row.category_id) !== f.categoryId) return false;
  }
  if (on('designation') && f.designation !== ANY) {
    if (facetValue(row.designation) !== f.designation) return false;
  }
  if (on('roleKey') && f.roleKey !== ANY) {
    if (facetValue(row.role_key) !== f.roleKey) return false;
  }
  if (on('gender') && f.gender !== ANY) {
    // staff.gender is stored lowercase here, unlike the learner tables where
    // the canon is Male/Female/Other. Compare on the normalised value.
    if (facetValue(row.gender?.toLowerCase()) !== f.gender) return false;
  }
  if (on('teaching') && f.teaching !== 'all') {
    // NULL is neither teaching nor non-teaching; it must not silently land in
    // the "non-teaching" bucket, which is what `!row.is_teaching` would do.
    if (row.is_teaching === null || row.is_teaching === undefined) return false;
    if (row.is_teaching !== (f.teaching === 'teaching')) return false;
  }
  if (on('attention') && !matchesAttention(row, f.attention)) return false;

  return true;
}

/* ──────────────────────────── facet counts ─────────────────────────── */

export interface FacetOption {
  value: string;
  label: string;
  count: number;
}

/**
 * Options for one facet, counted against every OTHER active filter.
 *
 * The option UNIVERSE comes from all rows but the COUNT comes from the pool:
 * that keeps a selected-but-now-empty option labelled in the Radix trigger and
 * lets it read `(0)`, which is the explanation for an empty table rather than a
 * missing entry the user has to guess at.
 */
export function buildFacet(
  rows: HRStaffBalanceRow[],
  f: StaffBalanceFilters,
  key: StaffBalanceFilterKey,
  project: (row: HRStaffBalanceRow) => { value: string; label: string }
): FacetOption[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!matchesStaffBalanceFilters(row, f, key)) continue;
    const { value } = project(row);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  const labels = new Map<string, string>();
  for (const row of rows) {
    const { value, label } = project(row);
    if (!labels.has(value)) labels.set(value, label);
  }

  return [...labels.entries()]
    .map(([value, label]) => ({ value, label, count: counts.get(value) ?? 0 }))
    .sort((a, b) => {
      // Unassigned last: it is a bucket, not a peer of the named options.
      if (a.value === UNASSIGNED) return 1;
      if (b.value === UNASSIGNED) return -1;
      return a.label.localeCompare(b.label);
    });
}

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

/** The five list-shaped facets, projected the way each one is keyed. */
export const FACET_PROJECTIONS = {
  departmentId: (r: HRStaffBalanceRow) => ({
    value: facetValue(r.department_id),
    label: r.department ?? 'Unassigned',
  }),
  categoryId: (r: HRStaffBalanceRow) => ({
    value: facetValue(r.category_id),
    // Same suffix the /staff/list category filter uses — an operator picking
    // "Facilitator" needs to know it counts as teaching.
    label: r.category_name
      ? `${r.category_name}${
          r.is_teaching === null ? '' : r.is_teaching ? ' (Teaching)' : ' (Non-Teaching)'
        }`
      : 'Uncategorised',
  }),
  designation: (r: HRStaffBalanceRow) => ({
    value: facetValue(r.designation),
    label: r.designation ?? 'No designation',
  }),
  roleKey: (r: HRStaffBalanceRow) => ({
    value: facetValue(r.role_key),
    label: r.role_name ?? r.role_key ?? 'No role',
  }),
  gender: (r: HRStaffBalanceRow) => ({
    value: facetValue(r.gender?.toLowerCase()),
    label: r.gender ? titleCase(r.gender) : 'Not recorded',
  }),
} satisfies Partial<
  Record<StaffBalanceFilterKey, (row: HRStaffBalanceRow) => { value: string; label: string }>
>;

/** Contextual count for one fixed-option choice (teaching / attention). */
export function countWith(
  rows: HRStaffBalanceRow[],
  f: StaffBalanceFilters,
  key: StaffBalanceFilterKey,
  value: StaffBalanceFilters[StaffBalanceFilterKey]
): number {
  const probe = { ...f, [key]: value } as StaffBalanceFilters;
  return rows.reduce(
    (n, row) => (matchesStaffBalanceFilters(row, probe) ? n + 1 : n),
    0
  );
}

/* ───────────────────── empty-state diagnosis ───────────────────── */

/**
 * Which active filters would, on their own, bring rows back.
 *
 * With eight filters ANDed, "no results" is ambiguous — the useful answer is
 * *which* filter to clear. `lastChanged` is pushed to the END of the search
 * order so the suggestion is the OTHER filter: the one the user just picked is
 * what they meant, the older one is usually the leftover.
 */
export function findBlockingFilters(
  rows: HRStaffBalanceRow[],
  f: StaffBalanceFilters,
  lastChanged?: StaffBalanceFilterKey | null
): StaffBalanceFilterKey[] {
  const active = activeFilterKeys(f);
  const ordered = [
    ...active.filter((k) => k !== lastChanged),
    ...active.filter((k) => k === lastChanged),
  ];

  return ordered.filter((key) => {
    const relaxed = { ...f, [key]: EMPTY_FILTERS[key] } as StaffBalanceFilters;
    return rows.some((row) => matchesStaffBalanceFilters(row, relaxed));
  });
}
