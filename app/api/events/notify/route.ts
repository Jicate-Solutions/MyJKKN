export const dynamic = 'force-dynamic';

// app/api/events/notify/route.ts
// In-app notification dispatch for the events module (KBM Marathon + other events).
// Follows the x-api-key pattern established by app/api/work-pulse/notify/route.ts.
//
// Triggered by:
//   1. Cron (e.g. upcoming-event reminders — Phase 2)
//   2. Internal server routes that call this endpoint immediately after a state change
//      (e.g. registration-confirm handler POSTs here to notify the registrant)
//
// Currently handles 2 event types; the structure supports drop-in expansion.

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { fanoutNotification } from '@/lib/services/_shared/notifications/notify';

const VALID_API_KEY = process.env.EVENTS_API_KEY;

type NotificationType =
  | 'registration_confirmed'
  | 'event_schedule_changed';

/**
 * POST /api/events/notify?type=<event_type>
 *
 * Auth: `x-api-key` header must equal `process.env.EVENTS_API_KEY`.
 * Body (JSON):
 *   - registration_confirmed: `{ "registration_id": "<uuid>" }`
 *   - event_schedule_changed: `{ "event_id": "<uuid>", "reason"?: "<string>" }`
 */
export async function POST(request: NextRequest) {
  await connection();

  const apiKey = request.headers.get('x-api-key');
  if (!VALID_API_KEY || apiKey !== VALID_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const type = searchParams.get('type') as NotificationType;

  if (!type) {
    return NextResponse.json({ error: 'Missing ?type= parameter' }, { status: 400 });
  }

  try {
    const supabase = createServiceRoleClient();
    const body = await request.json().catch(() => ({}));

    switch (type) {
      case 'registration_confirmed':
        return await handleRegistrationConfirmed(supabase, body);
      case 'event_schedule_changed':
        return await handleEventScheduleChanged(supabase, body);
      default:
        return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });
    }
  } catch (error) {
    console.error(`[events/notify/${type}]`, error);
    return NextResponse.json(
      { error: 'Notification failed', details: (error as Error).message },
      { status: 500 }
    );
  }
}

// ─── Helper ─────────────────────────────────────────────────────────────
//
// 2026-06-30: Refactored to delegate to lib/services/_shared/notifications/
// notify.ts (the canonical fanout helper extracted from the duplicate
// per-module createNotification pattern). The legacy `type: 'events'`
// column is preserved via `extraColumns` for inserts that other readers
// still filter on; everything else moves into the canonical envelope.
// Behaviour-preserving wrapper — returns the same `number` callers expect.

async function createNotification(
  supabase: ReturnType<typeof createServiceRoleClient>,
  title: string,
  body: string,
  userIds: string[],
  metadata: Record<string, unknown> = {}
): Promise<number> {
  const outcome = await fanoutNotification(supabase, {
    title,
    body,
    userIds,
    source: 'events_notify',
    metadata,
    // Legacy column preserved for any consumers (e.g.
    // lib/services/events/notification-service.ts) that still filter on
    // notifications.type === 'events'. The shared helper's canonical set
    // doesn't include this column, but the spread allows backward-compat.
    extraColumns: { type: 'events' },
  });
  return outcome.notified;
}

// ─── Handlers ───────────────────────────────────────────────────────────

async function handleRegistrationConfirmed(
  supabase: ReturnType<typeof createServiceRoleClient>,
  body: { registration_id?: string }
) {
  const registrationId = body?.registration_id;
  if (!registrationId) {
    return NextResponse.json({ error: 'Missing registration_id' }, { status: 400 });
  }

  const { data: reg, error } = await supabase
    .from('event_registrations')
    .select('id, user_id, event_id, events!inner(name)')
    .eq('id', registrationId)
    .single();

  if (error || !reg || !(reg as any).user_id) {
    return NextResponse.json({ type: 'registration_confirmed', notified: 0 });
  }

  const eventName = (reg as any).events?.name ?? 'the event';
  const count = await createNotification(
    supabase,
    'Registration confirmed',
    `Your spot for ${eventName} is locked in. See you there!`,
    [(reg as any).user_id],
    { event_id: (reg as any).event_id, registration_id: registrationId }
  );

  return NextResponse.json({ type: 'registration_confirmed', notified: count });
}

async function handleEventScheduleChanged(
  supabase: ReturnType<typeof createServiceRoleClient>,
  body: { event_id?: string; reason?: string }
) {
  const eventId = body?.event_id;
  if (!eventId) {
    return NextResponse.json({ error: 'Missing event_id' }, { status: 400 });
  }

  const { data: event } = await supabase
    .from('events')
    .select('id, name')
    .eq('id', eventId)
    .single();

  if (!event) {
    return NextResponse.json({ type: 'event_schedule_changed', notified: 0 });
  }

  const { data: regs } = await supabase
    .from('event_registrations')
    .select('user_id')
    .eq('event_id', eventId)
    .in('status', ['registered', 'confirmed', 'checked_in']);

  const userIds = Array.from(
    new Set(
      (regs || [])
        .map((r: any) => r.user_id)
        .filter(Boolean) as string[]
    )
  );

  const name = (event as any).name || 'your event';
  const reasonSuffix = body?.reason ? ` Reason: ${body.reason}.` : '';
  const count = await createNotification(
    supabase,
    'Event schedule updated',
    `The schedule for ${name} has been updated — please check the event page for new date and time.${reasonSuffix}`,
    userIds,
    { event_id: eventId, reason: body?.reason }
  );

  return NextResponse.json({ type: 'event_schedule_changed', notified: count });
}
