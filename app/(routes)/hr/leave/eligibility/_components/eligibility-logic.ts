// The pure rules behind the "Granted & decided" table: filter, sort, page.
//
// No React and no Supabase here, so the rules a person relies on — "Decided hides
// pending", "Granted by HR means nobody requested it", "a page past the end snaps
// back to the last one" — are unit-checked instead of read off a screen.

import { format } from 'date-fns';

import { LEAVE_ELIGIBILITY_STATUS_LABELS } from '@/types/hr-leave-types';
import type { EligibilityFilterState } from './eligibility-filters';
import { normalizeTypeName, type EligibilityTableRow } from './eligibility-status';

export interface EligibilityFilterOptions {
  search: string;
  /** yyyy-MM-dd, '' = open. Applied to the REQUEST date, in the viewer's local day. */
  fromDate: string;
  toDate: string;
}

/** The request's calendar day as the viewer lives it (a timestamp near midnight UTC is already "tomorrow" in IST). */
function localDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : format(d, 'yyyy-MM-dd');
}

export function filterEligibilityRows(
  rows: EligibilityTableRow[],
  f: EligibilityFilterState,
  { search, fromDate, toDate }: EligibilityFilterOptions,
): EligibilityTableRow[] {
  const tokens = search.toLowerCase().split(/\s+/).filter(Boolean);

  return rows.filter((r) => {
    // 'decided' is everything except what is still waiting — the page's old view.
    if (f.status === 'decided' ? r.status === 'pending' : f.status !== 'all' && r.status !== f.status) {
      return false;
    }
    if (f.hrOrgId && r.hr_organization_id !== f.hrOrgId) return false;
    if (f.leaveType !== 'all' && normalizeTypeName(r.leave_type_name) !== f.leaveType) return false;
    if (f.source === 'hr' && !r.granted_directly) return false;
    if (f.source === 'request' && r.granted_directly) return false;

    const hasDoc = r.documents.length > 0;
    if (f.hasDocument === 'yes' && !hasDoc) return false;
    if (f.hasDocument === 'no' && hasDoc) return false;

    const hasExpiry = r.valid_until != null;
    if (f.hasExpiry === 'yes' && !hasExpiry) return false;
    if (f.hasExpiry === 'no' && hasExpiry) return false;

    if (fromDate || toDate) {
      const day = localDay(r.created_at);
      if (!day) return false;
      if (fromDate && day < fromDate) return false;
      if (toDate && day > toDate) return false;
    }

    if (tokens.length > 0) {
      const haystack = [
        r.staff_name, r.staff_code, r.leave_type_name, r.institution_name,
        LEAVE_ELIGIBILITY_STATUS_LABELS[r.status], r.status, r.reason,
      ].join(' ').toLowerCase();
      if (!tokens.every((t) => haystack.includes(t))) return false;
    }
    return true;
  });
}

const SORTABLE = [
  'staff_name', 'institution_name', 'leave_type_name', 'status',
  'created_at', 'decided_at', 'entitled_days', 'valid_until',
] as const;
type SortKey = (typeof SORTABLE)[number];

/** Anything outside the whitelist is ignored rather than read as a property name. */
export function sortEligibilityRows(
  rows: EligibilityTableRow[],
  sortBy: string,
  sortOrder: string,
): EligibilityTableRow[] {
  if (!(SORTABLE as readonly string[]).includes(sortBy)) return rows;
  const key = sortBy as SortKey;
  const dir = sortOrder === 'asc' ? 1 : -1;

  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    // Empty values go last whichever way the column is sorted.
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
}

/**
 * One page of a list. A page past the end is clamped to the last real one rather
 * than returning an empty slice — narrowing a filter while on page 3 would
 * otherwise show a blank table with no way back except the pager.
 */
export function pageOf<T>(rows: T[], page: number, limit: number) {
  const size = limit > 0 ? limit : 10;
  const totalPages = Math.max(1, Math.ceil(rows.length / size));
  const safePage = Math.min(Math.max(1, page || 1), totalPages);
  const start = (safePage - 1) * size;
  return {
    data: rows.slice(start, start + size),
    pagination: {
      page: safePage,
      limit: size,
      total_pages: totalPages,
      total_items: rows.length,
    },
  };
}
