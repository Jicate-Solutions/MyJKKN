export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  UUID_RE,
  loadItemSourceCounts,
  loadSources,
  sourceGate,
} from './_shared';
import {
  DELETE_REFUSED_MESSAGE,
  isInvalid,
  sortSources,
  unrecordedCount,
  validateNewSource,
  withCounts,
} from '@/lib/services/onemark/sources-service';

// OneMark — the question-source list.
//
// GET    /api/foundation/onemark/sources            -> every source, in house order
// GET    /api/foundation/onemark/sources?counts=1   -> ... with per-source question counts
// POST   /api/foundation/onemark/sources            -> { label, description?, sort_order? }
// DELETE /api/foundation/onemark/sources            -> 405, always
//
// READ is open to every signed-in person, because a learner picking which
// sources to practise needs the list (Director ruling (c) of 2026-09-06). WRITE
// is `foundation.items.manage` — any question author, by ruling (b); the Wave 1
// RLS policy already says exactly that, so no policy changed for this lane.
//
// DELETE IS REFUSED, ALWAYS, and by two walls. `fp_items.source_key` is
// ON DELETE SET NULL: removing a source would silently blank the origin
// recorded on every question that came from it. This 405 is the first wall;
// Lane S3's BEFORE DELETE trigger is the second, for anything that reaches the
// table another way.

export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const gate = await sourceGate(supabase);
    if (!gate) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const wantCounts = request.nextUrl.searchParams.get('counts') === '1';
    const examId = request.nextUrl.searchParams.get('exam');
    if (examId && !UUID_RE.test(examId)) {
      return NextResponse.json({ error: 'exam must be a uuid' }, { status: 400 });
    }

    const sources = await loadSources(supabase);

    // Counts read the question bank, which is gated to item managers. A learner
    // asking for counts gets the list without them rather than a 403 — the list
    // is the part they are entitled to and the part they came for.
    if (!wantCounts || !gate.canManage) {
      return NextResponse.json({ sources: sortSources(sources), can_manage: gate.canManage });
    }

    const items = await loadItemSourceCounts(supabase, examId ?? undefined);
    return NextResponse.json({
      sources: withCounts(sources, items),
      unrecorded: unrecordedCount(items),
      can_manage: true,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'The source list could not be read.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const gate = await sourceGate(supabase);
    if (!gate) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!gate.canManage) {
      return NextResponse.json(
        { error: 'Only a question author can add a question source.' },
        { status: 403 },
      );
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Send a JSON body.' }, { status: 400 });
    }

    // Retired rows count as taken: their key still sits on their questions, so
    // the fix for "I want that name back" is to switch the old row on again.
    const existing = await loadSources(supabase);
    const checked = validateNewSource(body, existing.map((s) => s.key));
    if (isInvalid(checked)) return NextResponse.json({ error: checked.error }, { status: 400 });

    const { data, error } = await supabase
      .from('onemark_item_sources')
      .insert({ ...checked.value, updated_by: gate.userId, change_reason: 'Added from the OneMark sources screen' })
      .select('key, label, description, is_system, is_active, sort_order, updated_at')
      .single();

    if (error) {
      // 23505 = somebody else created the same key between the read and the
      // write. Say what happened rather than showing a database string.
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Somebody just added a source with that name. Reload the list.' },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ source: data }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'The source could not be added.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  await connection();
  return NextResponse.json({ error: DELETE_REFUSED_MESSAGE }, { status: 405 });
}
