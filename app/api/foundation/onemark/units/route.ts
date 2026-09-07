export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  MAP_TABLE,
  TOPICS_TABLE,
  gate,
  loadItemCounts,
  loadMappings,
  loadSubjects,
  loadTakenKeys,
  loadTopics,
} from './_shared';
import {
  buildUnitsPayload,
  isOneMarkUnitKey,
  nextFreePosition,
  unitConfigKey,
} from '@/lib/services/onemark/units-service';

// OneMark — the school units screen (Wave 3 Lane U).
//
// GET  /api/foundation/onemark/units  -> one section per subject, each ordered
//                                        by exam_topic_map.sort_order
// POST /api/foundation/onemark/units  -> add a unit: BOTH rows, or neither
//
// There is deliberately no DELETE here or on the [topicId] route: fp_items
// .topic_id points at a unit and deleting one would orphan every question that
// belongs to it. Retiring (is_active=false) is the only way out, and the
// [topicId] route answers DELETE with 405 rather than pretending otherwise.
//
// Gate: foundation.items.manage, checked here as well as on the page.

export async function GET() {
  await connection();
  try {
    const supabase = await createClient();
    const g = await gate(supabase);
    if (!g) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!g.canManage) {
      return NextResponse.json(
        { error: 'You do not have access to manage the OneMark unit list.' },
        { status: 403 },
      );
    }

    const subjects = await loadSubjects(supabase);
    const examIds = subjects.map((s) => s.id);
    const mappings = await loadMappings(supabase, examIds);
    const [topics, itemCounts] = await Promise.all([
      loadTopics(supabase, [...new Set(mappings.map((m) => m.topic_id))]),
      loadItemCounts(supabase, examIds),
    ]);

    return NextResponse.json(buildUnitsPayload(subjects, mappings, topics, itemCounts));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load the unit list';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  await connection();
  try {
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
      exam_definition_id?: unknown;
      display_name?: unknown;
      description?: unknown;
    } | null;
    if (!body) return NextResponse.json({ error: 'A JSON body is required' }, { status: 400 });

    const examId = typeof body.exam_definition_id === 'string' ? body.exam_definition_id : '';
    const displayName = typeof body.display_name === 'string' ? body.display_name.trim() : '';
    const description =
      typeof body.description === 'string' && body.description.trim().length > 0
        ? body.description.trim()
        : null;

    if (!displayName) {
      return NextResponse.json({ error: 'A unit name is required' }, { status: 400 });
    }
    if (displayName.length > 200) {
      return NextResponse.json({ error: 'A unit name must be 200 characters or fewer' }, { status: 400 });
    }

    // The subject must be one of the two OneMark exams. loadSubjects filters to
    // them, so an id outside that set simply is not found.
    const subjects = await loadSubjects(supabase);
    const subject = subjects.find((s) => s.id === examId);
    if (!subject) {
      return NextResponse.json({ error: 'Pick a OneMark subject' }, { status: 400 });
    }

    const mappings = await loadMappings(supabase, [subject.id]);
    const position = nextFreePosition(mappings.map((m) => m.sort_order ?? 0));
    const takenKeys = await loadTakenKeys(supabase);
    const configKey = unitConfigKey(subject.config_key, displayName, takenKeys, position);

    // Belt and braces: the elevated write below only ever runs on a key this
    // route minted, and unitConfigKey always mints an onemark_ key.
    if (!isOneMarkUnitKey(configKey)) {
      return NextResponse.json({ error: 'Refusing to write a non-OneMark unit key' }, { status: 500 });
    }

    // ELEVATED — see _shared.ts. The shared taxonomy's write policy is
    // is_cdc_head_or_super() only; a subject Senior Learner reaches it here and
    // ONLY through a key this route minted.
    //
    // sort_order is deliberately LEFT AT THE TABLE DEFAULT. That column is the
    // shared global one every coaching topic also uses, and writing it is what
    // makes a flat list interleave the two subjects. The unit's position lives
    // on the exam_topic_map row below and nowhere else.
    const admin = createServiceRoleClient();
    const { data: created, error: insertErr } = await admin
      .from(TOPICS_TABLE)
      .insert({
        config_key: configKey,
        display_name: displayName,
        description,
        is_shared: false,
        is_system: false,
        is_active: true,
        created_by: g.userId,
        updated_by: g.userId,
      })
      .select('id, config_key, display_name, description, is_active, is_system')
      .single();
    if (insertErr || !created) {
      return NextResponse.json(
        { error: insertErr?.message ?? 'The unit could not be created' },
        { status: 500 },
      );
    }

    // The junction write runs on the SESSION client: its policy already admits
    // foundation.items.manage, so RLS — not this route — authorises it.
    const { error: mapErr } = await supabase.from(MAP_TABLE).insert({
      exam_definition_id: subject.id,
      topic_id: created.id,
      sort_order: position,
      created_by: g.userId,
      updated_by: g.userId,
    });
    if (mapErr) {
      // BOTH ROWS OR NEITHER. An unmapped topic is invisible to the paper
      // wizard and to the drafter, so a half-written unit is worse than none:
      // roll the taxonomy row back rather than leave one stranded.
      await admin.from(TOPICS_TABLE).delete().eq('id', created.id);
      return NextResponse.json(
        { error: `The unit could not be added to the subject: ${mapErr.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        topic_id: created.id,
        config_key: created.config_key,
        display_name: created.display_name,
        position,
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to add the unit';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
