/**
 * Filters and bulk-selection rules for the Comp Off Claims approvals table.
 * Created 2026-09-11 with the move to the advanced DataTable.
 *
 * Pure on purpose — no React, no Supabase — so every rule the toolbar and the
 * bulk buttons apply is unit-tested. The rows arrive enriched (labels, the punch
 * check) by toTableRow(), so filtering, sorting, the cells and the Excel export
 * all read the same values.
 */

import type { PeriodRange } from './period-filter';
import {
  biometricBlocksApproval,
  describeBiometric,
  formatWorkLocation,
  type CompOffBiometricStatus,
  type CompOffClaimBiometric,
  type CompOffClaimQueueRow,
} from '@/types/hr-comp-off';

/** A claim within this many days of its expiry counts as "expiring". */
export const EXPIRING_WITHIN_DAYS = 7;

export type CompOffStatusFilter = 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'any';
export type CompOffLocationFilter = 'any' | 'inside_campus' | 'outside_campus' | 'not_recorded';
export type CompOffBiometricFilter = 'any' | 'punched' | 'no_punch' | 'not_uploaded' | 'no_device';
export type CompOffExpiryFilter = 'any' | 'in_date' | 'expiring' | 'expired';

export interface CompOffClaimFilterState {
  /** 'pending' is the work queue; 'approved' includes credits already used. */
  status: CompOffStatusFilter;
  /** 'any' or an institutions.id. */
  institutionId: string;
  location: CompOffLocationFilter;
  biometric: CompOffBiometricFilter;
  expiry: CompOffExpiryFilter;
  /** Brackets the WORKED date — the day being claimed, not the day it was filed. */
  period: PeriodRange;
}

export const emptyCompOffClaimFilters = (period: PeriodRange): CompOffClaimFilterState => ({
  status: 'pending',
  institutionId: 'any',
  location: 'any',
  biometric: 'any',
  expiry: 'any',
  period,
});

export function compOffClaimFiltersActive(f: CompOffClaimFilterState): boolean {
  return (
    f.status !== 'pending' ||
    f.institutionId !== 'any' ||
    f.location !== 'any' ||
    f.biometric !== 'any' ||
    f.expiry !== 'any' ||
    f.period.preset !== 'all'
  );
}

/** Today as YYYY-MM-DD in the viewer's (IST) calendar — the DB rules use IST. */
export function localIsoDate(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Whole days from `today` to `iso` (negative once past). Both are YYYY-MM-DD. */
export function daysUntil(iso: string, today: string): number {
  return Math.round(
    (Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000
  );
}

/** A queue row with everything the table shows precomputed once. */
export interface CompOffClaimTableRow extends CompOffClaimQueueRow {
  location_label: string;
  /** null until the punch check has loaded (or when it could not be read). */
  biometric_status: CompOffBiometricStatus | null;
  /** '' when there is nothing to report (outside campus, not recorded, not loaded). */
  biometric_label: string;
  status_label: string;
}

const STATUS_LABEL: Record<CompOffClaimQueueRow['status'], string> = {
  pending: 'Pending',
  approved: 'Approved',
  consumed: 'Approved · used',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

export function toTableRow(
  row: CompOffClaimQueueRow,
  check: CompOffClaimBiometric | undefined
): CompOffClaimTableRow {
  return {
    ...row,
    location_label: formatWorkLocation(row.work_location, row.source),
    biometric_status: check?.status ?? null,
    biometric_label: check ? describeBiometric(check)?.label ?? '' : '',
    // A revoked claim stores status='rejected'; the label has to say which of
    // the two happened, because only one of them was ever granted.
    status_label: row.revoked_at ? 'Revoked' : STATUS_LABEL[row.status] ?? row.status,
  };
}

function haystack(r: CompOffClaimTableRow): string {
  return [r.employee_name, r.employee_code, r.institution_name, r.notes, r.work_place]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function matchesCompOffClaimFilters(
  r: CompOffClaimTableRow,
  f: CompOffClaimFilterState,
  search: string,
  today: string
): boolean {
  if (f.period.preset !== 'all' && !(r.worked_date >= f.period.from && r.worked_date <= f.period.to)) {
    return false;
  }

  if (f.status === 'approved') {
    if (r.status !== 'approved' && r.status !== 'consumed') return false;
  } else if (f.status !== 'any' && r.status !== f.status) {
    return false;
  }

  if (f.institutionId !== 'any' && r.institution_id !== f.institutionId) return false;

  if (f.location === 'not_recorded') {
    if (r.work_location !== null) return false;
  } else if (f.location !== 'any' && r.work_location !== f.location) {
    return false;
  }

  if (f.biometric !== 'any' && r.biometric_status !== f.biometric) return false;

  if (f.expiry !== 'any') {
    const left = daysUntil(r.expires_on, today);
    if (f.expiry === 'expired' && left >= 0) return false;
    if (f.expiry === 'in_date' && left < 0) return false;
    if (f.expiry === 'expiring' && (left < 0 || left > EXPIRING_WITHIN_DAYS)) return false;
  }

  const q = search.trim().toLowerCase();
  if (q && !haystack(r).includes(q)) return false;
  return true;
}

export interface BulkContext {
  today: string;
  /** The viewer's staff id — RLS refuses self-decisions, so they are skipped up front. */
  ownStaffId: string | null | undefined;
}

export interface BulkSplit {
  eligible: CompOffClaimTableRow[];
  skipped: { decided: number; own: number; expired: number; biometric: number };
}

/**
 * Which selected claims can be approved. Mirrors the database walls in order:
 * already decided, your own (hcoc_update), expired
 * (trg_hcoc_block_expired_approval), no punch / not uploaded
 * (trg_hcoc_require_biometric).
 */
export function splitBulkApproval(rows: CompOffClaimTableRow[], ctx: BulkContext): BulkSplit {
  const out: BulkSplit = { eligible: [], skipped: { decided: 0, own: 0, expired: 0, biometric: 0 } };
  for (const r of rows) {
    if (r.status !== 'pending') out.skipped.decided += 1;
    else if (ctx.ownStaffId && r.employee_id === ctx.ownStaffId) out.skipped.own += 1;
    else if (r.expires_on < ctx.today) out.skipped.expired += 1;
    else if (biometricBlocksApproval(r.biometric_status)) out.skipped.biometric += 1;
    else out.eligible.push(r);
  }
  return out;
}

/** Which selected claims can be rejected: any pending claim that is not your own. */
export function splitBulkReject(rows: CompOffClaimTableRow[], ctx: BulkContext): BulkSplit {
  const out: BulkSplit = { eligible: [], skipped: { decided: 0, own: 0, expired: 0, biometric: 0 } };
  for (const r of rows) {
    if (r.status !== 'pending') out.skipped.decided += 1;
    else if (ctx.ownStaffId && r.employee_id === ctx.ownStaffId) out.skipped.own += 1;
    else out.eligible.push(r);
  }
  return out;
}

/** "2 already decided, 1 your own" — '' when nothing was skipped. */
export function describeSkipped(s: BulkSplit['skipped']): string {
  return [
    s.decided && `${s.decided} already decided`,
    s.own && `${s.own} your own`,
    s.expired && `${s.expired} expired`,
    s.biometric && `${s.biometric} without a biometric punch`,
  ]
    .filter(Boolean)
    .join(', ');
}
