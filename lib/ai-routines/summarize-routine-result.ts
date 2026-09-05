// =====================================================================
// Routine result summariser — turns a routine's own JSON result into the
// one line that lands in ai_routine_schedules.last_status.
// =====================================================================
// Created: 2026-08-08, extracted from app/api/cron/ai-routine-dispatcher.
//
// WHY THIS EXISTS AS ITS OWN MODULE
//   It used to be a closure inside the dispatcher's GET handler, where it
//   could not be imported by a test — a Next.js route file may only export
//   its handlers and route config. The judgement about what a run "said"
//   now lives here, where it can be driven with a fixture body.
//
// WHY THE RULE IS INVERTED
//   The original summariser read a FIXED allowlist of counter names and
//   discarded every key that was not on it. The curriculum lesson-spine
//   generator reports courses / enqueued / skipped_no_taxonomy /
//   skipped_dried_out / dried_out / capped — none of which were on that
//   list. So it skipped the same set of courses on fourteen consecutive
//   nightly runs while its status line read "generated 0, skipped 0" and
//   looked like a quiet night. The numbers that would have shown the stall
//   were computed correctly and thrown away before they were written down.
//
//   The rule is now the other way round: a counter is printed unless there
//   is a reason not to. A routine that invents a new counter is visible on
//   its very next run, instead of waiting for someone to notice and edit a
//   list here.
// =====================================================================

/**
 * Counters that lead the line whenever present, in this order, EVEN AT ZERO.
 *
 * This was the entire vocabulary before 2026-08-08. It is now a priority
 * order rather than a filter, and it is kept for two reasons: these really
 * are the headline numbers for most routines, and printing them at zero is
 * what makes "ran and found nothing to do" look different from "did not run".
 */
export const HEADLINE_KEYS = [
  'generated', 'measured', 'skipped', 'created', 'sent', 'updated',
  'concerns', 'candidates', 'processed', 'recorded', 'escalations',
  'nudged', 'tipped', 'delivered', 'flagged', 'events', 'count',
  // metaloop-charter-drafts / -collect: added to the dispatcher's allowlist on
  // main while this module was in review, for the same reason this module
  // exists — without them its "last run" line could only ever say
  // "skipped 0, candidates 3". They are headline keys rather than ordinary
  // counters so that they still print AT ZERO: under the inverted rule an
  // unlisted counter is shown only when non-zero, which would have put
  // metaloop back to being unable to tell a quiet night from a dead one.
  'collected', 'filed', 'insufficient', 'enqueued',
] as const;

/**
 * Numbers that describe the request rather than its work. Timing keys are
 * matched by their `_ms` suffix, which covers every variant the cron routes
 * actually emit (elapsed_ms, duration_ms, response_time_ms, sql_elapsed_ms,
 * avg_watch_time_ms, …) without needing to enumerate them.
 */
const NOISE_KEYS = new Set(['timestamp', 'ts', 'status', 'duration_seconds']);
const isNoise = (key: string): boolean => NOISE_KEYS.has(key) || key.endsWith('_ms');

/** Readability budget for one status line. The column itself is unbounded text. */
export const MAX_STATUS_LENGTH = 190;

/**
 * Join the counters onto the HTTP status, staying inside the budget.
 *
 * When it does not fit, counters are dropped from the tail and the number
 * dropped is stated. Silently cutting the line short is the same failure
 * this module exists to fix, so it is not done silently here either.
 */
function joinWithinBudget(base: string, parts: string[]): string {
  const full = `${base} · ${parts.join(', ')}`;
  if (full.length <= MAX_STATUS_LENGTH) return full;

  const kept = [...parts];
  while (kept.length > 1) {
    kept.pop();
    const candidate = `${base} · ${kept.join(', ')} +${parts.length - kept.length} more`;
    if (candidate.length <= MAX_STATUS_LENGTH) return candidate;
  }
  return `${base} · +${parts.length} more`.slice(0, MAX_STATUS_LENGTH);
}

/**
 * Summarise one routine's result for its status line.
 *
 * @param httpStatus the HTTP status its endpoint answered with
 * @param body       the parsed JSON body, or null/undefined if it was not JSON
 *
 * Returns e.g. `HTTP 200 · generated 0, skipped 0, courses 142,
 * skipped_no_taxonomy 142` — where everything after `skipped 0` is what the
 * old allowlist discarded. Falls back to the bare HTTP status when there is
 * nothing numeric to report. Never throws: status logging must not be able
 * to fail a dispatcher tick.
 */
export function summarizeRoutineResult(httpStatus: number, body: unknown): string {
  const base = `HTTP ${httpStatus}`;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return base;

  const result = body as Record<string, unknown>;

  // A routine that reported its own failure says so in words, not counters.
  if (result.ok === false && typeof result.error === 'string') {
    return `${base} · error: ${result.error}`.slice(0, MAX_STATUS_LENGTH);
  }

  const counter = (key: string): number | null => {
    const value = result[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  };

  const parts: string[] = [];
  const printed = new Set<string>();

  for (const key of HEADLINE_KEYS) {
    const value = counter(key);
    if (value === null) continue;
    parts.push(`${key} ${value}`);
    printed.add(key);
  }

  // Then every other counter the routine chose to report, in the order it
  // reported them, whenever it has something to say. A counter sitting at
  // zero is left out to keep quiet nights short — a non-zero one never is,
  // which is the whole point: a run that skipped 142 courses now says so.
  for (const key of Object.keys(result)) {
    if (printed.has(key) || isNoise(key)) continue;
    const value = counter(key);
    if (value === null || value === 0) continue;
    parts.push(`${key} ${value}`);
  }

  return parts.length ? joinWithinBudget(base, parts) : base;
}
