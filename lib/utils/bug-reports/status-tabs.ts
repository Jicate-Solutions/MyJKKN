// ============================================
// BUG REPORT STATUS TABS + RESOLVED DATE RANGE
// ============================================
// Shared by /admin/bug-reports (tabs, scorecards, resolved report) and the
// list + stats API routes, so the page and the server agree on which statuses
// a tab means and on how a picked date becomes a resolved_at bound.
// ============================================

import type { BugReportStatus } from '@/types/bugs';

export const ALL_BUG_STATUSES: BugReportStatus[] = [
  'new',
  'seen',
  'in_progress',
  'resolved',
  'wont_fix',
  'duplicate'
];

export type BugStatusTab = 'new' | 'in_progress' | 'resolved' | 'all';

export interface BugStatusTabDefinition {
  value: BugStatusTab;
  label: string;
  /** Statuses shown in this tab. `null` means every status (no filter). */
  statuses: BugReportStatus[] | null;
}

export const BUG_STATUS_TABS: BugStatusTabDefinition[] = [
  { value: 'new', label: 'New', statuses: ['new'] },
  {
    value: 'in_progress',
    label: 'In-Progress',
    statuses: ['seen', 'in_progress', 'wont_fix', 'duplicate']
  },
  { value: 'resolved', label: 'Resolved', statuses: ['resolved'] },
  { value: 'all', label: 'All', statuses: null }
];

export const DEFAULT_BUG_STATUS_TAB: BugStatusTab = 'new';

export function getBugStatusTab(tab: BugStatusTab): BugStatusTabDefinition {
  return BUG_STATUS_TABS.find((t) => t.value === tab) ?? BUG_STATUS_TABS[0];
}

export function isBugStatusTab(value: unknown): value is BugStatusTab {
  return BUG_STATUS_TABS.some((t) => t.value === value);
}

/** The first specific tab that contains a status — used for old `?status=` links. */
export function tabForStatus(status: BugReportStatus | undefined): BugStatusTab | undefined {
  if (!status) return undefined;
  return BUG_STATUS_TABS.find((t) => t.statuses?.includes(status))?.value;
}

/**
 * Parse a comma-separated `statuses` query param. Returns `undefined` when the
 * param is absent and `null` when it is present but names no valid status —
 * the caller must reject that rather than silently listing every status.
 */
export function parseStatusList(raw: string | null): BugReportStatus[] | null | undefined {
  if (raw === null || raw.trim() === '') return undefined;
  const statuses = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is BugReportStatus => (ALL_BUG_STATUSES as string[]).includes(s));
  return statuses.length > 0 ? Array.from(new Set(statuses)) : null;
}

/** A real calendar date in YYYY-MM-DD form. */
export function isIsoDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
  );
}

// JKKN runs on India time. A bug resolved at 00:30 IST on the 5th is stored as
// the 4th in UTC, so day boundaries must be IST, not UTC.
const IST_OFFSET = '+05:30';

/** Inclusive resolved_at bounds for a YYYY-MM-DD from/to pair (either may be absent). */
export function resolvedAtBounds(
  from?: string | null,
  to?: string | null
): { gte?: string; lte?: string } {
  return {
    gte: isIsoDate(from) ? `${from}T00:00:00.000${IST_OFFSET}` : undefined,
    lte: isIsoDate(to) ? `${to}T23:59:59.999${IST_OFFSET}` : undefined
  };
}

// A "Is this still happening?" prompt answered "No, it works now" resolves the
// bug with resolved_by = its reporter and stamps metadata.resolved_by with this
// marker (migration 20261227090000). Those are not fixes by a person, so the
// resolver breakdown pools them under one "Others" entry instead of a name.
export const REPORTER_CONFIRMED_MARKER = 'reporter_still_open_prompt';

/** The `resolved_by` filter value for that pool — never a profile id. */
export const OTHERS_RESOLVER_KEY = 'others';
export const OTHERS_RESOLVER_LABEL = 'Others';

/** First and last day of a month, as YYYY-MM-DD. `month` is 1-12. */
export function monthRange(year: number, month: number): { from: string; to: string } {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, '0');
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(lastDay).padStart(2, '0')}` };
}

export type ResolvedDateMode = 'all_time' | 'date' | 'month' | 'range';

export function isResolvedDateMode(value: unknown): value is ResolvedDateMode {
  return value === 'all_time' || value === 'date' || value === 'month' || value === 'range';
}
