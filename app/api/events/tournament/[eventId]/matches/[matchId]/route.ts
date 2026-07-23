export const dynamic = 'force-dynamic';

// PATCH /api/events/tournament/[eventId]/matches/[matchId]
// Schedule a match: time + optional venue/court + optional official. Creates an
// event_session (+ a resource_reservation when a court is chosen, + an
// event_human_role when an official is named) and links them on the match.
// Returns a non-blocking `clash` warning when a competing side is double-booked
// at an overlapping time (Director decision #14: warn, don't block).
// Requires sports.tournaments.manage.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { canManageTournament } from '@/lib/services/events/tournament/organizer-access';
import type { ScheduleMatchDto } from '@/types/tournament';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; matchId: string }> }
) {
  try {
    const { eventId, matchId } = await params;

    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    // manage permission OR per-event in-charge (Tournament In-charge, 2026-07)
    const canManage = await canManageTournament(auth, eventId);
    if (canManage !== true) {
      return NextResponse.json({ error: 'Forbidden — sports.tournaments.manage required' }, { status: 403 });
    }

    const dto = (await request.json().catch(() => ({}))) as ScheduleMatchDto;
    if (!dto.scheduled_at) {
      return NextResponse.json({ error: 'scheduled_at is required' }, { status: 400 });
    }
    const start = new Date(dto.scheduled_at);
    if (Number.isNaN(start.getTime())) {
      return NextResponse.json({ error: 'invalid scheduled_at' }, { status: 400 });
    }
    const durationMin = dto.duration_minutes && dto.duration_minutes > 0 ? dto.duration_minutes : 60;
    const end = new Date(start.getTime() + durationMin * 60_000);

    const svc = createServiceRoleClient();

    const { data: match, error: mErr } = await (svc as any)
      .from('tournament_matches')
      .select('id, event_id, division_id, side_a_entry_id, side_b_entry_id')
      .eq('id', matchId)
      .eq('event_id', eventId)
      .single();
    if (mErr || !match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });

    // ---- clash check (non-blocking): a side already in a match at an overlapping time ----
    const sides = [match.side_a_entry_id, match.side_b_entry_id].filter(Boolean) as string[];
    let clash: { match_id: string; entry_id: string; scheduled_at: string }[] = [];
    if (sides.length) {
      const winMs = durationMin * 60_000;
      const lo = new Date(start.getTime() - winMs).toISOString();
      const hi = new Date(end.getTime() + winMs).toISOString();
      const { data: others } = await (svc as any)
        .from('tournament_matches')
        .select('id, scheduled_at, side_a_entry_id, side_b_entry_id')
        .eq('event_id', eventId)
        .neq('id', matchId)
        .not('scheduled_at', 'is', null)
        .gte('scheduled_at', lo)
        .lte('scheduled_at', hi);
      for (const o of others ?? []) {
        for (const s of sides) {
          if (o.side_a_entry_id === s || o.side_b_entry_id === s) {
            clash.push({ match_id: o.id, entry_id: s, scheduled_at: o.scheduled_at });
          }
        }
      }
    }

    // ---- 1. event_session (per-match scheduling) ----
    const { data: session, error: sErr } = await (svc as any)
      .from('event_sessions')
      .insert({
        event_id: eventId,
        title: 'Tournament match',
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        venue_resource_id: dto.resource_id ?? null,
        venue_text: dto.venue_text ?? null,
        status: 'scheduled',
        created_by: user.id,
      })
      .select('id')
      .single();
    if (sErr || !session) {
      return NextResponse.json({ error: sErr?.message || 'Failed to create session' }, { status: 500 });
    }

    // ---- 2. resource_reservation (court booking) when a court is chosen ----
    let reservationId: string | null = null;
    if (dto.resource_id) {
      const { data: rsv, error: rErr } = await (svc as any)
        .from('resource_reservations')
        .insert({
          resource_id: dto.resource_id,
          user_id: user.id,
          purpose: 'Tournament match',
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          status: 'approved', // organizer self-books the venue they run
          event_id: eventId,
          session_id: session.id,
          session_label: 'Tournament match',
          approved_by: user.id,
        })
        .select('id')
        .single();
      if (!rErr && rsv) reservationId = rsv.id;
    }

    // ---- 3. official (event_human_role) when named ----
    let officialRoleId: string | null = null;
    if (dto.official_name?.trim()) {
      const { data: hr } = await (svc as any)
        .from('event_human_roles')
        .insert({
          event_id: eventId,
          role_type: 'official',
          external_contact: { name: dto.official_name.trim() },
          assignment_status: 'assigned',
          assigned_by: user.id,
        })
        .select('id')
        .single();
      if (hr) officialRoleId = hr.id;
    }

    // ---- 4. update the match ----
    const { data: updated, error: uErr } = await (svc as any)
      .from('tournament_matches')
      .update({
        scheduled_at: start.toISOString(),
        session_id: session.id,
        resource_reservation_id: reservationId,
        official_human_role_id: officialRoleId,
        status: 'scheduled',
      })
      .eq('id', matchId)
      .select('*')
      .single();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });

    return NextResponse.json({
      match: updated,
      clash: clash.length ? clash : null,
      warning: clash.length ? 'A competing side is already booked at an overlapping time.' : null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to schedule match' },
      { status: 500 }
    );
  }
}
