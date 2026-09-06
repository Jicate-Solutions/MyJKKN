/**
 * AI Pulse — Google Meet Attendance Webhook
 *
 * Captures the join / leave moments that feed the 4-AND engagement gate for a
 * live AI Pulse cycle. Accepts a POST with
 * `{event_id, profile_id (or learner_id), joined_at?, left_at?}`.
 *
 * WHY THIS ROUTE WAS REWRITTEN (2026-08-21)
 *   It previously wrote to `event_team_attendance`, naming four shapes that do
 *   not exist:
 *     - `event_team_attendance.learner_id`  — the table is per-TEAM, keyed by
 *       `registration_id`; there is no learner column
 *     - `event_team_attendance.joined_at`   — does not exist
 *     - `event_team_attendance.left_at`     — does not exist
 *     - `startup_events.starts_at`          — does not exist; a cycle's window
 *       is derived from `demo_date`/`start_date` + `config.ai_pulse`
 *   So the very first SELECT failed with 42703 and the handler returned 500
 *   before touching any attendance row. It could never have succeeded, which
 *   is precisely why `ai_pulse_live_attendance.left_at` reads 0 written rows
 *   out of 3,631 (measured 2026-08-21) — the only writer of that column was
 *   aimed at a table that has no such column.
 *
 *   Migration `20260611_ai_pulse_live_attendance_and_champion.sql` created the
 *   per-learner table for exactly this reason, and its header calls out the
 *   same imagined shape. `live-session-service.ts` was moved onto it then; this
 *   route was missed and kept pointing at the dead one.
 *
 * WHERE LEAVE TIME ACTUALLY LIVES
 *   Not in the `left_at` column — nothing in the codebase or the database reads
 *   it (0 views, 0 functions, 0 remaining call sites). Leave time is a JSONB
 *   signal on `ai_pulse_live_attendance.engagement_signals`:
 *     last_heartbeat_at — ISO, the last moment the learner was observed
 *     stayed_until      — that same instant as IST "HH:MM" (e.g. "19:28")
 *   That pair is what the 4-AND gate (`isPresentAtEnd`), the participation
 *   card, the dept heatmap, the trends page, the weekly digest and the anomaly
 *   scan all consume. Writing a Meet-reported leave anywhere else would land it
 *   where no report looks. So this route writes the same two keys the in-page
 *   heartbeat writes, and the two merge on "latest observation wins".
 *
 * Auth:
 *   - Primary: `Authorization: Bearer ${MEET_WEBHOOK_SECRET}` header
 *   - Fallback: `?secret=` query param
 *   - Reject with 401 if neither matches OR the env var is unset.
 *
 * This pattern mirrors `app/api/cron/friday-reflection/route.ts` (CRON_SECRET).
 *
 * Runtime: Node (service-role client). NOT edge — service role keys can't
 * leave Node.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import {
  deriveCycleTimes,
  isoToIstHHMM,
  policyNumber,
  readPolicies,
  withinJoinWindow,
  type EngagementSignals,
} from '@/lib/services/ai-pulse/live-session-service';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';

const LOG_SCOPE = 'ai-pulse/meet/webhook';

interface WebhookBody {
  event_id?: string;
  /** Canonical — `ai_pulse_live_attendance` is keyed by profile_id. */
  profile_id?: string;
  /** Back-compat alias for the originally documented field name. */
  learner_id?: string;
  joined_at?: string; // ISO timestamp
  left_at?: string; // ISO timestamp — persisted as a JSONB signal, not a column
}

