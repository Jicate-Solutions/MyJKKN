// PATCH  /api/events/tournament/[eventId]/heats/[heatId]
//   { scheduled_at?, venue_text?, add_entry_ids?, remove_entry_ids?, results? }
//   - add_entry_ids    manual add; an entry already in another heat of the division is MOVED
//   - remove_entry_ids take athletes out of the heat (back to the unassigned pool)
//   - results          [{ heat_entry_id, position, mark, mark_value, result_status }]
// DELETE /api/events/tournament/[eventId]/heats/[heatId]  — drops the heat (its athletes become unassigned)
//
// Session client throughout: RLS (manage permission OR per-event in-charge) is the real gate.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canManageTournament } from '@/lib/services/events/tournament/organizer-access';

type Params = { params: Promise<{ eventId: string; heatId: string }> };

interface ResultRow {
  heat_entry_id: string;
  position?: number | null;
  mark?: string | null;
  mark_value?: number | null;
  result_status?: 'ok' | 'dns' | 'dnf' | 'dq';
}

async function authorize(eventId: string, heatId: string) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) } as const;
  if ((await canManageTournament(auth, eventId)) !== true) {
    return {
      error: NextResponse.json({ error: 'Forbidden — sports.tournaments.manage required' }, { status: 403 }),
    } as const;
  }
  const { data: heat } = await auth
    .from('tournament_heats')
    .select('id, division_id')
    .eq('id', heatId)
    .eq('event_id', eventId)
    .maybeSingle();
  if (!heat) {
    return { error: NextResponse.json({ error: 'Heat not found for this tournament' }, { status: 404 }) } as const;
  }
  return { auth, heat: heat as { id: string; division_id: string } } as const;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { eventId, heatId } = await params;
    const ctx = await authorize(eventId, heatId);
    if ('error' in ctx) return ctx.error;
    const { auth, heat } = ctx;

    const body = (await request.json().catch(() => ({}))) as {
      scheduled_at?: string | null;
      venue_text?: string | null;
      add_entry_ids?: string[];
      remove_entry_ids?: string[];
      results?: ResultRow[];
    };

    // schedule / venue
    const patch: Record<string, unknown> = {};
    if (body.scheduled_at !== undefined) {
      patch.scheduled_at = body.scheduled_at;
      if (body.scheduled_at) patch.status = 'scheduled';
    }
    if (body.venue_text !== undefined) patch.venue_text = body.venue_text?.trim() || null;
    if (Object.keys(patch).length > 0) {
      const { error } = await auth.from('tournament_heats').update(patch as never).eq('id', heatId);
      if (error) return NextResponse.json({ error: error.message }, { status: 422 });
    }

    // remove athletes
    if (body.remove_entry_ids?.length) {
      const { error } = await auth
        .from('tournament_heat_entries')
        .delete()
        .eq('heat_id', heatId)
        .in('entry_id', body.remove_entry_ids);
      if (error) return NextResponse.json({ error: error.message }, { status: 422 });
    }

    // add / move athletes
    if (body.add_entry_ids?.length) {
      // Only entries of this division may be placed here.
      const { data: valid } = await auth
        .from('tournament_entries')
        .select('id')
        .eq('division_id', heat.division_id)
        .in('status', ['registered', 'confirmed'])
        .in('id', body.add_entry_ids);
      const validIds = ((valid ?? []) as { id: string }[]).map((v) => v.id);
      if (validIds.length !== new Set(body.add_entry_ids).size) {
        return NextResponse.json(
          { error: 'Some athletes are not active entries of this division' },
          { status: 422 },
        );
      }
      // Unique (division, entry): clear any previous placement first = move.
      const { error: moveErr } = await auth
        .from('tournament_heat_entries')
        .delete()
        .eq('division_id', heat.division_id)
        .in('entry_id', validIds);
      if (moveErr) return NextResponse.json({ error: moveErr.message }, { status: 422 });

      const { data: current } = await auth
        .from('tournament_heat_entries')
        .select('lane_no')
        .eq('heat_id', heatId);
      let lane = Math.max(0, ...((current ?? []) as { lane_no: number | null }[]).map((c) => c.lane_no ?? 0));
      const { error } = await auth.from('tournament_heat_entries').insert(
        validIds.map((entry_id) => ({
          heat_id: heatId,
          event_id: eventId,
          division_id: heat.division_id,
          entry_id,
          lane_no: ++lane,
        })) as never,
      );
      if (error) return NextResponse.json({ error: error.message }, { status: 422 });
    }

    // results
    if (body.results?.length) {
      for (const r of body.results) {
        const { error } = await auth
          .from('tournament_heat_entries')
          .update({
            position: r.position ?? null,
            mark: r.mark?.trim() || null,
            mark_value: r.mark_value ?? null,
            result_status: r.result_status ?? 'ok',
          } as never)
          .eq('id', r.heat_entry_id)
          .eq('heat_id', heatId);
        if (error) return NextResponse.json({ error: error.message }, { status: 422 });
      }
      const { error } = await auth
        .from('tournament_heats')
        .update({ status: 'completed' } as never)
        .eq('id', heatId);
      if (error) return NextResponse.json({ error: error.message }, { status: 422 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update heat' },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { eventId, heatId } = await params;
    const ctx = await authorize(eventId, heatId);
    if ('error' in ctx) return ctx.error;
    const { error } = await ctx.auth.from('tournament_heats').delete().eq('id', heatId);
    if (error) return NextResponse.json({ error: error.message }, { status: 422 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete heat' },
      { status: 500 },
    );
  }
}
