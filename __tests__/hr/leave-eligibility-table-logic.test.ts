/**
 * The rules behind the "Granted & decided" DataTable on /hr/leave/eligibility:
 * which rows each filter keeps, how they sort, how they page. Pure functions, so
 * what a person relies on is checked here rather than read off a screen.
 *
 * Run: npx vitest run __tests__/hr/leave-eligibility-table-logic.test.ts
 */
import { describe, expect, it } from 'vitest';

import {
  filterEligibilityRows,
  pageOf,
  sortEligibilityRows,
} from '@/app/(routes)/hr/leave/eligibility/_components/eligibility-logic';
import { DEFAULT_ELIGIBILITY_FILTERS } from '@/app/(routes)/hr/leave/eligibility/_components/eligibility-filters';
import {
  fmtDateOnly,
  normalizeTypeName,
  type EligibilityTableRow,
} from '@/app/(routes)/hr/leave/eligibility/_components/eligibility-status';

const NO_SEARCH = { search: '', fromDate: '', toDate: '' };

function row(over: Partial<EligibilityTableRow> & { id: string }): EligibilityTableRow {
  return {
    employee_id: `e-${over.id}`,
    leave_type_id: 'lt-1',
    hr_organization_id: 'org-dental',
    status: 'approved',
    documents: [{ name: 'proof.pdf' }] as never,
    reason: null,
    approval_chain: [],
    current_step: 0,
    entitled_days: 10,
    valid_from: '2026-10-01',
    valid_until: '2027-03-31',
    decided_by: null,
    decided_at: '2026-10-02T12:00:00.000Z',
    decision_note: null,
    revoked_by: null,
    revoked_at: null,
    revoke_reason: null,
    granted_directly: false,
    created_by: null,
    created_at: '2026-10-01T12:00:00.000Z',
    updated_at: '2026-10-02T12:00:00.000Z',
    staff_name: 'Asha Rao',
    staff_code: 'DCH001',
    leave_type_name: 'PH.D',
    institution_name: 'Dental',
    ...over,
  } as EligibilityTableRow;
}

const ids = (rows: EligibilityTableRow[]) => rows.map((r) => r.id);

describe('status filter', () => {
  const rows = [
    row({ id: 'a', status: 'approved' }),
    row({ id: 'r', status: 'rejected' }),
    row({ id: 'v', status: 'revoked' }),
    row({ id: 'p', status: 'pending' }),
  ];

  it("opens on 'decided': everything except what is still waiting", () => {
    const out = filterEligibilityRows(rows, DEFAULT_ELIGIBILITY_FILTERS, NO_SEARCH);
    expect(ids(out)).toEqual(['a', 'r', 'v']);
  });

  it("'all' adds the pending ones", () => {
    const out = filterEligibilityRows(rows, { ...DEFAULT_ELIGIBILITY_FILTERS, status: 'all' }, NO_SEARCH);
    expect(ids(out)).toEqual(['a', 'r', 'v', 'p']);
  });

  it('a single status keeps only that status', () => {
    const out = filterEligibilityRows(rows, { ...DEFAULT_ELIGIBILITY_FILTERS, status: 'revoked' }, NO_SEARCH);
    expect(ids(out)).toEqual(['v']);
  });
});

describe('institution, leave type and the advanced filters', () => {
  it('filters by institution', () => {
    const rows = [row({ id: '1' }), row({ id: '2', hr_organization_id: 'org-main' })];
    const out = filterEligibilityRows(rows, { ...DEFAULT_ELIGIBILITY_FILTERS, hrOrgId: 'org-main' }, NO_SEARCH);
    expect(ids(out)).toEqual(['2']);
  });

  it('treats "PH.D" and "PH.D " (a typed trailing space) as the same leave type', () => {
    const rows = [row({ id: '1', leave_type_name: 'PH.D' }), row({ id: '2', leave_type_name: 'PH.D ' }), row({ id: '3', leave_type_name: 'Casual Leave' })];
    const out = filterEligibilityRows(rows, { ...DEFAULT_ELIGIBILITY_FILTERS, leaveType: normalizeTypeName('PH.D') }, NO_SEARCH);
    expect(ids(out)).toEqual(['1', '2']);
  });

  it('separates a direct HR grant from a request the team member made', () => {
    const rows = [row({ id: 'hr', granted_directly: true }), row({ id: 'req', granted_directly: false })];
    expect(ids(filterEligibilityRows(rows, { ...DEFAULT_ELIGIBILITY_FILTERS, source: 'hr' }, NO_SEARCH))).toEqual(['hr']);
    expect(ids(filterEligibilityRows(rows, { ...DEFAULT_ELIGIBILITY_FILTERS, source: 'request' }, NO_SEARCH))).toEqual(['req']);
  });

  it('filters on having a document and on having an expiry', () => {
    const rows = [
      row({ id: 'doc-exp' }),
      row({ id: 'nodoc-noexp', documents: [], valid_until: null }),
    ];
    expect(ids(filterEligibilityRows(rows, { ...DEFAULT_ELIGIBILITY_FILTERS, hasDocument: 'no' }, NO_SEARCH))).toEqual(['nodoc-noexp']);
    expect(ids(filterEligibilityRows(rows, { ...DEFAULT_ELIGIBILITY_FILTERS, hasExpiry: 'yes' }, NO_SEARCH))).toEqual(['doc-exp']);
  });
});