function isValidIso(maybeIso: unknown): maybeIso is string {
  if (typeof maybeIso !== 'string') return false;
  const t = Date.parse(maybeIso);
  return Number.isFinite(t);
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  // ── Auth ──────────────────────────────────────────────────────────
  const secret = process.env.MEET_WEBHOOK_SECRET;
  if (!secret) {
    logger.warn(LOG_SCOPE, 'MEET_WEBHOOK_SECRET not configured');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${secret}` && querySecret !== secret) {
    logger.warn(LOG_SCOPE, 'Unauthorized attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Body parse + validate ─────────────────────────────────────────
  let body: WebhookBody;
  try {
    body = (await request.json()) as WebhookBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { event_id, joined_at, left_at } = body;
  const profile_id = body.profile_id ?? body.learner_id;
  if (!event_id || !profile_id) {
    return NextResponse.json(
      { error: 'event_id and profile_id are required' },
      { status: 400 },
    );
  }
  if (joined_at !== undefined && !isValidIso(joined_at)) {
    return NextResponse.json(
      { error: 'joined_at must be ISO-8601 if provided' },
      { status: 400 },
    );
  }
  if (left_at !== undefined && !isValidIso(left_at)) {
    return NextResponse.json(
      { error: 'left_at must be ISO-8601 if provided' },
      { status: 400 },
    );
  }
  if (joined_at === undefined && left_at === undefined) {
    return NextResponse.json(
      { error: 'At least one of joined_at, left_at must be provided' },
      { status: 400 },
    );
  }

  // Cast to any: ai_pulse_live_attendance is not in the generated Database
  // types. Matches the per-call cast pattern in live-session-service.
  const supabase = createServiceRoleClient() as any;

  // ── Read the cycle and derive its session window ──────────────────
  // `startup_events` has NO starts_at/ends_at columns — the calendar date is
  // demo_date (fallback start_date) and the HH:MM window lives in
  // config.ai_pulse. deriveCycleTimes composes them, exactly as recordJoin does.
  const { data: cycleRow, error: cycleErr } = await supabase
    .from('startup_events')
    .select('id, demo_date, start_date, end_date, config')
    .eq('id', event_id)
    .maybeSingle();

  if (cycleErr) {
    logger.error(LOG_SCOPE, 'cycle read failed', cycleErr);
    return NextResponse.json(
      { error: 'Database read failed', detail: cycleErr.message },
      { status: 500 },
    );
  }
  if (!cycleRow) {
    return NextResponse.json(
      { error: 'event_id not found in startup_events' },
      { status: 404 },
    );
  }

  // ── Read existing attendance row (preserve other writers' JSONB keys) ──
  const { data: existing, error: readErr } = await supabase
    .from('ai_pulse_live_attendance')
    .select('id, joined_at, engagement_signals')
    .eq('event_id', event_id)
    .eq('profile_id', profile_id)
    .eq('day_type', 'live_session')
    .maybeSingle();

  if (readErr) {
    logger.error(LOG_SCOPE, 'attendance read failed', readErr);
    return NextResponse.json(
      { error: 'Database read failed', detail: readErr.message },
      { status: 500 },
    );
  }

  const prevSignals = (existing?.engagement_signals ?? {}) as EngagementSignals;
  const signalsPatch: EngagementSignals = {};

  // ── Join: earliest wins ───────────────────────────────────────────
  // Multiple Meet "joined" events fire on reconnect; the gate asks whether the
  // learner was on time, so the FIRST arrival is the one that counts.
  const existingJoin = (existing?.joined_at ?? null) as string | null;
  let resolvedJoin = existingJoin;
  if (joined_at) {
    resolvedJoin =
      !existingJoin || new Date(joined_at) < new Date(existingJoin)
        ? joined_at
        : existingJoin;
    signalsPatch.joined_at = resolvedJoin;

    // On-time window is the `late_threshold_minutes` policy row (seeded 10),
    // read through the same helper recordJoin uses so a Meet-sourced join and
    // an in-page join can never disagree about what "on time" means.
    const { starts_at: startsAt } = deriveCycleTimes(cycleRow);
    const policies = await readPolicies(supabase);
    const lateThresholdMinutes = policyNumber(
      policies,
      'late_threshold_minutes',
      10,
    );
    signalsPatch.joined_within_5min = withinJoinWindow(
      resolvedJoin,
      startsAt,
      lateThresholdMinutes,
    );
  }

  // ── Leave: latest observation wins ────────────────────────────────
  // A Meet-reported leave is an OBSERVATION of the learner, the same kind of
  // fact the in-page heartbeat records, so it merges into the same two keys.
  // Taking the later of the two means a learner who dropped and rejoined (Meet
  // reports the early leave) is not credited with less time than the heartbeat
  // actually saw, and a learner whose tab closed before the final heartbeat
  // fired still gets the Meet-observed leave.
  const existingLeave = prevSignals.last_heartbeat_at ?? null;
  let resolvedLeave = existingLeave;
  if (left_at) {
    resolvedLeave =
      !existingLeave || new Date(left_at) > new Date(existingLeave)
        ? left_at
        : existingLeave;
    signalsPatch.last_heartbeat_at = resolvedLeave;
    signalsPatch.stayed_until = isoToIstHHMM(resolvedLeave);
  }

  const nextSignals: EngagementSignals = { ...prevSignals, ...signalsPatch };
  const nowIso = new Date().toISOString();

  // NOTE: `left_at` is deliberately absent from this write. The column exists
  // but nothing reads it; the JSONB signal pair above is what every AI Pulse
  // report consumes. See the header block.
  const { error: writeErr } = await supabase
    .from('ai_pulse_live_attendance')
    .upsert(
      {
        event_id,
        profile_id,
        day_type: 'live_session',
        joined_at: resolvedJoin,
        engagement_signals: nextSignals,
        updated_at: nowIso,
      },
      { onConflict: 'event_id,profile_id,day_type' },
    );

  if (writeErr) {
    logger.error(LOG_SCOPE, 'attendance write failed', writeErr);
    return NextResponse.json(
      { error: 'Database write failed', detail: writeErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    event_id,
    profile_id,
    joined_at: resolvedJoin,
    // What was actually persisted for "leave" — the JSONB signal pair, so a
    // caller can see the stored shape rather than assume a column was set.
    last_heartbeat_at: nextSignals.last_heartbeat_at ?? null,
    stayed_until: nextSignals.stayed_until ?? null,
    duration_ms: Date.now() - startTime,
  });
}
