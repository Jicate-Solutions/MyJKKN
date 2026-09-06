// app/api/pde/cases/route.ts
// Faculty CRUD for clinical_case assessments.
//
// GET /api/pde/cases?status=&courseId=&institutionId=
//   Returns: { data: ClinicalCase[] }
// POST /api/pde/cases
//   Body: CreateClinicalCaseInput { course_id, title, description?, case_scenario, metadata, time_limit_minutes?, pass_threshold?, questions[] }
//   Creates lesson (with case_scenario JSONB), assessment (assessment_type=clinical_case, status=draft), and questions.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type {
  CreateClinicalCaseInput,
  ClinicalCase,
} from '@/types/pde';

// Sum of domain weights must equal 100 (within float tolerance).
function validateDomainWeights(w: CreateClinicalCaseInput['metadata']['domain_weights']): string | null {
  const expected = ['data_gathering', 'hypothesis_generation', 'management_planning', 'patient_communication', 'professionalism'] as const;
  for (const k of expected) {
    if (typeof w[k] !== 'number' || w[k] < 0 || w[k] > 100) {
      return `domain_weights.${k} must be a non-negative number ≤ 100`;
    }
  }
  const sum = expected.reduce((acc, k) => acc + w[k], 0);
  // The seed file stores weights as fractions (0.20). Accept either fractions summing to 1 or percentages summing to 100.
  if (Math.abs(sum - 100) > 0.5 && Math.abs(sum - 1) > 0.005) {
    return `domain_weights must sum to 100 (or 1.0 if fractional); got ${sum}`;
  }
  return null;
}

interface ValidationResult {
  ok: boolean;
  input: CreateClinicalCaseInput | null;
  error: string;
}

function validateInput(body: any): ValidationResult {
  const fail = (error: string): ValidationResult => ({ ok: false, input: null, error });
  if (!body || typeof body !== 'object') return fail('invalid body');
  if (!body.course_id || typeof body.course_id !== 'string') return fail('course_id required');
  if (!body.title || typeof body.title !== 'string') return fail('title required');
  if (!body.case_scenario || typeof body.case_scenario !== 'object') return fail('case_scenario required');
  if (!body.case_scenario.patient_name) return fail('case_scenario.patient_name required');
  if (!body.case_scenario.chief_complaint) return fail('case_scenario.chief_complaint required');
  if (!body.metadata?.domain_weights) return fail('metadata.domain_weights required');
  const wErr = validateDomainWeights(body.metadata.domain_weights);
  if (wErr) return fail(wErr);
  if (!Array.isArray(body.questions) || body.questions.length === 0) {
    return fail('questions array required (at least 1)');
  }
  for (let i = 0; i < body.questions.length; i++) {
    const q = body.questions[i];
    if (!q.question_text) return fail(`questions[${i}].question_text required`);
    if (!q.question_type) return fail(`questions[${i}].question_type required`);
    if (!['free_text_socratic', 'mcq_warmup', 'image_tag'].includes(q.question_type)) {
      return fail(`questions[${i}].question_type invalid`);
    }
    if (!q.metadata || typeof q.metadata !== 'object') {
      return fail(`questions[${i}].metadata required`);
    }
    if (!q.metadata.osce_domain) return fail(`questions[${i}].metadata.osce_domain required`);
  }
  return { ok: true, input: body as CreateClinicalCaseInput, error: '' };
}

