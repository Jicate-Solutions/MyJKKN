// GET  /api/events/tournament/[eventId]/heats  — every heat of the tournament with its athletes.
// POST /api/events/tournament/[eventId]/heats  — { action: 'generate' | 'add_heat' | 'finalize', division_id, ... }
//
// Heats are the group-fixture alternative to 1-vs-1 matches for athletics-style
// divisions (format = 'heats'). Writes go through the user's SESSION client so
// RLS (manage permission OR per-event in-charge) is the gate; the route-level
// canManageTournament check just gives a clean 403 first.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  canManageTournament,
  canViewTournament,
} from '@/lib/services/events/tournament/organizer-access';
import { HIGHER_IS_BETTER_SPORTS } from '@/types/tournament';

type Params = { params: Promise<{ eventId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { eventId } = await params;
    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    if ((await canViewTournament(auth, eventId)) !== true) {
      return NextResponse.json({ error: 'Forbidden — sports tournament access only' }, { status: 403 });
    }

    const svc = createServiceRoleClient();
    const { data, error } = await (svc as any)
      .from('tournament_heats')
      .select(`
        *,
        athletes:tournament_heat_entries (
          id, heat_id, entry_id, lane_no, position, mark, mark_value, result_status,
          entry:tournament_entries ( entry_name, institution_name )
        )
      `)
      .eq('event_id', eventId)
      .order('division_id', { ascending: true })
      .order('heat_no', { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const heats = (data ?? []).map((h: any) => ({
      ...h,
      athletes: (h.athletes ?? [])
        .map((a: any) => ({
          ...a,
          entry_name: a.entry?.entry_name ?? null,
          institution_name: a.entry?.institution_name ?? null,
          entry: undefined,
        }))
        .sort((a: any, b: any) => (a.lane_no ?? 999) - (b.lane_no ?? 999)),
    }));
    return NextResponse.json({ heats });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load heats' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { eventId } = await params;
    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    if ((await canManageTournament(auth, eventId)) !== true) {
      return NextResponse.json({ error: 'Forbidden — sports.tournaments.manage required' }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      action?: 'generate' | 'add_heat' | 'finalize';
      division_id?: string;
      heat_size?: number;
      regenerate?: boolean;
    };
    if (!body.division_id) {
      return NextResponse.json({ error: 'division_id is required' }, { status: 400 });
    }

    // The division must belong to this tournament and be a heats division.
    const { data: division } = await auth
      .from('tournament_divisions')
      .select('id, sport, format')
      .eq('id', body.division_id)
      .eq('event_id', eventId)
      .maybeSingle();
    if (!division) {
      return NextResponse.json({ error: 'Division not found for this tournament' }, { status: 404 });
    }
    if ((division as any).format !== 'heats') {
      return NextResponse.json({ error: 'This division is not set to the Heats format' }, { status: 422 });
    }
    const divisionId = body.division_id;

    // ── finalize: rank + final_rank + top-3 achievements ───────────────────
    if (body.action === 'finalize') {
      const higher = HIGHER_IS_BETTER_SPORTS.includes((division as any).sport);
      const { data, error } = await auth.rpc('fn_finalize_heats', {
        p_division_id: divisionId,
        p_higher_better: higher,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 422 });
      return NextResponse.json({ achievements_written: data ?? 0 });
    }

    const { data: existing } = await auth
      .from('tournament_heats')
      .select('id, heat_no')
      .eq('division_id', divisionId)
      .order('heat_no', { ascending: false });
    const existingHeats = (existing ?? []) as { id: string; heat_no: number }[];

    // ── add_heat: empty heat for fully manual building ─────────────────────
    if (body.action === 'add_heat') {
      const nextNo = (existingHeats[0]?.heat_no ?? 0) + 1;
      const { error } = await auth.from('tournament_heats').insert({
        event_id: eventId,
        division_id: divisionId,
        heat_no: nextNo,
        label: `Heat ${nextNo}`,
      } as never);
      if (error) return NextResponse.json({ error: error.message }, { status: 422 });
      return NextResponse.json({ heats_created: 1 });
    }

    // ── generate: split active entries into heats of `heat_size` ───────────
    const heatSize = Math.floor(Number(body.heat_size));
    if (!Number.isFinite(heatSize) || heatSize < 1 || heatSize > 100) {
      return NextResponse.json({ error: 'heat_size must be a number between 1 and 100' }, { status: 400 });
    }
    if (existingHeats.length > 0) {
      if (!body.regenerate) {
        return NextResponse.json(
          { error: 'Heats already exist for this division (regenerate to rebuild)' },
          { status: 422 },
        );
      }
      const { error: delErr } = await auth.from('tournament_heats').delete().eq('division_id', divisionId);
      if (delErr) return NextResponse.json({ error: delErr.message }, { status: 422 });
    }

    const { data: entries, error: entErr } = await auth
      .from('tournament_entries')
      .select('id')
      .eq('division_id', divisionId)
      .in('status', ['registered', 'confirmed'])
      .order('seed', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });
    if (entErr) return NextResponse.json({ error: entErr.message }, { status: 422 });
    const ids = ((entries ?? []) as { id: string }[]).map((e) => e.id);
    if (ids.length < 1) {
      return NextResponse.json({ error: 'No active entries to place in heats' }, { status: 422 });
    }

    // Balanced split: 23 athletes at size 10 → 3 heats of 8/8/7, not 10/10/3.
    const heatCount = Math.ceil(ids.length / heatSize);
    const base = Math.floor(ids.length / heatCount);
    const extra = ids.length % heatCount;

    const { data: created, error: heatErr } = await auth
      .from('tournament_heats')
      .insert(
        Array.from({ length: heatCount }, (_, i) => ({
          event_id: eventId,
          division_id: divisionId,
          heat_no: i + 1,
          label: `Heat ${i + 1}`,
        })) as never,
      )
      .select('id, heat_no');
    if (heatErr) return NextResponse.json({ error: heatErr.message }, { status: 422 });

    const heatIdByNo = new Map(((created ?? []) as any[]).map((h) => [h.heat_no as number, h.id as string]));
    const rows: Record<string, unknown>[] = [];
    let cursor = 0;
    for (let h = 1; h <= heatCount; h++) {
      const size = base + (h <= extra ? 1 : 0);
      for (let lane = 1; lane <= size; lane++) {
        rows.push({
          heat_id: heatIdByNo.get(h),
          event_id: eventId,
          division_id: divisionId,
          entry_id: ids[cursor++],
          lane_no: lane,
        });
      }
    }
    const { error: rowErr } = await auth.from('tournament_heat_entries').insert(rows as never);
    if (rowErr) return NextResponse.json({ error: rowErr.message }, { status: 422 });

    return NextResponse.json({ heats_created: heatCount });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update heats' },
      { status: 500 },
    );
  }
}
