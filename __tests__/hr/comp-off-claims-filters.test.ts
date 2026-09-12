/**
 * Filters and bulk rules for the Comp Off Claims approvals table (2026-09-11).
 * Every rule the toolbar and the bulk buttons apply lives in one pure module;
 * the bulk splits mirror the database walls so a bulk approval never sends a
 * claim the database will refuse.
 */

import { describe, expect, it } from 'vitest';

import {
  compOffClaimFiltersActive,
  daysUntil,
  describeSkipped,
  emptyCompOffClaimFilters,
  matchesCompOffClaimFilters,
  splitBulkApproval,
  splitBulkReject,
  toTableRow,
  type CompOffClaimFilterState,
} from '@/app/(routes)/hr/leave/_components/comp-off-claims-filters';
import { allTimePeriod } from '@/app/(routes)/hr/leave/_components/period-filter';
import type { CompOffClaimBiometric, CompOffClaimQueueRow } from '@/types/hr-comp-off';

const TODAY = '2026-09-11';

const claim = (p: Partial<CompOffClaimQueueRow> = {}): CompOffClaimQueueRow => ({
  id: 'c1', employee_id: 'emp-1', employee_name: 'Priya Raman', employee_code: 'CET042',
  institution_id: 'inst-cet', institution_name: 'Engineering',
  worked_date: '2026-09-06', expires_on: '2026-10-06', credit_days: 1, source: 'claim',
  notes: 'Exam duty', work_location: 'inside_campus', work_place: null, documents: [],
  created_at: '2026-09-07T10:00:00Z', status: 'pending', decided_at: null, rejection_reason: null,
  ...p,
});

const bio = (status: CompOffClaimBiometric['status'], id = 'c1'): CompOffClaimBiometric => ({
  claim_id: id, status, in_at: null, out_at: null, source: null,
});

const filters = (p: Partial<CompOffClaimFilterState> = {}): CompOffClaimFilterState => ({
  ...emptyCompOffClaimFilters(allTimePeriod()),
  ...p,
});

const matches = (row: CompOffClaimQueueRow, f: Partial<CompOffClaimFilterState>, check?: CompOffClaimBiometric, search = '') =>
  matchesCompOffClaimFilters(toTableRow(row, check), filters(f), search, TODAY);

describe('defaults', () => {
  it('opens on Pending with nothing else narrowed', () => {
    const f = filters();
    expect(f.status).toBe('pending');
    expect(compOffClaimFiltersActive(f)).toBe(false);
    expect(compOffClaimFiltersActive(filters({ location: 'outside_campus' }))).toBe(true);
  });
});

