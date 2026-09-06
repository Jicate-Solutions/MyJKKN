// =====================================================================
// AI Pulse — when does a cycle end, and how long should a per-cycle
// notification stay in the bell?
// =====================================================================
// Created: 2026-08-11.
//
// WHY THIS EXISTS
//   `category='ai_pulse'` notifications were the last generator family
//   still inserting rows with expires_at NULL after
//   supabase/migrations/20260816040000_notification_expiry_director_categories.sql
//   and supabase/migrations/20260817013700_scf_nudge_ttl_at_source.sql.
//   Measured on production 2026-08-11: 1,005 ai_pulse rows, ALL 1,005 with
//   expires_at IS NULL. 1,004 of them come from the two KEYED emitters —
//   ai_pulse_weekly_digest (575) and ai_pulse_domain_starter_notify (429) —
//   which this module serves. (The 1 remaining row is an un-keyed
//   per-incident escalation and is deliberately left alone.)
//
//   Those two were explicitly deferred by PR #2971 rather than guessed at:
//   both are keyed per CYCLE and each announces THAT cycle's own deliverable,
//   so a fixed hour count would either kill a learner's live prompt early or
//   fail to track a cadence change. The TTL has to come from the cycle.
//
// WHAT AN AI PULSE CYCLE IS, IN DATA (read off production 2026-08-11)
//   A cycle is a row in `startup_events` with config->>kind = 'ai_pulse'.
//   Eleven exist. Relevant shape:
//     demo_date                          the session's day (all 11 land on a
//                                        Thursday bar one, and are exactly 7
//                                        days apart)
//     config.ai_pulse.session_start_time "18:55" IST
//     config.ai_pulse.session_end_time   "19:30" IST
//     config.ai_pulse.cycle_week_start_date  equals demo_date — the cycle is a
//                                        WEEK that opens on the session day
//     status                             'draft' on ALL ELEVEN
//
//   That last line is the load-bearing one: `status` is NOT a lifecycle
//   signal for ai_pulse. There is no 'completed' or 'closed' cycle on this
//   platform, so "has this cycle ended?" cannot be answered from a column.
//   What CAN be answered from data is when the SUCCESSOR cycle opens — and a
//   cycle ends exactly when its successor begins. That is the definition used
//   here, and it is derived, never assumed.
//
// THE RULE
//   expiresAt = max(cycleEnd, now) + 0.5 x cycleLength
//
//   - cycleEnd     the successor cycle's session start; when no successor row
//                  exists yet (the usual case for the newest cycle) it is this
//                  cycle's own start plus cycleLength.
//   - cycleLength  the MEDIAN gap between consecutive demo_dates in the window
//                  the caller already read. Median, not mean, so the single
//                  1-day 2026-06-17/06-18 pair cannot drag it. Falls back to 7
//                  days only when fewer than two cycles exist to measure.
//   - the 0.5x tail is the same 1.5x-of-a-cycle margin used throughout
//     20260816040000 and 20260817013700: expiring exactly AT the moment the
//     replacement is due empties the bell on any slip. Here it matters
//     concretely — aipulse-domain-starter-notify's first hourly sweep fires at
//     19:30 IST, the same minute the previous cycle's session start + 7d lands.
//   - max(cycleEnd, now) is the floor that keeps a row from being born already
//     expired. Without it, a digest emitted about a cycle whose successor is
//     overdue (cycles paused for a vacation, say) would insert a row whose
//     expires_at is in the past and vanish from the bell immediately.
//
// WHAT THIS DOES NOT DO
//   It touches no existing row. Every one of the 1,005 unexpired rows on
//   production stays exactly as it is; clearing them is a separate Director
//   decision (the last such backfill, 43,775 rows, required an explicit
//   ruling). This only stops the pile growing.

/** `config.ai_pulse.session_start_time` default, matching the seeded cycles. */
const DEFAULT_SESSION_START_HHMM = '18:55';

/** IST offset. demo_date is a plain day; the session times are IST wall clock. */
const IST_OFFSET = '+05:30';

