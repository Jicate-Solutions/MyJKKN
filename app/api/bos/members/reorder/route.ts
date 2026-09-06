// app/api/bos/members/reorder/route.ts
//
// POST /api/bos/members/reorder
// Persists the display order of a composition's roster into
// bos_members.sort_order.
//
// WHY sort_order IS THE GLOBAL RANK OF THE WHOLE COMPOSITION
//   The roster is rendered committee → member-type group → member, but a
//   meeting notice, minutes table or attendance sheet reads bos_members with a
//   flat `.order('sort_order')`. If each group were numbered 1..n
//   independently, those flat consumers would interleave groups. So the client
//   sends the FULL ordered id list exactly as it renders it, and this route
//   writes 1..n across the composition — "what you see on the roster is the
//   order every report prints".
//
// Body: { composition_id: string, ordered_ids: string[] }
//
// Authorization is the shared roster gate (chairman / creator / principal for
// council bodies / super-admin).

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { guardRosterWrite } from '@/lib/utils/bos/roster-write-guard';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as {
      composition_id?: string;
      ordered_ids?: string[];
    };
    const compositionId = body.composition_id;
    const orderedIds = (body.ordered_ids ?? []).filter(
      (id): id is string => typeof id === 'string' && id.length > 0,
    );

    if (!compositionId || orderedIds.length === 0) {
      return NextResponse.json(
        { error: 'composition_id and a non-empty ordered_ids array are required' },
        { status: 400 },
      );
    }

    const gate = await guardRosterWrite(supabase, user.id, compositionId);
    if (gate.deny) {
      return NextResponse.json({ error: gate.deny.error }, { status: gate.deny.status });
    }

    // Only ids that actually belong to this composition may be renumbered —
    // this is the tamper guard, so a forged list can't touch another roster.
    const readDb = createServiceRoleClient();
    const { data: ownRows, error: ownErr } = await readDb
      .from('bos_members')
      .select('id, sort_order')
      .eq('composition_id', compositionId);
    if (ownErr) throw ownErr;

    const currentById = new Map(
      (ownRows ?? []).map((r) => [
        (r as { id: string }).id,
        (r as { sort_order: number | null }).sort_order ?? 0,
      ]),
    );
    const targets = orderedIds.filter((id) => currentById.has(id));
    if (targets.length === 0) {
      return NextResponse.json(
        { error: 'None of the supplied members belong to this composition' },
        { status: 400 },
      );
    }

    const writeDb =
      gate.isCouncil || gate.isSuperAdmin ? createServiceRoleClient() : supabase;

    // 1-based: sort_order 0 stays the "never ordered" default, so a roster that
    // has been arranged always sorts ahead of one that hasn't been touched.
    const now = new Date().toISOString();
    const dirty = targets
      .map((id, idx) => ({ id, next: idx + 1 }))
      .filter(({ id, next }) => currentById.get(id) !== next);

    // Parallel batches. A single arrow-click swaps two rows, but the FIRST
    // reorder of a roster renumbers every member (they all start at 0) — that
    // was 30+ sequential round trips before batching. The cap keeps a large
    // council from opening dozens of pooler connections at once.
    const WRITE_CONCURRENCY = 8;
    let updated = 0;
    let denied = false;

    for (let i = 0; i < dirty.length && !denied; i += WRITE_CONCURRENCY) {
      const batch = dirty.slice(i, i + WRITE_CONCURRENCY);
      const results = await Promise.all(
        batch.map(async ({ id, next }) => {
          const { data: rows, error } = await writeDb
            .from('bos_members')
            .update({ sort_order: next, updated_at: now })
            .eq('id', id)
            .eq('composition_id', compositionId)
            .select('id');
          if (error) throw error;
          // An RLS-denied UPDATE returns zero rows and no error.
          return (rows?.length ?? 0) > 0;
        })
      );
      for (const ok of results) {
        if (ok) updated += 1;
        else denied = true;
      }
    }

    if (denied) {
      return NextResponse.json(
        {
          error:
            'Not permitted to reorder this roster. Only the board chairman (or the composition creator) can change member order.',
        },
        { status: 403 },
      );
    }

    // The writes above set sort_order only. group_position (the per-group 1,2,3
    // shown on the card) has to be rebuilt from the new arrangement — and the
    // function also recompacts sort_order if the client sent a partial roster.
    const { error: renumberErr } = await createServiceRoleClient().rpc(
      'bos_renumber_member_order',
      { p_composition_id: compositionId },
    );
    if (renumberErr) {
      console.warn('[bos/members/reorder] renumber failed:', renumberErr);
    }

    return NextResponse.json({ updated, total: targets.length });
  } catch (error) {
    console.error('[bos/members/reorder] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to save member order' },
      { status: 500 },
    );
  }
}