describe('matchesCompOffClaimFilters', () => {
  it('status: pending by default; approved includes used credits; any shows all', () => {
    expect(matches(claim(), {})).toBe(true);
    expect(matches(claim({ status: 'rejected' }), {})).toBe(false);
    expect(matches(claim({ status: 'consumed' }), { status: 'approved' })).toBe(true);
    expect(matches(claim({ status: 'withdrawn' }), { status: 'any' })).toBe(true);
  });

  it('institution', () => {
    expect(matches(claim(), { institutionId: 'inst-cet' })).toBe(true);
    expect(matches(claim(), { institutionId: 'inst-dental' })).toBe(false);
  });

  it('work location, including claims filed before the field existed', () => {
    expect(matches(claim(), { location: 'inside_campus' })).toBe(true);
    expect(matches(claim(), { location: 'outside_campus' })).toBe(false);
    expect(matches(claim({ work_location: null }), { location: 'not_recorded' })).toBe(true);
    expect(matches(claim(), { location: 'not_recorded' })).toBe(false);
  });

  it('biometric result; an unloaded check matches only "any"', () => {
    expect(matches(claim(), { biometric: 'no_punch' }, bio('no_punch'))).toBe(true);
    expect(matches(claim(), { biometric: 'punched' }, bio('no_punch'))).toBe(false);
    expect(matches(claim(), { biometric: 'punched' })).toBe(false);
    expect(matches(claim(), { biometric: 'any' })).toBe(true);
  });

  it('expiry: in date / expiring within 7 days / expired', () => {
    const soon = claim({ expires_on: '2026-09-15' });   // 4 days left
    const later = claim({ expires_on: '2026-10-06' });  // 25 days left
    const gone = claim({ expires_on: '2026-09-10' });   // yesterday
    expect(matches(soon, { expiry: 'expiring' })).toBe(true);
    expect(matches(later, { expiry: 'expiring' })).toBe(false);
    expect(matches(gone, { expiry: 'expired' })).toBe(true);
    expect(matches(gone, { expiry: 'in_date' })).toBe(false);
    expect(matches(claim({ expires_on: TODAY }), { expiry: 'in_date' })).toBe(true);
  });

  it('period brackets the WORKED date', () => {
    const period = { preset: 'custom', from: '2026-09-01', to: '2026-09-05' } as CompOffClaimFilterState['period'];
    expect(matches(claim({ worked_date: '2026-09-04' }), { period })).toBe(true);
    expect(matches(claim({ worked_date: '2026-09-06' }), { period })).toBe(false);
  });

  it('search covers name, staff ID, place and notes', () => {
    const outside = claim({ work_location: 'outside_campus', work_place: 'Chennai – NAAC visit' });
    expect(matches(outside, {}, undefined, 'chennai')).toBe(true);
    expect(matches(outside, {}, undefined, 'cet042')).toBe(true);
    expect(matches(outside, {}, undefined, 'exam')).toBe(true);
    expect(matches(outside, {}, undefined, 'madurai')).toBe(false);
  });
});

describe('splitBulkApproval / splitBulkReject', () => {
  const ctx = { today: TODAY, ownStaffId: 'me' };
  const rows = [
    toTableRow(claim({ id: 'ok' }), bio('punched', 'ok')),
    toTableRow(claim({ id: 'decided', status: 'approved' }), undefined),
    toTableRow(claim({ id: 'own', employee_id: 'me' }), undefined),
    toTableRow(claim({ id: 'expired', expires_on: '2026-09-10' }), undefined),
    toTableRow(claim({ id: 'nopunch' }), bio('no_punch', 'nopunch')),
    toTableRow(claim({ id: 'notup' }), bio('not_uploaded', 'notup')),
    toTableRow(claim({ id: 'outside', work_location: 'outside_campus', work_place: 'X' }), bio('not_required', 'outside')),
  ];

  it('approves only what the database will accept, and counts the rest', () => {
    const s = splitBulkApproval(rows, ctx);
    expect(s.eligible.map((r) => r.id)).toEqual(['ok', 'outside']);
    expect(s.skipped).toEqual({ decided: 1, own: 1, expired: 1, biometric: 2 });
    expect(describeSkipped(s.skipped)).toBe(
      '1 already decided, 1 your own, 1 expired, 2 without a biometric punch'
    );
  });

  it('rejects any pending claim that is not your own — expired and no-punch included', () => {
    const s = splitBulkReject(rows, ctx);
    expect(s.eligible.map((r) => r.id)).toEqual(['ok', 'expired', 'nopunch', 'notup', 'outside']);
    expect(s.skipped).toMatchObject({ decided: 1, own: 1 });
  });

  it('describes nothing when nothing was skipped', () => {
    expect(describeSkipped({ decided: 0, own: 0, expired: 0, biometric: 0 })).toBe('');
  });
});

describe('daysUntil', () => {
  it('counts whole days, negative once past', () => {
    expect(daysUntil('2026-09-15', TODAY)).toBe(4);
    expect(daysUntil(TODAY, TODAY)).toBe(0);
    expect(daysUntil('2026-09-10', TODAY)).toBe(-1);
  });
});
