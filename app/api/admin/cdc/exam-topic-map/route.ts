export const dynamic = 'force-dynamic';

/**
 * GET    /api/admin/cdc/exam-topic-map                       — all { exam_training_type_id, topic_id } pairs
 * POST   /api/admin/cdc/exam-topic-map                       — add one mapping { exam_training_type_id, topic_id }
 * DELETE /api/admin/cdc/exam-topic-map?exam=<id>&topic=<id>  — remove one mapping
 *
 * Gate: HEAD-ONLY — is_cdc_head_or_super(), the SAME predicate that backs the
 * cdc_exam_topic_map write-RLS (deep-review R4 #1). The route calls the RPC and
 * writes through the RLS-bound client (createClient), with NO service-role
 * bypass, so the route gate, the UI reveal (CdcHeadGuard / useIsCdcHead), and the
 * row policy all agree on ONE audience: cdc_head / super-admin. A cdc_coordinator
 * (who holds cdc.training.edit) is rejected here with a clean 403 rather than
 * being handed an editor whose every toggle silently fails at RLS. The junction
 * is platform-global config (no PII, no institution scope). curation audience =
 * cdc_head/super, matching table RLS; a Director may broaden it later via an
 * explicit RLS change (the route follows the live predicate automatically).
 *
 * Backs the /cdc/admin/exam-topic-map matrix editor — the in-app CRUD surface
 * for the govt-job-readiness topic↔exam junction (deep-review #3). Before this,
 * the junction was seed-only, so a newly-added topic/exam had 0 mappings with no
 * fix short of raw SQL.
 */

import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import {
  listExamTopicMap,
  addExamTopicMapping,
  removeExamTopicMapping,
} from '@/lib/services/admin/cdc-admin-service';

type AuthOk = { ok: true; userId: string; supabase: SupabaseClient };
type AuthFail = { ok: false; status: number };

async function requireCdcHead(): Promise<AuthOk | AuthFail> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401 };

  // Head-only boundary, IDENTICAL to the table write-RLS: evaluate the same
  // is_cdc_head_or_super() predicate so app == RLS. Writes below go through this
  // RLS-bound client (no service-role bypass), so the gate and the row policy
  // cannot diverge.
  const { data: isHead, error } = await supabase.rpc('is_cdc_head_or_super');
  if (error) return { ok: false, status: 500 };
  if (isHead !== true) return { ok: false, status: 403 };
  return { ok: true, userId: user.id, supabase };
}

function forbid(status: number) {
  return NextResponse.json(
    { error: status === 401 ? 'Unauthorized' : status === 500 ? 'Authorization check failed' : 'Forbidden' },
    { status }
  );
}

function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export async function GET() {
  const auth = await requireCdcHead();
  if (!auth.ok) return forbid(auth.status);

  // Read via the RLS-bound client — the read policy is auth.uid() IS NOT NULL
  // (config-master public-read), so any authenticated caller who passed the
  // head-only gate above sees the full map.
  const { data, error } = await listExamTopicMap(auth.supabase);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, data });
}

export async function POST(request: NextRequest) {
  const auth = await requireCdcHead();
  if (!auth.ok) return forbid(auth.status);

  const body = await request.json().catch(() => null);
  const examId = (body as any)?.exam_training_type_id;
  const topicId = (body as any)?.topic_id;
  if (!isUuid(examId) || !isUuid(topicId)) {
    return NextResponse.json(
      { error: 'exam_training_type_id and topic_id (uuid) are required' },
      { status: 400 }
    );
  }

  // Validate the target is a GOVERNMENT-EXAM training type (exam_family set) and
  // the topic is active before inserting (deep-review R4 #3). The FK alone only
  // proves the ids exist — it does not stop a mapping being created against a
  // non-govt training type or a deactivated topic, which would then render as a
  // phantom row / column on the cohort-overlap view. Mirror the rendered set.
  const [examRes, topicRes] = await Promise.all([
    auth.supabase
      .from('cdc_training_types')
      .select('id, exam_family, is_active')
      .eq('id', examId)
      .maybeSingle(),
    auth.supabase
      .from('cdc_exam_syllabus_topics')
      .select('id, is_active')
      .eq('id', topicId)
      .maybeSingle(),
  ]);
  if (examRes.error) return NextResponse.json({ error: examRes.error.message }, { status: 500 });
  if (topicRes.error) return NextResponse.json({ error: topicRes.error.message }, { status: 500 });

  const examRow = examRes.data as { exam_family: string | null; is_active: boolean } | null;
  const topicRow = topicRes.data as { is_active: boolean } | null;

  if (!examRow || examRow.exam_family == null || examRow.exam_family === '') {
    return NextResponse.json(
      { error: 'exam_training_type_id must reference an active government-exam training type (exam_family set)' },
      { status: 400 }
    );
  }
  if (examRow.is_active === false) {
    return NextResponse.json(
      { error: 'exam_training_type_id references an inactive training type' },
      { status: 400 }
    );
  }
  if (!topicRow || topicRow.is_active === false) {
    return NextResponse.json(
      { error: 'topic_id must reference an active syllabus topic' },
      { status: 400 }
    );
  }

  // RLS-bound write: caller is head/super (gate) and the row policy is head-only,
  // so this passes without any service-role bypass.
  const { error } = await addExamTopicMapping(auth.supabase, examId, topicId, auth.userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireCdcHead();
  if (!auth.ok) return forbid(auth.status);

  const sp = request.nextUrl.searchParams;
  const examId = sp.get('exam');
  const topicId = sp.get('topic');
  if (!isUuid(examId) || !isUuid(topicId)) {
    return NextResponse.json(
      { error: 'exam and topic (uuid) query params are required' },
      { status: 400 }
    );
  }

  // RLS-bound write (same head-only rationale as POST).
  const { error } = await removeExamTopicMapping(auth.supabase, examId, topicId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
