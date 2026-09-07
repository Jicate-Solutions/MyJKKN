export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  MAP_TABLE,
  TOPICS_TABLE,
  UUID_RE,
  gate,
  loadItemCounts,
  loadMappings,
  loadSubjects,
  loadTopics,
  resolveOneMarkUnit,
} from '../_shared';
import { buildUnitsPayload, reorderPlan } from '@/lib/services/onemark/units-service';

// OneMark units — edit one unit.
//
// PATCH  /api/foundation/onemark/units/[topicId]
//        { display_name?, description?, is_active?, move?: 'up' | 'down' }
// DELETE -> 405, always. See below.
//
// Gate: foundation.items.manage. Every write is fenced by resolveOneMarkUnit,
// which refuses any topic that is not a OneMark unit — see _shared.ts for why
// the taxonomy write is elevated and what stops it reaching a coaching topic.

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ topicId: string }> },
) {
  await connection();
  try {
    const { topicId } = await context.params;
    if (!UUID_RE.test(topicId)) {
      return NextResponse.json({ error: 'topicId must be a uuid' }, { status: 400 });
    }

    const supabase = await createClient();
    const g = await gate(supabase);
    if (!g) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!g.canManage) {
      return NextResponse.json(
        { error: 'You do not have access to manage the OneMark unit list.' },
        { status: 403 },
      );
    }

    const body = (await request.json().catch(() => null)) as {
      display_name?: unknown;
      description?: unknown;
      is_active?: unknown;
      move?: unknown;
      config_key?: unknown;
    } | null;
    if (!body) return NextResponse.json({ error: 'A JSON body is required' }, { status: 400 });

    // A unit's key is immutable after create: fp_items and the seeded
    // references read it, and a rename must not silently repoint them.
    if (body.config_key !== undefined) {
      return NextResponse.json(
        { error: 'A unit key cannot be changed after it is created. Rename the unit instead.' },
        { status: 400 },
      );
    }

    const unit = await resolveOneMarkUnit(supabase, topicId);
    if (!unit) {
      return NextResponse.json(
        { error: 'That is not a OneMark unit. Coaching topics are edited under CDC.' },
        { status: 404 },
      );
    }

    const move = body.move === 'up' || body.move === 'down' ? body.move : null;

    // ---- position: exam_topic_map only, never the shared global column ----
    if (move) {
      const subjects = await loadSubjects(supabase);
      const mappings = await loadMappings(supabase, [unit.exam_definition_id]);
      const topics = await loadTopics(supabase, mappings.map((m) => m.topic_id));
      const itemCounts = await loadItemCounts(supabase, [unit.exam_definition_id]);
      const payload = buildUnitsPayload(
        subjects.filter((s) => s.id === unit.exam_definition_id),
        mappings,
        topics,
        itemCounts,
      );
      const units = payload.subjects[0]?.units ?? [];
      const plan = reorderPlan(units, topicId, move);
      if (plan.length === 0) {
        return NextResponse.json({ moved: false, reason: 'Already at the end of the unit list' });
      }
      // Session client: exam_topic_map's write policy already admits
      // foundation.items.manage, so RLS authorises this, not the route.
      for (const w of plan) {
        const { error } = await supabase
          .from(MAP_TABLE)
          .update({ sort_order: w.position, updated_by: g.userId })
          .eq('exam_definition_id', unit.exam_definition_id)
          .eq('topic_id', w.topic_id);
        if (error) {
          return NextResponse.json(
            { error: `The unit list order could not be saved: ${error.message}` },
            { status: 500 },
          );
        }
      }
      return NextResponse.json({ moved: true, writes: plan });
    }

    // ---- name / description / retire: the shared taxonomy row ----
    const patch: Record<string, unknown> = {};
    if (body.display_name !== undefined) {
      const name = typeof body.display_name === 'string' ? body.display_name.trim() : '';
      if (!name) return NextResponse.json({ error: 'A unit name is required' }, { status: 400 });
      if (name.length > 200) {
        return NextResponse.json(
          { error: 'A unit name must be 200 characters or fewer' },
          { status: 400 },
        );
      }
      patch.display_name = name;
    }
    if (body.description !== undefined) {
      patch.description =
        typeof body.description === 'string' && body.description.trim().length > 0
          ? body.description.trim()
          : null;
    }
    if (body.is_active !== undefined) {
      if (typeof body.is_active !== 'boolean') {
        return NextResponse.json({ error: 'is_active must be true or false' }, { status: 400 });
      }
      patch.is_active = body.is_active;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Nothing to change' }, { status: 400 });
    }
    patch.updated_by = g.userId;

    // ELEVATED, fenced by resolveOneMarkUnit above — see _shared.ts.
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from(TOPICS_TABLE)
      .update(patch)
      .eq('id', topicId)
      // The fence again, in the statement itself: even if resolveOneMarkUnit
      // were wrong, this cannot touch a row outside OneMark's own keys.
      .like('config_key', 'onemark\\_%')
      .select('id, config_key, display_name, description, is_active, is_system')
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'That is not a OneMark unit.' }, { status: 404 });
    }

    return NextResponse.json({ unit: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save the unit';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * NO HARD DELETE, ever.
 *
 * fp_items.topic_id references this row. Dropping a unit would orphan every
 * question written for it (the FK is ON DELETE SET NULL, so the questions
 * survive but lose the only thing that says which unit they belong to — the
 * paper wizard and the drafter would both stop seeing them). Retiring the unit
 * with is_active=false hides it from every picker and keeps its questions
 * attached, which is what "remove a unit" actually has to mean here.
 */
export async function DELETE() {
  await connection();
  return NextResponse.json(
    {
      error:
        'A unit is never deleted — questions point at it. Retire it instead: the unit disappears from every picker and keeps its questions.',
    },
    { status: 405, headers: { Allow: 'GET, PATCH' } },
  );
}
