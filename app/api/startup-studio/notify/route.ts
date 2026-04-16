export const dynamic = 'force-dynamic';

// app/api/startup-studio/notify/route.ts
// Server route for dispatching Startup Studio in-app notifications.
// Auth: x-api-key (same pattern as /api/work-pulse/notify).
// Handles 4 integration events:
//   team_selected         — SF100 team selection → notify all invited members
//   evaluation_round_open — judging round opens → notify assigned judges
//   vote_cast_received    — vote cast → notify the team being voted on
//   demo_day_reminder     — 24h pre-demo → notify all presenters + judges

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { StartupStudioEventType } from '@/types/startup-studio';

const VALID_API_KEY = process.env.STARTUP_STUDIO_API_KEY;

export async function POST(request: NextRequest) {
  await connection();

  // Auth: x-api-key only (cron / server-side callers)
  const apiKey = request.headers.get('x-api-key');
  if (!VALID_API_KEY || apiKey !== VALID_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const type = searchParams.get('type') as StartupStudioEventType | null;

  if (!type) {
    return NextResponse.json({ error: 'Missing ?type= parameter' }, { status: 400 });
  }

  try {
    const supabase = createServiceRoleClient();

    switch (type) {
      case 'team_selected':
        return await handleTeamSelected(supabase, request);
      case 'evaluation_round_open':
        return await handleEvaluationRoundOpen(supabase, request);
      case 'vote_cast_received':
        return await handleVoteCastReceived(supabase, request);
      case 'demo_day_reminder':
        return await handleDemoDayReminder(supabase, request);
      default:
        return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });
    }
  } catch (error) {
    console.error(`[startup-studio/notify/${type}]`, error);
    return NextResponse.json(
      { error: 'Notification failed', details: (error as Error).message },
      { status: 500 }
    );
  }
}

// ── Dispatch Helper (verbatim from work-pulse pattern) ──────────────────────

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
      type: 'startup_studio',
      title,
      message,
      metadata: { source: 'startup_studio_notify', ...metadata },
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

// ── Event Handlers ──────────────────────────────────────────────────────────

/**
 * team_selected — notify all invited team members when a team is enrolled.
 * Body: { registration_id: string }
 */
