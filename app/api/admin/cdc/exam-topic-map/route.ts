export const dynamic = 'force-dynamic';

/**
 * GET    /api/admin/cdc/exam-topic-map                       — all { exam_training_type_id, topic_id } pairs
 * POST   /api/admin/cdc/exam-topic-map                       — add one mapping { exam_training_type_id, topic_id }
 * DELETE /api/admin/cdc/exam-topic-map?exam=<id>&topic=<id>  — remove one mapping
 *
 * Gate: user_has_permission('cdc.training.edit') — the SAME permission the
 * matrix-editor page (/cdc/admin/exam-topic-map, via the /cdc/admin
 * RoutePermissionGuard + MENU_PERMISSIONS) and the govt-readiness "Curate"
 * links require. Both cdc_head AND cdc_coordinator hold this key, so the whole
 * govt-job-readiness feature is intentionally built for coordinators too.
 *
 * WHY service-role writes (the recruiters-route precedent, see
 * app/api/cdc/recruiters/route.ts):
 *   cdc_exam_topic_map write-RLS requires is_cdc_head_or_super() — cdc_head /
 *   super only. But this feature's audience is cdc.training.edit (head +
 *   coordinator), so a coordinator would open the matrix editor and get a
 *   confusing RLS rejection on every toggle. The prior hardcoded role list
 *   (super_admin/cdc_head/administrator) diverged the other way — it 403'd
 *   coordinators outright AND let `administrator` through the route only to hit
 *   the RLS wall with a 500. To make app-layer, UI, and the effective write
 *   boundary all agree on ONE audience (cdc.training.edit), writes go through
 *   the service-role client (bypassing the head-only RLS) while the route GATES
 *   on cdc.training.edit. The junction is platform-global config (no PII, no
 *   institution scope), so widening curation to training-editors is low-risk and
 *   mirrors the drive-creators-may-add-recruiters director decision. The RLS
 *   stays as the belt for any direct (non-route) client write.
 *
 * Backs the /cdc/admin/exam-topic-map matrix editor — the in-app CRUD surface
 * for the govt-job-readiness topic↔exam junction (deep-review #3). Before this,
 * the junction was seed-only, so a newly-added topic/exam had 0 mappings with no
 * fix short of raw SQL.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  listExamTopicMap,
  addExamTopicMapping,
  removeExamTopicMapping,
} from '@/lib/services/admin/cdc-admin-service';

async function requireTrainingEdit() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401 };

  // Parity with the matrix-editor page gate + RLS-honouring effective boundary:
  // cdc.training.edit (held by cdc_head + cdc_coordinator). Writes below use the
  // service-role client so a coordinator who passes this gate is not rejected by
  // the head-only write-RLS (see header comment).
  const { data: allowed } = await supabase.rpc('user_has_permission', {
    permission_name: 'cdc.training.edit',
  });

  if (allowed !== true) return { ok: false as const, status: 403 };
  return { ok: true as const, userId: user.id };
}

function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export async function GET() {
  const auth = await requireTrainingEdit();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'Unauthorized' : 'Forbidden' },
      { status: auth.status }
    );
  }

  // Read via the RLS-bound client — the read policy is auth.uid() IS NOT NULL
  // (config-master public-read), so any authenticated caller who passed the
  // gate above sees the full map.
  const supabase = await createClient();
  const { data, error } = await listExamTopicMap(supabase);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, data });
}

export async function POST(request: NextRequest) {
  const auth = await requireTrainingEdit();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'Unauthorized' : 'Forbidden' },
      { status: auth.status }
    );
  }

  const body = await request.json().catch(() => null);
  const examId = (body as any)?.exam_training_type_id;
  const topicId = (body as any)?.topic_id;
  if (!isUuid(examId) || !isUuid(topicId)) {
    return NextResponse.json(
      { error: 'exam_training_type_id and topic_id (uuid) are required' },
      { status: 400 }
    );
  }

  // Service-role write: gate is cdc.training.edit (head + coordinator); the
  // table's write-RLS is head-only, so bypass it here (see header comment).
  const db = createServiceRoleClient();
  const { error } = await addExamTopicMapping(db, examId, topicId, auth.userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireTrainingEdit();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'Unauthorized' : 'Forbidden' },
      { status: auth.status }
    );
  }

  const sp = request.nextUrl.searchParams;
  const examId = sp.get('exam');
  const topicId = sp.get('topic');
  if (!isUuid(examId) || !isUuid(topicId)) {
    return NextResponse.json(
      { error: 'exam and topic (uuid) query params are required' },
      { status: 400 }
    );
  }

  // Service-role write (same rationale as POST).
  const db = createServiceRoleClient();
  const { error } = await removeExamTopicMapping(db, examId, topicId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
