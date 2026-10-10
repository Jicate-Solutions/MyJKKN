// lib/bug-reports/read-count.ts
// ============================================================================
// One strict reader for the bug-AI pacing counts, shared by the hourly producer
// (app/api/cron/bug-ai-auto) and the nightly group pass
// (app/api/cron/bug-cluster-scan).
//
// THE TRAP THIS EXISTS FOR — it bit both routes independently.
//
//   Number(null) === 0        // an absent ?batch= / ?fixability= param
//   Number('')   === 0        // an empty one
//   fn_get_policy(...) → NULL // a policy row that has not been seeded yet
//
// A reader written the obvious way —
//   const n = Number(raw); if (Number.isFinite(n) && n >= 0) use(n);
// — therefore reads "there is no value here" as an explicit ZERO. And zero is
// MEANINGFUL for these two knobs: it pauses the drip and switches the group
// pass off. So the failure is silent and inverted. Every manual run passed the
// value explicitly and worked perfectly; the SCHEDULED run — the only one that
// matters — would have queued nothing at all, with no error, no empty result to
// notice, and (for the producer) no alarm, because bug-lane-watch only asks
// whether any bug job was queued in 24 hours.
//
// Hence: absence returns null, and the caller supplies its own default with ??.
// A boolean, an object or a non-numeric string counts as absence too — a
// malformed row must fall back to the default, never land as 0.
// ============================================================================

/**
 * A non-negative whole count, or null when there is no usable value.
 *
 * Accepts a number, or a string that parses to one. Returns null for
 * null/undefined, an empty or non-numeric string, a boolean, an object, a
 * negative number, NaN and Infinity — all of which mean "fall back", not "zero".
 * A real 0 (`?batch=0`, or a seeded `0`) is preserved, because that is how these
 * knobs are switched off on purpose.
 */
export function readCount(raw: unknown): number | null {
  // ALLOW-LIST the accepted types rather than rejecting known-bad ones. Number()
  // coerces far more than it looks: Number([]) is 0 and Number(['3']) is 3, and
  // platform_policies really does store arrays (bug_triage_agent.allowlist_tags
  // is one), so a mistyped key could otherwise arrive as a plausible count. A
  // count is a number or a string that spells one. Nothing else.
  if (typeof raw !== 'number' && typeof raw !== 'string') return null;
  if (typeof raw === 'string' && raw.trim() === '') return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}
