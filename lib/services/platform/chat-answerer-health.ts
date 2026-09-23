// lib/services/platform/chat-answerer-health.ts
//
// "Both answering computers are down" pager for the AI Assistant.
//
// The assistant's questions are answered by the Windows chat drain, which
// stamps ai_routine_schedules 'maxlane:chat-drain' (last_fired_at) every cycle.
// A standby answerer on the Director's Mac stamps 'maxlane:chat-standby-mac'
// the same way (Director ruling 2026-09-23: "This Mac, free"). While EITHER is
// fresh, somebody is answering. When BOTH have been silent for more than
// 10 minutes, every super-admin is told — ONCE per outage.
//
// ONCE PER OUTAGE, NOT ONCE PER HOUR. An outage is identified by the last
// moment ANY answerer was seen (the later of the two heartbeats). While both
// stay down that moment does not move, so the idempotency key is constant and
// fanoutNotification's UNIQUE idempotency_key turns every later sweep into
// skipped:'idempotent' (the same mechanism loopLaneOutagePager relies on).
// When either computer comes back and later dies again, the last-seen moment
// has moved, so the new outage gets a new key and pages again.
//
// Never-stamped rows: if NEITHER heartbeat has ever been stamped the state is
// 'unknown' and nothing is sent (no false alarm before the first heartbeat —
// the same inert rule as the /ai-query banner). If only one has ever stamped,
// the other counts as not answering.
//
// Reads use the service-role client: ai_routine_schedules is deny-all to
// anon/authenticated (RLS, no policies). The caller wraps this in its own
// try/catch so it can never break the host cron.

import type { SupabaseClient } from '@supabase/supabase-js';
import { fanoutNotification } from '@/lib/services/_shared/notifications/notify';

export const WINDOWS_ANSWERER_ROW = 'maxlane:chat-drain';
export const MAC_STANDBY_ANSWERER_ROW = 'maxlane:chat-standby-mac';

/** Both heartbeats must be older than this before anyone is paged. */
export const BOTH_DOWN_ALERT_AFTER_MS = 10 * 60 * 1000;

export type AnswererOutageState =
  /** Neither heartbeat has ever been stamped — stay silent. */
  | 'unknown'
  /** At least one heartbeat is within the 10-minute window. */
  | 'answering'
  /** Both heartbeats older than 10 minutes (or one never stamped). */
  | 'both_down';

export interface AnswererOutageEvaluation {
  state: AnswererOutageState;
  /** Latest heartbeat of either computer (ms epoch), null when neither stamped. */
  lastSeenMs: number | null;
  /** Whole minutes since lastSeenMs, null when neither stamped. */
  downForMin: number | null;
  /** Present only when state === 'both_down'. Constant for one outage. */
  outageKey?: string;
}

/** Parse a timestamptz string; anything missing or unparseable → null. */
function parseMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Pure: decide whether "both answering computers are down" from the two
 * heartbeat timestamps. No I/O, so every state is unit-testable.
 */
export function evaluateAnswererOutage(
  windowsLastSeen: string | null | undefined,
  macLastSeen: string | null | undefined,
  nowMs: number,
): AnswererOutageEvaluation {
  const win = parseMs(windowsLastSeen);
  const mac = parseMs(macLastSeen);

  if (win === null && mac === null) {
    return { state: 'unknown', lastSeenMs: null, downForMin: null };
  }

  const lastSeenMs = Math.max(win ?? -Infinity, mac ?? -Infinity);
  const ageMs = nowMs - lastSeenMs;
  const downForMin = Math.max(0, Math.round(ageMs / 60000));

  if (!(ageMs > BOTH_DOWN_ALERT_AFTER_MS)) {
    return { state: 'answering', lastSeenMs, downForMin };
  }

  return {
    state: 'both_down',
    lastSeenMs,
    downForMin,
    // Normalised through Date so PostgREST's '+00:00' / microsecond formatting
    // can never produce two keys for the same instant.
    outageKey: `ai-chat-answerers-down:${new Date(lastSeenMs).toISOString()}`,
  };
}

function istLabel(ms: number | null): string {
  return ms === null
    ? 'never'
    : `${new Date(ms).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`;
}

/**
 * Read both heartbeats and, when both answering computers have been down for
 * more than 10 minutes, notify every super-admin once for this outage.
 * Returns a small summary for the sweep's logs; never throws on a read error
 * (returns checked:false instead).
 */
export async function chatAnswererOutageAlert(
  admin: SupabaseClient,
  nowMs: number = Date.now(),
): Promise<Record<string, unknown>> {
  const { data, error } = await admin
    .from('ai_routine_schedules')
    .select('routine_id, last_fired_at')
    .in('routine_id', [WINDOWS_ANSWERER_ROW, MAC_STANDBY_ANSWERER_ROW]);
  if (error) return { checked: false, error: error.message };

  const rows = (data ?? []) as { routine_id: string; last_fired_at: string | null }[];
  const windowsLastSeen = rows.find((r) => r.routine_id === WINDOWS_ANSWERER_ROW)?.last_fired_at ?? null;
  const macLastSeen = rows.find((r) => r.routine_id === MAC_STANDBY_ANSWERER_ROW)?.last_fired_at ?? null;

  const evaluation = evaluateAnswererOutage(windowsLastSeen, macLastSeen, nowMs);
  const summary = {
    checked: true,
    state: evaluation.state,
    windows_last_seen: windowsLastSeen,
    mac_last_seen: macLastSeen,
    down_for_min: evaluation.downForMin,
  };
  if (evaluation.state !== 'both_down' || !evaluation.outageKey) {
    return { ...summary, alerted: false };
  }

  const { data: supers, error: supersErr } = await admin
    .from('profiles')
    .select('id')
    .eq('is_super_admin', true);
  if (supersErr || !supers?.length) {
    return {
      ...summary,
      alerted: false,
      error: `super-admin lookup failed: ${supersErr?.message ?? 'no recipients'}`,
    };
  }
  const userIds = (supers as { id: string }[]).map((s) => s.id);

  const winMs = parseMs(windowsLastSeen);
  const macMs = parseMs(macLastSeen);
  const macPart =
    macMs === null
      ? 'the Mac backup has never checked in'
      : `the Mac backup since ${istLabel(macMs)}`;

  const outcome = await fanoutNotification(admin, {
    title: 'AI Assistant is down: no computer is answering',
    body:
      `Neither answering computer is working. The Windows computer has not checked in since ${istLabel(winMs)}, ` +
      `and ${macPart}. Nobody's questions can be answered until one of them is back ` +
      `(down for about ${evaluation.downForMin} min). Restart the chat drain on the Windows computer, or start the Mac backup.`,
    userIds,
    category: 'general', // free-text; 'general' guarantees the bell renders it
    kind: 'work_item',
    priority: 'urgent',
    idempotencyKey: evaluation.outageKey,
    url: '/ai-query',
    source: 'ai-tasks-sweep:chat-answerers-down',
    metadata: {
      event: 'ai_chat_answerers_down',
      windows_last_seen: windowsLastSeen,
      mac_last_seen: macLastSeen,
    },
  });

  return {
    ...summary,
    alerted: outcome.skipped === undefined,
    idempotent: outcome.skipped === 'idempotent',
    notified: outcome.notified,
    idempotencyKey: evaluation.outageKey,
  };
}
