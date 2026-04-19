/**
 * Doctrines v1 — Habit Anchor Schedule (single source of truth)
 * =====================================================================
 * All Doctrines v1 habit cron schedules live HERE. Never hardcode a
 * schedule in an API route or vercel.json comment — import from this
 * file and reference the constant.
 *
 * Cron strings follow the vercel.json convention:
 *   M  H  DoM  Mon  DoW
 *
 * Timezone note:
 *   Vercel cron runs in UTC. All *_IST values below are documentation
 *   for humans; the cron string is the UTC equivalent.
 *   India Standard Time is UTC+5:30.
 *
 * Spec reference:
 *   JKKNKB/MyJKKN/Routines-Stickiness-Ivy-Doctrine.md
 *     §8 Cluster Rank tiered-privacy cascade
 *     §9 Habit Anchors (morning brief / Friday reflection / Sunday wrap)
 */

export type AnchorDefinition = {
  /** Stable key used in idempotency_key prefixes and log lines. */
  key: string;
  /** Human-readable label for admin UI, metrics, and changelogs. */
  label: string;
  /** Cron string in UTC, vercel.json format (minute hour dom mon dow). */
  cron: string;
  /** IST time documented for code-review clarity. */
  description: string;
  /** API route that Vercel will invoke (without the ?secret= suffix). */
  routePath: string;
};

/**
 * Morning Brief — delivered daily at ~07:30 IST (02:00 UTC).
 *
 * NOTE: The delivery pipeline for the Morning Brief is not wired up in
 * Doctrines v1. This constant reserves the slot so that when the brief
 * route lands, there is a single place to discover its schedule.
 */
export const MORNING_BRIEF_ANCHOR: AnchorDefinition = {
  key: 'morning-brief',
  label: 'Morning Brief',
  cron: '0 2 * * *',
  description: '07:30 IST every day (02:00 UTC)',
  routePath: '/api/cron/morning-brief'
};

/**
 * Sunday 9 PM Wrap — delivered weekly at 21:00 IST on Sunday.
 * 21:00 IST = 15:30 UTC. Route also refreshes cluster leaderboard MVs.
 */
export const SUNDAY_WRAP_ANCHOR: AnchorDefinition = {
  key: 'sunday-wrap',
  label: 'Sunday 9 PM Wrap',
  cron: '30 15 * * 0',
  description: '21:00 IST every Sunday (15:30 UTC)',
  routePath: '/api/cron/sunday-wrap'
};

/**
 * Friday 4 PM Reflection — delivered weekly at 16:00 IST on Friday.
 * 16:00 IST = 10:30 UTC. In-app notification only, no web push.
 */
export const FRIDAY_REFLECTION_ANCHOR: AnchorDefinition = {
  key: 'friday-reflection',
  label: 'Friday 4 PM Reflection',
  cron: '30 10 * * 5',
  description: '16:00 IST every Friday (10:30 UTC)',
  routePath: '/api/cron/friday-reflection'
};

/** All Doctrines v1 habit anchors in a single iterable. */
export const DOCTRINES_ANCHORS: ReadonlyArray<AnchorDefinition> = [
  MORNING_BRIEF_ANCHOR,
  SUNDAY_WRAP_ANCHOR,
  FRIDAY_REFLECTION_ANCHOR
] as const;

/**
 * Helper to build the idempotency key used by Doctrines cron routes.
 * Pattern: `{anchor_key}:{iso_week}:{user_id}`.
 * Matches the convention already used by sunday-wrap and friday-reflection
 * routes.
 */
export function buildIdempotencyKey(
  anchor: AnchorDefinition,
  isoWeek: string,
  userId: string
): string {
  return `doctrines:${anchor.key}:${isoWeek}:${userId}`;
}