describe('search and the request-date range', () => {
  const rows = [
    row({ id: '1', staff_name: 'Asha Rao', staff_code: 'DCH001', institution_name: 'Dental' }),
    row({ id: '2', staff_name: 'Boobalan A', staff_code: 'NOTJMO056', institution_name: 'Main Office', leave_type_name: 'Work From Home' }),
  ];

  it('matches every word against name, code, leave type, institution or status', () => {
    expect(ids(filterEligibilityRows(rows, DEFAULT_ELIGIBILITY_FILTERS, { ...NO_SEARCH, search: 'boobalan main' }))).toEqual(['2']);
    expect(ids(filterEligibilityRows(rows, DEFAULT_ELIGIBILITY_FILTERS, { ...NO_SEARCH, search: 'dch001' }))).toEqual(['1']);
    expect(ids(filterEligibilityRows(rows, DEFAULT_ELIGIBILITY_FILTERS, { ...NO_SEARCH, search: 'asha main' }))).toEqual([]);
  });

  it('applies the date range to the REQUEST date, both ends inclusive', () => {
    const dated = [
      row({ id: 'early', created_at: '2026-09-30T12:00:00.000Z' }),
      row({ id: 'in', created_at: '2026-10-05T12:00:00.000Z' }),
      row({ id: 'late', created_at: '2026-10-20T12:00:00.000Z' }),
    ];
    const out = filterEligibilityRows(dated, DEFAULT_ELIGIBILITY_FILTERS, { search: '', fromDate: '2026-10-01', toDate: '2026-10-05' });
    expect(ids(out)).toEqual(['in']);
  });
});

describe('sorting', () => {
  const rows = [
    row({ id: 'b', staff_name: 'Bala', valid_until: null }),
    row({ id: 'a', staff_name: 'Asha', valid_until: '2027-01-01' }),
    row({ id: 'c', staff_name: 'Chitra', valid_until: '2026-12-01' }),
  ];

  it('sorts by a column in either direction', () => {
    expect(ids(sortEligibilityRows(rows, 'staff_name', 'asc'))).toEqual(['a', 'b', 'c']);
    expect(ids(sortEligibilityRows(rows, 'staff_name', 'desc'))).toEqual(['c', 'b', 'a']);
  });

  it('puts an empty value last whichever way the column runs', () => {
    expect(ids(sortEligibilityRows(rows, 'valid_until', 'asc'))).toEqual(['c', 'a', 'b']);
    expect(ids(sortEligibilityRows(rows, 'valid_until', 'desc'))).toEqual(['a', 'c', 'b']);
  });

  it('ignores a sort key outside the whitelist instead of reading it as a property', () => {
    expect(sortEligibilityRows(rows, 'documents', 'asc')).toBe(rows);
    expect(sortEligibilityRows(rows, '__proto__', 'asc')).toBe(rows);
  });
});

describe('paging', () => {
  const items = Array.from({ length: 25 }, (_, i) => i + 1);

  it('returns the slice and the totals', () => {
    const p = pageOf(items, 2, 10);
    expect(p.data).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(p.pagination).toEqual({ page: 2, limit: 10, total_pages: 3, total_items: 25 });
  });

  it('snaps a page past the end back to the last real page instead of going blank', () => {
    const p = pageOf(items, 9, 10);
    expect(p.pagination.page).toBe(3);
    expect(p.data).toEqual([21, 22, 23, 24, 25]);
  });

  it('copes with an empty list and a zero page size', () => {
    expect(pageOf([], 1, 10).pagination).toEqual({ page: 1, limit: 10, total_pages: 1, total_items: 0 });
    expect(pageOf(items, 1, 0).data).toHaveLength(10);
  });
});

describe('date-only display', () => {
  it('formats a date-only value without going through Date (no off-by-one)', () => {
    expect(fmtDateOnly('2026-12-31')).toBe('31/12/2026');
    expect(fmtDateOnly('2027-01-01')).toBe('01/01/2027');
  });

  it('returns null for nothing', () => {
    expect(fmtDateOnly(null)).toBeNull();
    expect(fmtDateOnly('')).toBeNull();
  });
});
