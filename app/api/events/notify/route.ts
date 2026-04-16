export const dynamic = 'force-dynamic';

// POST /api/events/notify?type=<EventsEventType>
//
// Cron-pollable server route for Events in-app notifications.
// Mirrors the work-pulse pattern exactly:
//   — x-api-key auth only (no session needed)
//   — ?type= switch dispatches the correct handler
//   — reminder handlers self-query upcoming events (cron-ready)
//
// Vercel cron wiring (add to vercel.json when ready):
//   { "path": "/api/events/notify?type=event_reminder_24h", "schedule": "0 3 * * *" }
//   { "path": "/api/events/notify?type=event_reminder_1h",  "schedule": "0 2 * * *" }
//
// Event-driven types (called with JSON body):
//   registration_confirmed  — POST with { event_id, registration_id }
//   event_schedule_changed  — POST with { event_id, changed_fields }
//   registration_cancelled  — POST with { event_id, registration_id }

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { EventsNotificationService } from '@/lib/services/events/notification-service';
import type { EventsEventType } from '@/types/events-notifications';

const VALID_API_KEY = process.env.EVENTS_NOTIFY_API_KEY;

// Reuse shared helper (identical shape to work-pulse)
async function createNotification(
  supabase: ReturnType<typeof createServiceRoleClient>,
  title: string,
  message: string,
  userIds: string[],
  metadata: Record<string, unknown> = {}
): Promise<number> {
  if (userIds.length === 0) return 0;

  const { data: notification } = await supabase
    .from('notifications')
    .insert({
      type: 'events',
      title,
      message,
      metadata: { source: 'events_notify', ...metadata },
    })
    .select('id')
    .single();

  if (!notification) return 0;

  const links = userIds.map((uid) => ({
    notification_id: notification.id,
    user_id: uid,
  }));

  await supabase.from('user_notifications').insert(links);
  return userIds.length;
}