// ──────────────────────────────────────────────────────────────────────────────
// GET — list cases (scope: faculty's institution_id unless super_admin)
// ──────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status'); // draft | published | archived | null=all
    const courseId = searchParams.get('courseId');
    const institutionIdParam = searchParams.get('institutionId');

    // Resolve user's institution_id from profile (used for default scope)
    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('institution_id, role')
      .eq('id', user.id)
      .single();

    const isSuper = profile?.role === 'super_admin' || profile?.role === 'platform_admin';
    const scopeInstitutionId = isSuper ? (institutionIdParam || null) : (profile?.institution_id || null);

    // Build query — join vac_courses to get institution scope + course meta.
    let query = (supabase as any)
      .from('pde_assessments')
      .select(`
        id, course_id, lesson_id, title, description,
        assessment_type, status, version, metadata,
        is_active, pass_threshold, time_limit_minutes,
        created_by, created_at, updated_at,
        vac_courses!inner(id, code, name, institution_id)
      `)
      .eq('assessment_type', 'clinical_case')
      .order('updated_at', { ascending: false });

    if (status && ['draft', 'published', 'archived'].includes(status)) {
      query = query.eq('status', status);
    }
    if (courseId) query = query.eq('course_id', courseId);
    if (scopeInstitutionId) query = query.eq('vac_courses.institution_id', scopeInstitutionId);

    const { data, error } = await query;
    if (error) throw error;

    // Question counts (single round-trip)
    const ids = (data || []).map((r: any) => r.id);
    let counts: Record<string, number> = {};
    if (ids.length) {
      const { data: qRows } = await (supabase as any)
        .from('pde_assessment_questions')
        .select('assessment_id')
        .in('assessment_id', ids);
      counts = (qRows || []).reduce((acc: Record<string, number>, q: any) => {
        acc[q.assessment_id] = (acc[q.assessment_id] || 0) + 1;
        return acc;
      }, {});
    }

    const result: ClinicalCase[] = (data || []).map((r: any) => ({
      id: r.id,
      course_id: r.course_id,
      lesson_id: r.lesson_id,
      title: r.title,
      description: r.description,
      assessment_type: 'clinical_case',
      status: r.status,
      version: r.version,
      metadata: r.metadata || {},
      is_active: r.is_active,
      pass_threshold: r.pass_threshold,
      time_limit_minutes: r.time_limit_minutes,
      created_by: r.created_by,
      created_at: r.created_at,
      updated_at: r.updated_at,
      institution_id: r.vac_courses?.institution_id,
      course_code: r.vac_courses?.code,
      course_name: r.vac_courses?.name,
      question_count: counts[r.id] || 0,
    }));

    return NextResponse.json({ data: result });
  } catch (e: any) {
    console.error('GET /api/pde/cases error:', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// POST — create case (lesson + assessment + questions)
// ──────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const v = validateInput(body);
    if (!v.ok || !v.input) return NextResponse.json({ error: v.error }, { status: 400 });
    const input = v.input;

    // Sanity: ensure course exists + faculty has access (institution_id match unless super_admin)
    const { data: courseRow, error: courseErr } = await (supabase as any)
      .from('vac_courses')
      .select('id, institution_id')
      .eq('id', input.course_id)
      .single();
    if (courseErr || !courseRow) {
      return NextResponse.json({ error: 'course_id not found' }, { status: 404 });
    }

    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('institution_id, role')
      .eq('id', user.id)
      .single();
    const isSuper = profile?.role === 'super_admin' || profile?.role === 'platform_admin';
    if (!isSuper && profile?.institution_id && profile.institution_id !== courseRow.institution_id) {
      return NextResponse.json({ error: 'Course belongs to another institution' }, { status: 403 });
    }

    // 1. Create lesson with case_scenario JSONB.
    // hour was hardcoded to 1, which violates vac_lessons_course_id_hour_key the
    // moment a course already has ANY lesson (every prod course does — the MATLAB
    // rollout seeded 30, BDS-CR-101 has the OLP seed). Pick the next free hour.
    const { data: maxRow } = await (supabase as any)
      .from('vac_lessons')
      .select('hour')
      .eq('course_id', input.course_id)
      .order('hour', { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextHour = (maxRow?.hour ?? 0) + 1;
    const { data: lesson, error: lessonErr } = await (supabase as any)
      .from('vac_lessons')
      .insert({
        course_id: input.course_id,
        week: 1,
        hour: nextHour,
        title: input.title,
        duration_minutes: input.time_limit_minutes || 30,
        is_published: false,
        case_scenario: input.case_scenario,
      })
      .select()
      .single();
    if (lessonErr) throw lessonErr;

    // 2. Create assessment (draft)
    const { data: assessment, error: aErr } = await (supabase as any)
      .from('pde_assessments')
      .insert({
        title: input.title,
        description: input.description || null,
        assessment_type: 'clinical_case',
        status: 'draft',
        version: 1,
        lesson_id: lesson.id,
        course_id: input.course_id,
        is_active: true,
        pass_threshold: input.pass_threshold ?? 60,
        time_limit_minutes: input.time_limit_minutes ?? null,
        metadata: input.metadata,
        created_by: user.id,
      })
      .select()
      .single();
    if (aErr) {
      // Clean lesson if assessment fails
      await (supabase as any).from('vac_lessons').delete().eq('id', lesson.id);
      throw aErr;
    }

    // 3. Create questions
    const qRows = input.questions.map((q, idx) => ({
      assessment_id: assessment.id,
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
    const { error: qErr } = await (supabase as any)
      .from('pde_assessment_questions')
      .insert(qRows);
    if (qErr) {
      await (supabase as any).from('pde_assessments').delete().eq('id', assessment.id);
      await (supabase as any).from('vac_lessons').delete().eq('id', lesson.id);
      throw qErr;
    }

    return NextResponse.json({ data: assessment }, { status: 201 });
  } catch (e: any) {
    console.error('POST /api/pde/cases error:', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}
