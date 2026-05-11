/**
 * AI Pulse — Google Meet Attendance Webhook (v1 stub)
 *
 * Spec ref: AI Pulse v3 §2 / §5 (Live Session). Captures the joined_at /
 * left_at timestamps that feed the 4-AND engagement gate. The full Meet API
 * integration is a Phase 2 concern; this v1 endpoint just accepts a POST
 * with `{event_id, learner_id, joined_at?, left_at?}` and persists into
 * `event_team_attendance` (day_type='live_session').
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
import { createServiceRoleClient } from '@/lib/supabase/server';

interface WebhookBody {
  event_id?: string;
  learner_id?: string;
  joined_at?: string; // ISO timestamp
  left_at?: string; // ISO timestamp
}

interface EngagementSignalsPatch {
  joined_at?: string;
  left_at?: string;
  joined_within_5min?: boolean;
}

function diffMinutes(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 60_000;
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
    console.warn('[ai-pulse/meet/webhook] MEET_WEBHOOK_SECRET not configured');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${secret}` && querySecret !== secret) {
    console.warn('[ai-pulse/meet/webhook] Unauthorized attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Body parse + validate ─────────────────────────────────────────
  let body: WebhookBody;
  try {
    body = (await request.json()) as WebhookBody;
  } catch (e) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { event_id, learner_id, joined_at, left_at } = body;
  if (!event_id || !learner_id) {
    return NextResponse.json(
      { error: 'event_id and learner_id are required' },
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

  const supabase = createServiceRoleClient();

  // ── Read cycle starts_at to compute joined_within_5min ────────────
  const { data: cycleRow } = await supabase
    .from('startup_events')
    .select('id, starts_at')
    .eq('id', event_id)
    .maybeSingle();

  if (!cycleRow) {
    return NextResponse.json(
      { error: 'event_id not found in startup_events' },
      { status: 404 },
    );
  }

  // ── Read existing attendance row (preserve other JSONB keys) ──────
  const { data: existing, error: readErr } = await supabase
    .from('event_team_attendance')
    .select('id, joined_at, left_at, engagement_signals')
    .eq('event_id', event_id)
    .eq('learner_id', learner_id)
    .eq('day_type', 'live_session')
    .maybeSingle();

  if (readErr) {
    console.error('[ai-pulse/meet/webhook] read failed:', readErr);
    return NextResponse.json(
      { error: 'Database read failed', detail: readErr.message },
      { status: 500 },
    );
  }

  const prevSignals = (existing?.engagement_signals ?? {}) as Record<
    string,
    unknown
  >;
  const signalsPatch: EngagementSignalsPatch = {};

  // Earliest join wins (multiple Meet "joined" events can fire on reconnect)
  const incomingJoin = joined_at ?? null;
  const existingJoin = (existing?.joined_at ?? null) as string | null;
  let resolvedJoin = existingJoin;
  if (incomingJoin) {
    resolvedJoin =
      !existingJoin || new Date(incomingJoin) < new Date(existingJoin)
        ? incomingJoin
        : existingJoin;
    signalsPatch.joined_at = resolvedJoin;

    if (cycleRow.starts_at) {
      const startsAt = cycleRow.starts_at as string;
      signalsPatch.joined_within_5min =
        new Date(resolvedJoin).getTime() <=
        new Date(startsAt).getTime() + 5 * 60_000;
    } else {
      signalsPatch.joined_within_5min = true;
    }
  }

  // Latest leave wins (last "left" event = final left)
  const incomingLeave = left_at ?? null;
  const existingLeave = (existing?.left_at ?? null) as string | null;
  let resolvedLeave = existingLeave;
  if (incomingLeave) {
    resolvedLeave =
      !existingLeave || new Date(incomingLeave) > new Date(existingLeave)
        ? incomingLeave
        : existingLeave;
    signalsPatch.left_at = resolvedLeave;
  }

  const nextSignals = { ...prevSignals, ...signalsPatch };
  const nowIso = new Date().toISOString();

  const { error: writeErr } = await supabase
    .from('event_team_attendance')
    .upsert(
      {
        id: existing?.id,
        event_id,
        learner_id,
        day_type: 'live_session',
        joined_at: resolvedJoin,
        left_at: resolvedLeave,
        engagement_signals: nextSignals,
        updated_at: nowIso,
      },
      { onConflict: 'id' },
    );

  if (writeErr) {
    console.error('[ai-pulse/meet/webhook] write failed:', writeErr);
    return NextResponse.json(
      { error: 'Database write failed', detail: writeErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    event_id,
    learner_id,
    joined_at: resolvedJoin,
    left_at: resolvedLeave,
    duration_ms: Date.now() - startTime,
  });
}
