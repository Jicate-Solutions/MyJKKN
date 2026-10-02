/**
 * Campus Walk — how long a job gets.
 *
 * Due-date policy (Director ruling, locked 2026-08-19 — supersedes the D6 draft
 * numbers). D6: an unsafe condition is due the SAME DAY it is spotted, never
 * queued behind a dusty sill — a 0-day offset, not "tomorrow". A normal symptom
 * (one action, e.g. "clean this toilet") gets 2 days. A system gap (no SOP, an
 * audit finding — broader work) gets 7 days.
 *
 * Lives in its own module so the two places that set a due date read ONE table:
 *   · lib/services/campus-walk/campus-walk-service.ts `routeAccountable` — a new
 *     report (and a D7 recurrence).
 *   · app/api/campus-walk/not-fixed/route.ts — a job the reporter reopened with
 *     "Not fixed" gets a fresh due date of the same length it first had
 *     (Director, 2026-09-30).
 */

export const DUE_IN_DAYS = {
  unsafe: 0,
  symptom: 2,
  system_gap: 7
} as const;

export type WalkKindForDue = 'symptom' | 'system_gap';

/**
 * YYYY-MM-DD, `DUE_IN_DAYS` days after `nowMs`. An unknown kind reads as a
 * symptom — the shorter clock — because that is what every InstaSolver report
 * is filed as, and a job must never come back with no deadline at all.
 */
export function dueDateFor(
  kind: string | null | undefined,
  isUnsafe: boolean,
  nowMs: number = Date.now()
): string {
  const days = isUnsafe
    ? DUE_IN_DAYS.unsafe
    : kind === 'system_gap'
      ? DUE_IN_DAYS.system_gap
      : DUE_IN_DAYS.symptom;
  return new Date(nowMs + days * 86_400_000).toISOString().slice(0, 10);
}