// ─── Route ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  await connection();

  // Auth: x-api-key only (cron / server-to-server)
  const apiKey = request.headers.get('x-api-key');
  if (!VALID_API_KEY || apiKey !== VALID_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const type = searchParams.get('type') as EventsEventType | null;

  if (!type) {
    return NextResponse.json({ error: 'Missing ?type= parameter' }, { status: 400 });
  }

  try {
    const supabase = createServiceRoleClient();

    switch (type) {
      // ── Cron-pollable handlers ────────────────────────────────────────────

      case 'event_reminder_24h':
        return await handleReminder24h(supabase);

      case 'event_reminder_1h':
        return await handleReminder1h(supabase);

      // ── Event-driven handlers (require JSON body) ─────────────────────────

      case 'registration_confirmed':
        return await handleRegistrationConfirmed(supabase, request);

      case 'event_schedule_changed':
        return await handleScheduleChanged(supabase, request);

      case 'registration_cancelled':
        return await handleRegistrationCancelled(supabase, request);

      default:
        return NextResponse.json(
          { error: `Unknown type: ${type}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error(`[events/notify/${type}]`, error);
    return NextResponse.json(
      { error: 'Notification failed', details: (error as Error).message },
      { status: 500 }
    );
  }
}

// ─── Cron handler: 24h reminder ─────────────────────────────────────────────
//
// Queries events whose event_date falls between now+23h and now+25h.
// Then finds all registrants with profile_id and notifies them.

async function handleReminder24h(
  supabase: ReturnType<typeof createServiceRoleClient>
) {
  const now = new Date();
  const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000);
  const windowEnd   = new Date(now.getTime() + 25 * 60 * 60 * 1000);

  // Fetch events in the 24h window
  const { data: events, error: eventsError } = await supabase
    .from('events')
    .select('id, name, event_date, start_time, venue')
    .eq('is_active', true)
    .gte('event_date', windowStart.toISOString().split('T')[0])
    .lte('event_date', windowEnd.toISOString().split('T')[0]);

  if (eventsError || !events || events.length === 0) {
    return NextResponse.json({ type: 'event_reminder_24h', notified: 0, events: 0 });
  }

  let totalNotified = 0;

  for (const event of events) {
    const { data: registrations } = await supabase
      .from('events_registrations')
      .select('profile_id')
      .eq('event_id', event.id)
      .not('profile_id', 'is', null)
      .in('status', ['registered', 'confirmed']);

    const userIds = (registrations ?? [])
      .map((r) => r.profile_id as string)
      .filter(Boolean);

    if (userIds.length === 0) continue;

    const count = await EventsNotificationService.notifyReminder24h({
      user_ids: userIds,
      event_name: event.name,
      event_id: event.id,
      event_date: event.event_date,
      start_time: event.start_time,
      venue: event.venue,
    });

    totalNotified += count;
  }

  return NextResponse.json({
    type: 'event_reminder_24h',
    events: events.length,
    notified: totalNotified,
  });
}

// ─── Cron handler: 1h reminder ──────────────────────────────────────────────
//
// Queries events whose event_date is today AND start_time falls 45-75 min from now.

async function handleReminder1h(
  supabase: ReturnType<typeof createServiceRoleClient>
) {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  // Fetch all events happening today
  const { data: events, error: eventsError } = await supabase
    .from('events')
    .select('id, name, event_date, start_time, venue')
    .eq('is_active', true)
    .eq('event_date', todayStr);

  if (eventsError || !events || events.length === 0) {
    return NextResponse.json({ type: 'event_reminder_1h', notified: 0, events: 0 });
  }

  // Filter events whose start_time is 45–75 min from now
  const eligible = events.filter((event) => {
    if (!event.start_time) return false;
    try {
      const [hh, mm] = event.start_time.split(':').map(Number);
      const eventStart = new Date(now);
      eventStart.setHours(hh, mm, 0, 0);
      const diffMin = (eventStart.getTime() - now.getTime()) / 60_000;
      return diffMin >= 45 && diffMin <= 75;
    } catch {
      return false;
    }
  });

  if (eligible.length === 0) {
    return NextResponse.json({ type: 'event_reminder_1h', notified: 0, events: 0 });
  }

  let totalNotified = 0;

  for (const event of eligible) {
    const { data: registrations } = await supabase
      .from('events_registrations')
      .select('profile_id')
      .eq('event_id', event.id)
      .not('profile_id', 'is', null)
      .in('status', ['registered', 'confirmed']);

    const userIds = (registrations ?? [])
      .map((r) => r.profile_id as string)
      .filter(Boolean);

    if (userIds.length === 0) continue;

    const count = await EventsNotificationService.notifyReminder1h({
      user_ids: userIds,
      event_name: event.name,
      event_id: event.id,
      start_time: event.start_time,
      venue: event.venue,
    });

    totalNotified += count;
  }

  return NextResponse.json({
    type: 'event_reminder_1h',
    events: eligible.length,
    notified: totalNotified,
  });
}

// ─── Event-driven: registration_confirmed ───────────────────────────────────
//
// Body: { event_id: string, registration_id: string }

async function handleRegistrationConfirmed(
  supabase: ReturnType<typeof createServiceRoleClient>,
  request: NextRequest
) {
  const body = await request.json().catch(() => ({}));
  const { event_id, registration_id } = body as {
    event_id?: string;
    registration_id?: string;
  };

  if (!event_id || !registration_id) {
    return NextResponse.json(
      { error: 'Missing event_id or registration_id' },
      { status: 400 }
    );
  }

  // Fetch registration + event in parallel
  const [regResult, eventResult] = await Promise.all([
    supabase
      .from('events_registrations')
      .select('id, profile_id, participant_name, bib_number, status, event_id')
      .eq('id', registration_id)
      .eq('event_id', event_id)
      .single(),
    supabase
      .from('events')
      .select('id, name, event_date, start_time, venue')
      .eq('id', event_id)
      .single(),
  ]);

  const registration = regResult.data;
  const event = eventResult.data;

  if (!registration || !event) {
    return NextResponse.json(
      { error: 'Registration or event not found' },
      { status: 404 }
    );
  }

  if (!registration.profile_id) {
    // External participant — no profile to notify
    return NextResponse.json({
      type: 'registration_confirmed',
      notified: 0,
      reason: 'no_profile_id',
    });
  }

  const count = await EventsNotificationService.notifyRegistrationConfirmed({
    user_ids: [registration.profile_id],
    event_name: event.name,
    event_id: event.id,
    registration_id: registration.id,
    bib_number: registration.bib_number,
    event_date: event.event_date,
    venue: event.venue,
  });

  return NextResponse.json({ type: 'registration_confirmed', notified: count });
}

// ─── Event-driven: event_schedule_changed ───────────────────────────────────
//
// Body: { event_id: string, changed_fields?: { event_date?, start_time?, venue?, venue_address? } }
// Notifies ALL active registrants (profile_id present).

async function handleScheduleChanged(
  supabase: ReturnType<typeof createServiceRoleClient>,
  request: NextRequest
) {
  const body = await request.json().catch(() => ({}));
  const { event_id, changed_fields = {} } = body as {
    event_id?: string;
    changed_fields?: {
      event_date?: string;
      start_time?: string;
      venue?: string;
      venue_address?: string;
    };
  };

  if (!event_id) {
    return NextResponse.json({ error: 'Missing event_id' }, { status: 400 });
  }

  // Fetch event details
  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, name, event_date, start_time, venue')
    .eq('id', event_id)
    .single();

  if (eventError || !event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  // All active registrants with a profile
  const { data: registrations } = await supabase
    .from('events_registrations')
    .select('profile_id')
    .eq('event_id', event_id)
    .not('profile_id', 'is', null)
    .in('status', ['registered', 'confirmed', 'checked_in']);

  const userIds = [...new Set(
    (registrations ?? []).map((r) => r.profile_id as string).filter(Boolean)
  )];

  if (userIds.length === 0) {
    return NextResponse.json({ type: 'event_schedule_changed', notified: 0 });
  }

  const count = await EventsNotificationService.notifyScheduleChanged({
    user_ids: userIds,
    event_name: event.name,
    event_id: event.id,
    new_date: changed_fields.event_date ?? null,
    new_time: changed_fields.start_time ?? null,
    new_venue: changed_fields.venue ?? changed_fields.venue_address ?? null,
  });

  return NextResponse.json({ type: 'event_schedule_changed', notified: count });
}

// ─── Event-driven: registration_cancelled ───────────────────────────────────
//
// Body: { event_id: string, registration_id: string, reason?: string }

async function handleRegistrationCancelled(
  supabase: ReturnType<typeof createServiceRoleClient>,
  request: NextRequest
) {
  const body = await request.json().catch(() => ({}));
  const { event_id, registration_id, reason } = body as {
    event_id?: string;
    registration_id?: string;
    reason?: string;
  };

  if (!event_id || !registration_id) {
    return NextResponse.json(
      { error: 'Missing event_id or registration_id' },
      { status: 400 }
    );
  }

  const [regResult, eventResult] = await Promise.all([
    supabase
      .from('events_registrations')
      .select('id, profile_id, participant_name')
      .eq('id', registration_id)
      .eq('event_id', event_id)
      .single(),
    supabase
      .from('events')
      .select('id, name')
      .eq('id', event_id)
      .single(),
  ]);

  const registration = regResult.data;
  const event = eventResult.data;

  if (!registration || !event) {
    return NextResponse.json(
      { error: 'Registration or event not found' },
      { status: 404 }
    );
  }

  if (!registration.profile_id) {
    return NextResponse.json({
      type: 'registration_cancelled',
      notified: 0,
      reason: 'no_profile_id',
    });
  }

  const count = await EventsNotificationService.notifyRegistrationCancelled({
    user_ids: [registration.profile_id],
    event_name: event.name,
    event_id: event.id,
    registration_id: registration.id,
    reason,
  });

  return NextResponse.json({ type: 'registration_cancelled', notified: count });
}