/**
 * Only used when the cycle table cannot show a spacing at all (fewer than two
 * cycles). Every real cycle on production is 7 days from the next, and
 * `config.ai_pulse.cycle_week_start_date` says the grain is a week.
 */
const FALLBACK_CYCLE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The subset of a `startup_events` ai_pulse row this module needs. */
export interface AiPulseCycleRow {
  id: string;
  demo_date?: string | null;
  config?: unknown;
}

/** `config.ai_pulse.session_start_time`, tolerating the flat-config shape. */
function sessionStartHHMM(config: unknown): string {
  const cfg = (config ?? {}) as Record<string, unknown>;
  const aiPulse = (cfg.ai_pulse ?? cfg) as Record<string, unknown>;
  const raw = aiPulse?.session_start_time;
  return typeof raw === 'string' && /^\d{1,2}:\d{2}$/.test(raw)
    ? raw
    : DEFAULT_SESSION_START_HHMM;
}

/**
 * The instant a cycle's session opens: its `demo_date` day at its own
 * `session_start_time`, read as IST. `demo_date` arrives as a timestamptz at
 * UTC midnight (`2026-08-13T00:00:00+00:00`) or as a bare date; both slice to
 * the same day.
 */
export function cycleStartsAt(cycle: AiPulseCycleRow | null | undefined): Date | null {
  const day = cycle?.demo_date ? String(cycle.demo_date).slice(0, 10) : null;
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const [hh, mm] = sessionStartHHMM(cycle?.config).split(':');
  const at = new Date(`${day}T${hh.padStart(2, '0')}:${mm}:00${IST_OFFSET}`);
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * How long one cycle lasts, measured from the cycles themselves: the MEDIAN
 * gap between consecutive `demo_date`s in the supplied window.
 */
export function cycleLengthMs(cycles: readonly AiPulseCycleRow[]): number {
  const days = cycles
    .map((c) => (c?.demo_date ? Date.parse(String(c.demo_date).slice(0, 10)) : NaN))
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b);

  const gaps: number[] = [];
  for (let i = 1; i < days.length; i++) {
    const gap = days[i] - days[i - 1];
    if (gap > 0) gaps.push(gap);
  }
  if (gaps.length === 0) return FALLBACK_CYCLE_DAYS * DAY_MS;

  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  return gaps.length % 2 === 1 ? gaps[mid] : Math.round((gaps[mid - 1] + gaps[mid]) / 2);
}

/**
 * When the given cycle ends: the moment its SUCCESSOR opens. Falls back to this
 * cycle's own start plus one measured cycle length when no successor row exists
 * yet — which is the normal case, because both emitters key to the newest cycle.
 */
export function cycleEndsAt(
  cycle: AiPulseCycleRow | null | undefined,
  cycles: readonly AiPulseCycleRow[],
): Date | null {
  const start = cycleStartsAt(cycle);
  if (!start) return null;

  const successorStart = cycles
    .filter((c) => c?.id !== cycle?.id)
    .map((c) => cycleStartsAt(c))
    .filter((d): d is Date => d !== null && d.getTime() > start.getTime())
    .sort((a, b) => a.getTime() - b.getTime())[0];

  return successorStart ?? new Date(start.getTime() + cycleLengthMs(cycles));
}

/**
 * The `expires_at` to stamp on a notification that announces this cycle's own
 * deliverable. Returns null when the cycle carries no usable `demo_date`, in
 * which case the caller must leave the column NULL rather than guess — today's
 * behaviour, unchanged.
 */
export function cycleNotificationExpiresAt(
  cycle: AiPulseCycleRow | null | undefined,
  cycles: readonly AiPulseCycleRow[],
  now: Date = new Date(),
): string | null {
  const end = cycleEndsAt(cycle, cycles);
  if (!end) return null;
  const margin = Math.round(cycleLengthMs(cycles) / 2);
  const from = Math.max(end.getTime(), now.getTime());
  return new Date(from + margin).toISOString();
}
