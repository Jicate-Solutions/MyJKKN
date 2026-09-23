// lib/services/platform/chat-answerer-health.ts
//
// "No computer is answering the AI Assistant" pager.
//
// The assistant's questions (ai_jobs.job_type = 'ai_query.chat') are answered
// by the Windows chat drain, which stamps ai_routine_schedules
// 'maxlane:chat-drain' (last_fired_at) every cycle. A standby answerer on the
// Director's Mac (launchd ai.jkkn.maxlane.chatstandby, Director ruling
// 2026-09-23: "This Mac, free") upserts 'maxlane:chat-standby-mac' with
// managed = false and last_fired_at = now() every 60 s while it can answer —
// a direct PostgREST upsert, NOT fn_ai_routine_record_fire (which never sets
// last_fired_at and writes a run-log row on every call). It claims a question
// only when the Windows heartbeat is > 150 s old or a question has waited
// > 75 s, and its runner names start with 'mac-chat-standby-'.
//
// A HEARTBEAT ALONE IS NOT TRUSTED. 20260727010000 records 'maxlane:chat-drain'
// frozen for 13 days while the drain was answering, and the Windows box clock
// runs ~47 s fast. So super-admins are paged ONLY when BOTH:
//   (a) both answerers look down —
//         Windows: heartbeat older than 15 min (or never) AND no ai_query.chat
//                  question claimed by a non-Mac runner in the last 15 min;
//         Mac:     heartbeat older than 15 min (or never);
//   (b) real impact — at least one ai_query.chat question has been waiting
//       unclaimed for more than 10 minutes.
// (b) is what makes 24/7 paging acceptable: at 03:00 with nobody asking,
// nothing is sent however stale the heartbeats are.
//
// ONCE PER OUTAGE, NOT ONCE PER HOUR. An outage is identified by the last
// moment any answerer was seen (the latest of the two heartbeats and the last
// Windows claim). While everything stays down that moment does not move, so
// the idempotency key is constant and fanoutNotification's UNIQUE
// idempotency_key turns every later sweep into skipped:'idempotent' (the same
// dedupe mechanism loopLaneOutagePager relies on). When a computer comes back
// and later dies again, the last-seen moment has moved: new outage, new key.
//
// Thresholds, side by side (they differ on purpose):
//   /ai-query banner (fn_ai_chat_drain_health): red when neither heartbeat is
//     < 3 min old and neither answerer claimed a question in 10 min — an early
//     warning for a super-admin who happens to be looking.
//   this pager: 15 min of silence AND a question waiting > 10 min, checked by
//     the ai-tasks-sweep every 15 min — so a page lands roughly 25-40 min into
//     a real outage. A super-admin can therefore see red before any page.
//
// Never-stamped rows: if neither heartbeat has ever been stamped and Windows
// has no claim evidence, the state is 'unknown' and nothing is sent (the same
// inert rule as the /ai-query banner). If only one has ever stamped, the
// other counts as not answering.
//
// Reads use the service-role client: ai_routine_schedules is deny-all to
// anon/authenticated (RLS, no policies). Never throws on a read error — it
// returns checked:false — and the caller logs that and puts the result in the
// sweep's JSON so a broken pager is visible.

import type { SupabaseClient } from '@supabase/supabase-js';
import { fanoutNotification } from '@/lib/services/_shared/notifications/notify';

export const WINDOWS_ANSWERER_ROW = 'maxlane:chat-drain';
export const MAC_STANDBY_ANSWERER_ROW = 'maxlane:chat-standby-mac';
/** Runner names the Mac standby claims under (chat-standby.mjs RUNNER). */
export const MAC_STANDBY_RUNNER_PREFIX = 'mac-chat-standby-';
export const CHAT_JOB_TYPE = 'ai_query.chat';

/** An answerer silent (no heartbeat, no claim) for longer than this counts as down. */
export const ANSWERER_DOWN_AFTER_MS = 15 * 60 * 1000;
/** A question must have waited unclaimed longer than this before anyone is paged. */
export const QUESTION_WAITING_ALERT_AFTER_MS = 10 * 60 * 1000;

