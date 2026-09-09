/**
 * Failure classification + retry suppression for the business_discovery poller
 * (app/api/cron/ig-business-discovery-poll/route.ts).
 *
 * WHY this exists, from production (checked 2026-09-09):
 *   social_instagram_logs has 6,653 business_discovery_fetch error rows since
 *   2026-06-12. 6,647 of them (99.910%) carry the single message "Invalid user
 *   id" — Meta's code 110, meaning the handle no longer resolves to a public
 *   Business/Creator account. Only 9 distinct handles ever failed, and four of
 *   them account for 6,647 rows: @jkkn_otat 2,101 · @jkkn_informationtechnology
 *   1,988 · @jkkn_obgyn 1,988 · @jkkn_bba 570.
 *
 *   The route returned Meta's message as an opaque string and nothing read it,
 *   so a permanently-dead handle was retried on every hourly tick forever.
 *   @jkkn_otat has failed 2,101 consecutive times since 12 June and has NEVER
 *   succeeded once (0 non-error rows exist for this event_type at all). Three
 *   of the four only stopped because a human deleted or re-linked the registry
 *   row — the code never recovered on its own and never gave up either.
 *
 * These functions are pure so they can be tested. Next's App Router rejects
 * unexpected exports from a route.ts, which is why they live here and not in
 * the route file.
 */

/** Permanent failures tolerated before a handle drops to one attempt per UTC day. */
export const SUPPRESS_AFTER_PERMANENT_FAILURES = 3;

/**
 * How far back the suppression counter looks, in days.
 *
 * MUST be greater than 3 days, and here is the trap it avoids: once a handle is
 * suppressed it stops calling Meta, so it stops writing error rows — the very
 * rows the counter reads. With a 24h window the count would decay to 0 while
 * suppressed and the handle would un-suppress itself, giving a sawtooth of
 * ~3 errors per day instead of the intended 1. A 7-day window holds one row per
 * suppressed day (the forced daily attempt writes it), so the count sits at
 * 3..7 forever while the handle stays broken, and drains only once it recovers.
 */
export const SUPPRESSION_WINDOW_DAYS = 7;

export type BdErrorKind = 'permanent' | 'oversized' | 'transient';

/**
 * Classify Meta's error text.
 *
 *   'permanent' — the handle does not resolve (renamed, gone private, converted
 *                 away from Business/Creator, or deleted). Retrying in an hour
 *                 cannot help; only a human changing the registry or the
 *                 department restoring the account can. 99.910% of real traffic.
 *   'oversized' — Meta refused on response size. Seen exactly ONCE in 89 days
 *                 (@jkkn_oralandmaxillofacialsurge, 2026-08-10) and that account
 *                 polls fine today. Worth one smaller retry, not a smaller
 *                 request for everybody.
 *   'transient' — anything else (network blips, Meta 500s). 3 rows total.
 */
export function classifyBdError(message: string | null | undefined): BdErrorKind {
  const m = message ?? '';
  if (/reduce the amount of data/i.test(m)) return 'oversized';
  if (
    /invalid user id|does not exist|cannot be found|not a business|unsupported get request/i.test(
      m
    )
  ) {
    return 'permanent';
  }
  return 'transient';
}

/** The shape this module needs out of a social_instagram_logs row. */
export interface BdErrorLogRow {
  payload: { username?: string } | null;
  error_message: string | null;
  occurred_at: string;
}

export interface SuppressedHandle {
  username: string;
  /** Permanent failures counted inside SUPPRESSION_WINDOW_DAYS. */
  permanent_failures: number;
  kind: 'permanent';
}

/**
 * Which handles this tick must skip.
 *
 * A handle is suppressed when BOTH hold:
 *   1. it has already failed permanently at least once TODAY (UTC), and
 *   2. it has >= SUPPRESS_AFTER_PERMANENT_FAILURES permanent failures inside
 *      the window.
 *
 * Condition 1 is what makes the state durable rather than self-erasing: the
 * first tick of each UTC day always finds no failure "today", so it always
 * attempts, and that attempt writes the row that suppresses the remaining 23
 * ticks. Steady state is exactly one attempt and one error row per day.
 *
 * Recovery needs no operator: the daily attempt succeeds the moment Meta can
 * resolve the handle again, writes no error row, and the next tick finds
 * nothing for today and resumes hourly polling within the hour.
 *
 * Only 'permanent' failures count. A transient blip must never cost a healthy
 * department 23 hours of metrics, and an 'oversized' failure is handled by the
 * caller's smaller retry instead.
 *
 * `nowMs` is injected so the day boundary is testable.
 */
export function selectSuppressedHandles(
  rows: BdErrorLogRow[],
  nowMs: number
): Map<string, SuppressedHandle> {
  const dayStart = new Date(nowMs);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayStartMs = dayStart.getTime();
  const windowStartMs = nowMs - SUPPRESSION_WINDOW_DAYS * 86_400_000;

  const counts = new Map<string, { n: number; failedToday: boolean }>();
  for (const row of rows) {
    const handle = (row.payload?.username ?? '').trim().toLowerCase();
    if (!handle) continue;
    if (classifyBdError(row.error_message) !== 'permanent') continue;
    const at = Date.parse(row.occurred_at);
    if (Number.isNaN(at) || at < windowStartMs) continue;
    const seen = counts.get(handle) ?? { n: 0, failedToday: false };
    seen.n++;
    if (at >= dayStartMs) seen.failedToday = true;
    counts.set(handle, seen);
  }

  const suppressed = new Map<string, SuppressedHandle>();
  for (const [handle, seen] of counts) {
    if (seen.failedToday && seen.n >= SUPPRESS_AFTER_PERMANENT_FAILURES) {
      suppressed.set(handle, {
        username: handle,
        permanent_failures: seen.n,
        kind: 'permanent',
      });
    }
  }
  return suppressed;
}
