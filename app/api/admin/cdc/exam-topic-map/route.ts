export const dynamic = 'force-dynamic';

/**
 * GET    /api/admin/cdc/exam-topic-map                       — all { exam_training_type_id, topic_id } pairs
 * POST   /api/admin/cdc/exam-topic-map                       — add one mapping { exam_training_type_id, topic_id }
 * DELETE /api/admin/cdc/exam-topic-map?exam=<id>&topic=<id>  — remove one mapping
 *
 * Role: super_admin OR cdc_head OR administrator (same gate as the CDC master
 * tables). Writes go through the RLS-bound client, so is_cdc_head_or_super() on
 * cdc_exam_topic_map is enforced as a second layer.
 *
 * Backs the /cdc/admin/exam-topic-map matrix editor — the in-app CRUD surface
 * for the govt-job-readiness topic↔exam junction (deep-review #3). Before this,
 * the junction was seed-only, so a newly-added topic/exam had 0 mappings with no
 * fix short of raw SQL.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  listExamTopicMap,
  addExamTopicMapping,
  removeExamTopicMapping,
} from '@/lib/services/admin/cdc-admin-service';

async function requireCdcAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401 };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();

  if (!profile) return { ok: false as const, status: 403 };

  const allowed =
    profile.is_super_admin ||
    profile.role === 'super_admin' ||
    profile.role === 'cdc_head' ||
    profile.role === 'administrator';

  if (!allowed) return { ok: false as const, status: 403 };
  return { ok: true as const, userId: user.id };
}

function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export async function GET() {
  const auth = await requireCdcAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'Unauthorized' : 'Forbidden' },
      { status: auth.status }
    );
  }

  const supabase = await createClient();
  const { data, error } = await listExamTopicMap(supabase);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, data });
}

export async function POST(request: NextRequest) {
  const auth = await requireCdcAdmin();
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

  const supabase = await createClient();
  const { error } = await addExamTopicMapping(supabase, examId, topicId, auth.userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireCdcAdmin();
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

  const supabase = await createClient();
  const { error } = await removeExamTopicMapping(supabase, examId, topicId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