export type AnswererOutageState =
  /** No heartbeat ever stamped and no claim evidence — stay silent. */
  | 'unknown'
  /** At least one answerer is up (fresh heartbeat, or Windows claimed recently). */
  | 'answering'
  /** Both look down, but no question has waited > 10 min — nobody is affected, no page. */
  | 'down_idle'
  /** Both look down AND a question has waited > 10 min — page. */
  | 'both_down';

export interface AnswererEvidence {
  /** 'maxlane:chat-drain'.last_fired_at */
  windowsHeartbeat: string | null | undefined;
  /** 'maxlane:chat-standby-mac'.last_fired_at */
  macHeartbeat: string | null | undefined;
  /** Latest claimed_at of an ai_query.chat job by a runner that is NOT the Mac standby. */
  windowsLastClaim: string | null | undefined;
  /** requested_at of the oldest ai_query.chat job still pending and unclaimed. */
  oldestWaitingQuestion: string | null | undefined;
}

export interface AnswererOutageEvaluation {
  state: AnswererOutageState;
  /** Latest sign of life from any answerer (ms epoch), null when there is none. */
  lastSeenMs: number | null;
  /** Whole minutes since lastSeenMs, null when there is none. */
  downForMin: number | null;
  /** Whole minutes the oldest unclaimed question has waited, null when none is waiting. */
  waitingMin: number | null;
  /** Present only when state === 'both_down'. Constant for one outage. */
  outageKey?: string;
}

/** Parse a timestamptz string; anything missing or unparseable → null. */
function parseMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Silent for longer than `afterMs`, or never seen. A future stamp (fast clock) is fresh. */
function silentFor(ms: number | null, nowMs: number, afterMs: number): boolean {
  return ms === null || nowMs - ms > afterMs;
}

/**
 * Pure: decide whether to page from the heartbeats, the last Windows claim
 * and the oldest waiting question. No I/O, so every state is unit-testable.
 */
export function evaluateAnswererOutage(
  evidence: AnswererEvidence,
  nowMs: number,
): AnswererOutageEvaluation {
  const win = parseMs(evidence.windowsHeartbeat);
  const mac = parseMs(evidence.macHeartbeat);
  const winClaim = parseMs(evidence.windowsLastClaim);
  const waiting = parseMs(evidence.oldestWaitingQuestion);

  const waitingMin = waiting === null ? null : Math.max(0, Math.round((nowMs - waiting) / 60000));
  const seen = [win, mac, winClaim].filter((v): v is number => v !== null);
  const lastSeenMs = seen.length ? Math.max(...seen) : null;
  const downForMin = lastSeenMs === null ? null : Math.max(0, Math.round((nowMs - lastSeenMs) / 60000));

  const windowsDown =
    silentFor(win, nowMs, ANSWERER_DOWN_AFTER_MS) && silentFor(winClaim, nowMs, ANSWERER_DOWN_AFTER_MS);
  const macDown = silentFor(mac, nowMs, ANSWERER_DOWN_AFTER_MS);

  if (!windowsDown || !macDown) {
    return { state: 'answering', lastSeenMs, downForMin, waitingMin };
  }
  if (win === null && mac === null) {
    // Neither heartbeat has ever been stamped: inert, like the banner.
    return { state: 'unknown', lastSeenMs, downForMin, waitingMin };
  }
  if (waiting === null || !(nowMs - waiting > QUESTION_WAITING_ALERT_AFTER_MS)) {
    return { state: 'down_idle', lastSeenMs, downForMin, waitingMin };
  }

  return {
    state: 'both_down',
    lastSeenMs,
    downForMin,
    waitingMin,
    // Normalised through Date so PostgREST's '+00:00' / microsecond formatting
    // can never produce two keys for the same instant. lastSeenMs is non-null
    // here: at least one heartbeat is non-null.
    outageKey: `ai-chat-answerers-down:${new Date(lastSeenMs as number).toISOString()}`,
  };
}

