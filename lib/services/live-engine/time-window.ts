/**
 * Live Engine — session time-window helpers (pure)
 *
 * WHY THIS FILE EXISTS
 *   These four functions were born inside
 *   `lib/services/ai-pulse/live-session-service.ts` and are the only part of
 *   the AI Pulse live machinery that is genuinely reusable: they know nothing
 *   about startup_events, ai_pulse_live_attendance, profiles, or any table at
 *   all. Everything else in that service is welded to AI Pulse's storage.
 *
 *   The Online Meetings module needs exactly this logic and none of that
 *   storage, so the pure half moved here and `live-session-service.ts`
 *   re-exports each name. No AI Pulse consumer changed, and no AI Pulse
 *   behaviour changed — this was a move plus a re-export, deliberately, so
 *   that a regression in a module holding thousands of live attendance rows
 *   would be a mistake rather than a trade-off.
 *
 * WHAT DID **NOT** MOVE, AND WHY
 *   `deriveCycleTimes` stays in the AI Pulse service. It reconstructs a
 *   session window out of `demo_date` plus "HH:MM" strings in a JSONB config
 *   because `startup_events` has no time columns at all. `online_meetings`
 *   has real `starts_at` / `ends_at` columns, so it has no use for it and
 *   importing it would only invite someone to store times the hard way again.
 *
 *   `readPolicies` likewise stays: AI Pulse thresholds are global rows in
 *   `ai_pulse_policies`, while an online meeting carries its own
 *   `engagement_config`. One global policy table would be exactly wrong for a
 *   module where every meeting is configured separately.
 *
 * Everything here is a pure function. No Supabase client, no React, no I/O.
 */

/** Minutes between two ISO/parseable timestamps. Always non-negative. */
export function diffMinutes(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 60_000;
}

/**
 * Did this join land inside the on-time window?
 *
 * `windowMinutes` is caller-supplied (AI Pulse reads `late_threshold_minutes`
 * from its policies; an online meeting reads it from `engagement_config`), so
 * this function has no opinion about the number and no default of its own.
 *
 * With no start time we return true rather than false. A meeting whose window
 * cannot be derived should not silently mark every attendee late — an absent
 * measurement is not a failed one.
 */
export function withinJoinWindow(
  joinedAt: string,
  startsAt: string | null,
  windowMinutes: number,
): boolean {
  if (!startsAt) return true;
  const joined = new Date(joinedAt).getTime();
  const start = new Date(startsAt).getTime();
  if (!Number.isFinite(joined) || !Number.isFinite(start)) return true;
  return joined <= start + windowMinutes * 60_000;
}

/**
 * "HH:MM" of an ISO timestamp in IST (Asia/Kolkata).
 *
 * en-GB gives 24-hour output with a leading zero, which matters: the stored
 * `stayed_until` signal is compared as a STRING, and "9:05" would sort below
 * "18:55" while "09:05" sorts correctly.
 */
export function isoToIstHHMM(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Subtract `minutes` from an "HH:MM" string, clamped at 00:00 (same-day). */
export function hhmmMinusMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const total = Math.max(0, h * 60 + m - minutes);
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Effective session status, derived from the clock.
 *
 * The AI Pulse original exists because nothing in that platform ever
 * transitioned a cycle out of 'draft' — the heartbeat gate ("only while
 * live") and the quiz gate ("opens post_event") were therefore unreachable,
 * and cycle #1 recorded zero engagement for exactly that reason. Rather than
 * add status-flipping machinery somebody has to remember to run, the status
 * is derived: a pending session inside its window IS live, and past its
 * window IS finished.
 *
 * An explicitly-set status always wins, which is what makes a cancellation
 * stick. `pendingStatus` names the value that means "nobody has decided yet"
 * — 'draft' for an AI Pulse cycle, 'scheduled' for an online meeting.
 */
export function deriveEffectiveStatus(
  rawStatus: string,
  startsAt: string | null,
  endsAt: string | null,
  nowMs: number = Date.now(),
  pendingStatus: string = 'draft',
  liveStatus: string = 'live',
  finishedStatus: string = 'post_event',
): string {
  if (rawStatus !== pendingStatus) return rawStatus;
  if (!startsAt || !endsAt) return rawStatus;
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return rawStatus;
  if (nowMs >= start && nowMs <= end) return liveStatus;
  if (nowMs > end) return finishedStatus;
  return rawStatus;
}
