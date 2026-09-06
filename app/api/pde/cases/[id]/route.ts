// app/api/pde/cases/[id]/route.ts
// GET    /api/pde/cases/[id]          → ClinicalCaseWithQuestions
// PATCH  /api/pde/cases/[id]          → update (versions on publish, archive transitions)
// DELETE /api/pde/cases/[id]          → archive (soft; status='archived')

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type {
  ClinicalCaseWithQuestions,
  UpdateClinicalCaseInput,
  ClinicalCaseStatus,
} from '@/types/pde';

function isValidStatus(s: any): s is ClinicalCaseStatus {
  return s === 'draft' || s === 'published' || s === 'archived';
}

async function loadFull(supabase: any, id: string): Promise<ClinicalCaseWithQuestions | null> {
  const { data: a, error: aErr } = await supabase
    .from('pde_assessments')
    .select(`
      id, course_id, lesson_id, title, description,
      assessment_type, status, version, metadata,
      is_active, pass_threshold, time_limit_minutes,
      created_by, created_at, updated_at,
      vac_courses(id, code, name, institution_id),
      vac_lessons(id, case_scenario)
    `)
    .eq('id', id)
    .eq('assessment_type', 'clinical_case')
    .single();
  if (aErr || !a) return null;

  const { data: questions, error: qErr } = await supabase
    .from('pde_assessment_questions')
    .select('*')
    .eq('assessment_id', id)
    .order('order_index', { ascending: true });
  if (qErr) throw qErr;

  return {
    id: a.id,
    course_id: a.course_id,
    lesson_id: a.lesson_id,
    title: a.title,
    description: a.description,
    assessment_type: 'clinical_case',
    status: a.status,
    version: a.version,
    metadata: a.metadata || {},
    is_active: a.is_active,
    pass_threshold: a.pass_threshold,
    time_limit_minutes: a.time_limit_minutes,
    created_by: a.created_by,
    created_at: a.created_at,
    updated_at: a.updated_at,
    case_scenario: a.vac_lessons?.case_scenario,
    institution_id: a.vac_courses?.institution_id,
    course_code: a.vac_courses?.code,
    course_name: a.vac_courses?.name,
    questions: questions || [],
  };
}

interface AuthResult {
  ok: boolean;
  status: number;
  error: string;
}

async function requireOwnerOrSuper(
  supabase: any,
  userId: string,
  institutionId?: string | null
): Promise<AuthResult> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('institution_id, role')
    .eq('id', userId)
    .single();
  const isSuper = profile?.role === 'super_admin' || profile?.role === 'platform_admin';
  if (isSuper) return { ok: true, status: 200, error: '' };
  if (institutionId && profile?.institution_id && profile.institution_id === institutionId) {
    return { ok: true, status: 200, error: '' };
  }
  return { ok: false, status: 403, error: 'Forbidden — institution scope mismatch' };
}

// ──────────────────────────────────────────────────────────────────────────────
// GET
// ──────────────────────────────────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id } = await context.params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const full = await loadFull(supabase as any, id);
    if (!full) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Faculty may only view cases in their own institution unless super_admin.
    const auth = await requireOwnerOrSuper(supabase as any, user.id, full.institution_id);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    return NextResponse.json({ data: full });
  } catch (e: any) {
    console.error('GET /api/pde/cases/[id] error:', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// PATCH — supports status transitions + content edits.
//
// Behaviour:
//   - status: draft→published, draft→archived, published→archived, published→draft (revoke). archived is terminal.
//   - On content edit AFTER published: increment version (existing submissions snapshot via pde_submissions.assessment_version FK).
//   - Edits while draft: no version bump.
// ──────────────────────────────────────────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id } = await context.params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json()) as UpdateClinicalCaseInput;

    // Load current state for transition rules + scope check
    const existing = await loadFull(supabase as any, id);
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const auth = await requireOwnerOrSuper(supabase as any, user.id, existing.institution_id);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    if (existing.status === 'archived' && body.status !== undefined && body.status !== 'archived') {
      return NextResponse.json({ error: 'Archived cases cannot be revived; create a copy.' }, { status: 400 });
    }

    if (body.status !== undefined && !isValidStatus(body.status)) {
      return NextResponse.json({ error: 'invalid status' }, { status: 400 });
    }

    // Build assessment patch
    const assessmentPatch: Record<string, any> = {};
    if (body.title !== undefined) assessmentPatch.title = body.title;
    if (body.description !== undefined) assessmentPatch.description = body.description;
    if (body.time_limit_minutes !== undefined) assessmentPatch.time_limit_minutes = body.time_limit_minutes;
    if (body.pass_threshold !== undefined) assessmentPatch.pass_threshold = body.pass_threshold;
    if (body.metadata !== undefined) {
      assessmentPatch.metadata = { ...existing.metadata, ...body.metadata };
    }
    if (body.status !== undefined) assessmentPatch.status = body.status;

    // Detect "content edit" (anything besides status). If existing is published and content changed → bump version.
    const isContentEdit =
      body.title !== undefined ||
      body.description !== undefined ||
      body.case_scenario !== undefined ||
      body.metadata !== undefined ||
      Array.isArray(body.questions);
    if (isContentEdit && existing.status === 'published') {
      assessmentPatch.version = (existing.version || 1) + 1;
    }

    if (Object.keys(assessmentPatch).length > 0) {
      assessmentPatch.updated_at = new Date().toISOString();
      const { error: uErr } = await (supabase as any)
        .from('pde_assessments')
        .update(assessmentPatch)
        .eq('id', id);
      if (uErr) throw uErr;
    }

    // Patch lesson case_scenario if provided
    if (body.case_scenario !== undefined && existing.lesson_id) {
      const { error: lErr } = await (supabase as any)
        .from('vac_lessons')
        .update({ case_scenario: body.case_scenario })
        .eq('id', existing.lesson_id);
      if (lErr) throw lErr;
    }

    // Replace questions if provided (delete-then-insert keeps order_index stable)
    if (Array.isArray(body.questions)) {
      const { error: delErr } = await (supabase as any)
        .from('pde_assessment_questions')
        .delete()
        .eq('assessment_id', id);
      if (delErr) throw delErr;

      const newQs = body.questions.map((q, idx) => ({
        assessment_id: id,
        question_type: q.question_type,
        question_text: q.question_text,
        question_media_url: q.question_media_url || null,
        options: q.options ?? null,
        correct_answer: q.correct_answer ?? null,
        expected_regions: q.expected_regions ?? null,
        points: q.points ?? 10,
        order_index: q.order_index ?? idx + 1,
        metadata: q.metadata,
      }));
      if (newQs.length) {
        const { error: insErr } = await (supabase as any)
          .from('pde_assessment_questions')
          .insert(newQs);
        if (insErr) throw insErr;
      }
    }

    const refreshed = await loadFull(supabase as any, id);
    return NextResponse.json({ data: refreshed });
  } catch (e: any) {
    console.error('PATCH /api/pde/cases/[id] error:', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// DELETE — soft archive
// ──────────────────────────────────────────────────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id } = await context.params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const existing = await loadFull(supabase as any, id);
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const auth = await requireOwnerOrSuper(supabase as any, user.id, existing.institution_id);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { error } = await (supabase as any)
      .from('pde_assessments')
      .update({ status: 'archived', is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;

    return NextResponse.json({ data: { id, status: 'archived' } });
  } catch (e: any) {
    console.error('DELETE /api/pde/cases/[id] error:', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}
