// lib/adoption/reminders.ts
//
// Adoption loop ruling 10 (Director 2026-09-24): one reminder a month to
// intended people who have never done a feature's core action. The daily run
// (fn_adoption_daily_tick) sends them; /admin/adoption shows, per feature, how
// many went out and when the last one did. fn_adoption_reminder_summary returns
// one row per feature that has ever had a reminder — a feature with none has
// no row, which must read as "none yet", never as an error or a zero-width gap.

import { toNumber, type Numeric } from './summarise';

/** One row of fn_adoption_reminder_summary (counts only, super admins only). */
export interface ReminderSummaryRow {
  feature_key: string;
  sent_count: Numeric;
  last_sent_at: string | null;
}

export interface ReminderTotals {
  sent: number;
  lastSentAt: string | null;
}

const NONE: ReminderTotals = { sent: 0, lastSentAt: null };

/** Rows → a lookup by feature key. Rows without a key are dropped, counts
 *  that arrive as strings (bigint over JSON) are read as numbers, and a
 *  repeated key is added up rather than silently overwritten. */
export function reminderTotalsByFeature(
  rows: ReminderSummaryRow[] | null | undefined
): Map<string, ReminderTotals> {
  const totals = new Map<string, ReminderTotals>();
  for (const row of rows ?? []) {
    if (!row?.feature_key) continue;
    const previous = totals.get(row.feature_key) ?? NONE;
    const last =
      [previous.lastSentAt, row.last_sent_at]
        .filter((value): value is string => typeof value === 'string' && value !== '')
        .sort()
        .pop() ?? null;
    totals.set(row.feature_key, {
      sent: previous.sent + toNumber(row.sent_count),
      lastSentAt: last,
    });
  }
  return totals;
}

/** The totals for one feature; a feature never reminded reads as zero. */
export function reminderTotalsFor(
  totals: Map<string, ReminderTotals>,
  featureKey: string
): ReminderTotals {
  return totals.get(featureKey) ?? NONE;
}

/** "last sent 2026-09-25" / "none yet" — the line under the count. Dates are
 *  shown as the Indian calendar day, the day the Director would say it went. */
export function lastSentLabel(totals: ReminderTotals): string {
  if (totals.sent <= 0 || !totals.lastSentAt) return 'none yet';
  const at = new Date(totals.lastSentAt);
  if (!Number.isFinite(at.getTime())) return 'none yet';
  const ist = new Date(at.getTime() + 5.5 * 60 * 60 * 1000);
  return `last sent ${ist.toISOString().slice(0, 10)}`;
}