function istLabel(ms: number | null): string {
  return ms === null
    ? 'never'
    : `${new Date(ms).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`;
}

/**
 * Read the evidence and, when both answering computers are down AND a
 * question has been waiting more than 10 minutes, notify every super-admin
 * once for this outage. Returns a summary for the sweep's JSON; never throws
 * on a read error (returns checked:false instead).
 */
export async function chatAnswererOutageAlert(
  admin: SupabaseClient,
  nowMs: number = Date.now(),
): Promise<Record<string, unknown>> {
  const { data, error } = await admin
    .from('ai_routine_schedules')
    .select('routine_id, last_fired_at')
    .in('routine_id', [WINDOWS_ANSWERER_ROW, MAC_STANDBY_ANSWERER_ROW]);
  if (error) return { checked: false, error: `heartbeat read failed: ${error.message}` };

  const { data: claimRow, error: claimErr } = await admin
    .from('ai_jobs')
    .select('claimed_at')
    .eq('job_type', CHAT_JOB_TYPE)
    .not('claimed_at', 'is', null)
    .not('claimed_by', 'like', `${MAC_STANDBY_RUNNER_PREFIX}%`)
    .order('claimed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (claimErr) return { checked: false, error: `last-claim read failed: ${claimErr.message}` };

  const { data: waitingRow, error: waitingErr } = await admin
    .from('ai_jobs')
    .select('requested_at')
    .eq('job_type', CHAT_JOB_TYPE)
    .eq('status', 'pending')
    .is('claimed_at', null)
    .order('requested_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (waitingErr) return { checked: false, error: `waiting-question read failed: ${waitingErr.message}` };

  const rows = (data ?? []) as { routine_id: string; last_fired_at: string | null }[];
  const windowsLastSeen = rows.find((r) => r.routine_id === WINDOWS_ANSWERER_ROW)?.last_fired_at ?? null;
  const macLastSeen = rows.find((r) => r.routine_id === MAC_STANDBY_ANSWERER_ROW)?.last_fired_at ?? null;
  const windowsLastClaim = (claimRow as { claimed_at: string | null } | null)?.claimed_at ?? null;
  const oldestWaiting = (waitingRow as { requested_at: string | null } | null)?.requested_at ?? null;

  const evaluation = evaluateAnswererOutage(
    {
      windowsHeartbeat: windowsLastSeen,
      macHeartbeat: macLastSeen,
      windowsLastClaim,
      oldestWaitingQuestion: oldestWaiting,
    },
    nowMs,
  );
  const summary = {
    checked: true,
    state: evaluation.state,
    windows_last_seen: windowsLastSeen,
    windows_last_claim: windowsLastClaim,
    mac_last_seen: macLastSeen,
    down_for_min: evaluation.downForMin,
    waiting_min: evaluation.waitingMin,
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
  const winClaimMs = parseMs(windowsLastClaim);
  const macMs = parseMs(macLastSeen);
  const windowsPart =
    `The Windows computer last checked in ${winMs === null ? 'never' : `at ${istLabel(winMs)}`}` +
    (winClaimMs === null ? '' : ` and last picked up a question at ${istLabel(winClaimMs)}`);
  const macPart =
    macMs === null
      ? 'the Mac backup has never checked in'
      : `the Mac backup last checked in at ${istLabel(macMs)}`;

  const outcome = await fanoutNotification(admin, {
    title: 'AI Assistant is down: no computer is answering',
    body:
      `A question has been waiting about ${evaluation.waitingMin} min and nobody's questions are being answered. ` +
      `${windowsPart}; ${macPart}. ` +
      `Restart the chat drain on the Windows computer, or check that the Mac backup is running.`,
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
      windows_last_claim: windowsLastClaim,
      mac_last_seen: macLastSeen,
      oldest_waiting_question: oldestWaiting,
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