async function handleTeamSelected(
  supabase: ReturnType<typeof createServiceRoleClient>,
  request: NextRequest
) {
  const body = await request.json().catch(() => ({}));
  const { registration_id } = body as { registration_id?: string };

  if (!registration_id) {
    return NextResponse.json({ error: 'Missing registration_id in body' }, { status: 400 });
  }

  // Get the event_team_members whose status is 'accepted' or 'pending'
  // and map to profile_ids with auth user accounts
  const { data: members, error } = await supabase
    .from('event_team_members')
    .select('profile_id, full_name, email')
    .eq('registration_id', registration_id)
    .not('profile_id', 'is', null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Resolve profile_id → auth user_id via profiles table
  const profileIds = (members || [])
    .map((m: { profile_id: string | null }) => m.profile_id)
    .filter(Boolean) as string[];

  if (profileIds.length === 0) {
    return NextResponse.json({ type: 'team_selected', notified: 0 });
  }

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id')
    .in('id', profileIds);

  const userIds = (profiles || []).map((p: { id: string }) => p.id);

  // Fetch team name for the message
  const { data: registration } = await supabase
    .from('event_registrations')
    .select('team_name, event:startup_events(name)')
    .eq('id', registration_id)
    .single();

  const teamName = registration?.team_name ?? 'your team';
  const eventName = (registration?.event as { name?: string } | null)?.name ?? 'the event';

  const count = await createNotification(
    supabase,
    'You have been selected for a team!',
    `You are now part of "${teamName}" for "${eventName}". Head to Startup Studio to get started.`,
    userIds,
    {
      event_type: 'team_selected' as StartupStudioEventType,
      registration_id,
    }
  );

  return NextResponse.json({ type: 'team_selected', notified: count });
}

/**
 * evaluation_round_open — notify assigned judges when a judging round opens.
 * Body: { event_id: string, round_label?: string }
 */
async function handleEvaluationRoundOpen(
  supabase: ReturnType<typeof createServiceRoleClient>,
  request: NextRequest
) {
  const body = await request.json().catch(() => ({}));
  const { event_id, round_label } = body as { event_id?: string; round_label?: string };

  if (!event_id) {
    return NextResponse.json({ error: 'Missing event_id in body' }, { status: 400 });
  }

  // Judges are stored as event_staff_assignments with role='judge' or 'evaluator'
  const { data: assignments, error } = await supabase
    .from('event_staff_assignments')
    .select('staff_id')
    .eq('event_id', event_id)
    .in('role', ['judge', 'evaluator', 'panel_chair']);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const staffIds = [
    ...new Set((assignments || []).map((a: { staff_id: string }) => a.staff_id)),
  ];

  if (staffIds.length === 0) {
    return NextResponse.json({ type: 'evaluation_round_open', notified: 0 });
  }

  // staff_id is profiles.id in this system
  const label = round_label ?? 'Evaluation Round';

  const count = await createNotification(
    supabase,
    `${label} is now open`,
    `The ${label.toLowerCase()} for your assigned event is now open. Please log in to Startup Studio to begin evaluating teams.`,
    staffIds,
    {
      event_type: 'evaluation_round_open' as StartupStudioEventType,
      event_id,
      round_label: label,
    }
  );

  return NextResponse.json({ type: 'evaluation_round_open', notified: count });
}

/**
 * vote_cast_received — notify the team being voted on when an audience vote arrives.
 * Body: { event_id: string, registration_id: string, voter_profile_id: string }
 */
async function handleVoteCastReceived(
  supabase: ReturnType<typeof createServiceRoleClient>,
  request: NextRequest
) {
  const body = await request.json().catch(() => ({}));
  const { event_id, registration_id, voter_profile_id } = body as {
    event_id?: string;
    registration_id?: string;
    voter_profile_id?: string;
  };

  if (!event_id || !registration_id) {
    return NextResponse.json(
      { error: 'Missing event_id or registration_id in body' },
      { status: 400 }
    );
  }

  // Notify the team owner (leader)
  const { data: registration, error } = await supabase
    .from('event_registrations')
    .select('owner_id, team_name')
    .eq('id', registration_id)
    .single();

  if (error || !registration) {
    return NextResponse.json({ error: 'Registration not found' }, { status: 404 });
  }

  const userIds = [registration.owner_id];

  const count = await createNotification(
    supabase,
    'Your team received a vote!',
    `Someone just voted for "${registration.team_name}". Keep up the great work!`,
    userIds,
    {
      event_type: 'vote_cast_received' as StartupStudioEventType,
      event_id,
      registration_id,
      voter_profile_id: voter_profile_id ?? null,
    }
  );

  return NextResponse.json({ type: 'vote_cast_received', notified: count });
}

/**
 * demo_day_reminder — 24h before demo day, notify all presenters + judges.
 * Body: { event_id: string }
 */
async function handleDemoDayReminder(
  supabase: ReturnType<typeof createServiceRoleClient>,
  request: NextRequest
) {
  const body = await request.json().catch(() => ({}));
  const { event_id } = body as { event_id?: string };

  if (!event_id) {
    return NextResponse.json({ error: 'Missing event_id in body' }, { status: 400 });
  }

  // Fetch event info for the demo date
  const { data: event, error: eventError } = await supabase
    .from('startup_events')
    .select('name, demo_date')
    .eq('id', event_id)
    .single();

  if (eventError || !event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const demoDayLabel = event.demo_date
    ? new Date(event.demo_date).toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : 'tomorrow';

  // ── Collect presenters (team owners with demo-day allocations) ──────────
  const { data: demoAllocations, error: allocError } = await supabase
    .from('event_team_venue_allocations')
    .select('registration:event_registrations(owner_id)')
    .eq('event_id', event_id)
    .eq('day_type', 'demo_day');

  if (allocError) {
    return NextResponse.json({ error: allocError.message }, { status: 500 });
  }

  const presenterIds = [
    ...new Set(
      (demoAllocations || [])
        .map((a: { registration: { owner_id: string } | null }) => a.registration?.owner_id)
        .filter(Boolean) as string[]
    ),
  ];

  // ── Collect judges assigned to demo-day venues ──────────────────────────
  const { data: judgeAssignments } = await supabase
    .from('event_staff_assignments')
    .select('staff_id')
    .eq('event_id', event_id)
    .eq('day_type', 'demo_day')
    .in('role', ['judge', 'evaluator', 'panel_chair']);

  const judgeIds = [
    ...new Set(
      (judgeAssignments || []).map((a: { staff_id: string }) => a.staff_id)
    ),
  ];

  // ── Merge unique user IDs ────────────────────────────────────────────────
  const allUserIds = [...new Set([...presenterIds, ...judgeIds])];

  const count = await createNotification(
    supabase,
    `Demo Day Tomorrow — ${event.name}`,
    `Reminder: Demo Day for "${event.name}" is on ${demoDayLabel}. Make sure your app is live and your demo is ready!`,
    allUserIds,
    {
      event_type: 'demo_day_reminder' as StartupStudioEventType,
      event_id,
      demo_day_date: event.demo_date ?? null,
    }
  );

  return NextResponse.json({
    type: 'demo_day_reminder',
    notified: count,
    presenters: presenterIds.length,
    judges: judgeIds.length,
  });
}
