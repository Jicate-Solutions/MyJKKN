/**
 * Campus Walk — how a report reads to the person who filed it.
 *
 * Pure functions, no database, shared by the "My reports" page
 * (app/(routes)/instasolver/my-reports) and the "Not fixed" route
 * (app/api/campus-walk/not-fixed/route.ts) so the button on screen and the
 * rule that enforces it can never disagree about the 7-day window.
 */

/** How long after closure the reporter may still say "Not fixed" (Director, 2026-09-30). */
export const NOT_FIXED_WINDOW_DAYS = 7;

const DAY_MS = 86_400_000;

export type ReportStatus = 'open' | 'being_checked' | 'fixed' | 'reopened' | 'cancelled' | 'closed';

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  open: 'Open',
  being_checked: 'Fix sent — being checked',
  fixed: 'Fixed',
  reopened: 'Reopened',
  cancelled: 'Cancelled',
  closed: 'Closed',
};

/** True while a closed job is still inside the reporter's "Not fixed" window. */
export function withinNotFixedWindow(completedAt: string | null | undefined, nowMs: number = Date.now()): boolean {
  if (!completedAt) return false;
  const t = Date.parse(completedAt);
  if (!Number.isFinite(t)) return false;
  return nowMs - t <= NOT_FIXED_WINDOW_DAYS * DAY_MS;
}

export function reportStatusOf(row: {
  status_key: string;
  metadata: Record<string, any> | null;
}): ReportStatus {
  if (row.status_key === 'done') return 'fixed';
  if (row.status_key === 'cancelled') return 'cancelled';
  if (row.status_key === 'archived') return 'closed';
  // Rows that were already waiting in the old approval queue on 2026-09-30.
  if (row.status_key === 'review') return 'being_checked';
  const approval = (row.metadata ?? {}).fix?.approval;
  if (approval?.reopened_by_reporter === true || approval?.reopened_by_spot_check === true) return 'reopened';
  return 'open';
}

/**
 * Everyone who JOINED this report instead of filing a second one (ruling 2,
 * 2026-09-30). metadata.additional_reports is the same array the QR-sticker
 * door (#4146) writes, so both doors feed one list. De-duplicated, in order.
 */
export function joinedReporterIdsOf(metadata: Record<string, any> | null | undefined): string[] {
  const list = Array.isArray((metadata ?? {}).additional_reports) ? (metadata as any).additional_reports : [];
  const out: string[] = [];
  for (const entry of list) {
    const id = entry?.reporter_id;
    if (typeof id === 'string' && id && !out.includes(id)) out.push(id);
  }
  return out;
}

/** The "Not fixed" button shows only on a job fixed within the window. */
export function canSayNotFixed(
  row: { status_key: string; completed_at: string | null },
  nowMs: number = Date.now()
): boolean {
  return row.status_key === 'done' && withinNotFixedWindow(row.completed_at, nowMs);
}
