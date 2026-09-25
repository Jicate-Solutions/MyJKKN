// app/api/pde/cases/[id]/meq-export/route.ts
// ============================================================================
// GET /api/pde/cases/[id]/meq-export?document=paper|answer-key|rubric&totalMarks=70
//   → application/pdf
//
// Turns an existing clinical case into one of three printable documents. This
// route is READ-ONLY: it reads the case and its questions and writes nothing.
//
// GATE — the same bar as the faculty case-authoring pages.
//   /pde/faculty/cases and every sub-route are gated on 'pde.faculty.view'
//   (lib/sidebarMenuLink.ts MENU_PERMISSIONS). requireCaseAuthor() is the
//   server-side embodiment of exactly that permission, already used by the
//   clinical-image write paths, so it is reused here rather than inventing a
//   second definition of "teaching staff".
//
//   The answer key is the reason this matters. A learner who could call this
//   route would get every ground_truth for a live case as a formatted PDF —
//   the leak that pde_answer_key_lock_base_table_rls.sql closed at the table
//   level. Two layers hold here: this permission gate, and RLS on
//   pde_assessment_questions (staff with 'pde.faculty.view' AND institution
//   access only), because the case is read with the CALLER's client, never the
//   service role.
//
//   Every denial answers with an explicit error object and a real status code.
//   Nothing here redirects — a silent bounce on a permission failure is a bug
//   the caller cannot diagnose.
// ============================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireCaseAuthor } from '@/lib/services/pde/require-case-author';
import {
  buildMeqPaperModel,
  isMeqDocumentKind,
  meqFileName,
  resolveTotalMarks,
  type MeqDocumentKind,
} from '@/lib/pde/meq-export';
import { renderMeqDocumentBuffer } from '@/lib/pdf/pde-meq-paper';
import type { ClinicalCaseWithQuestions } from '@/types/pde';

async function loadCaseForExport(
  supabase: any,
  id: string
): Promise<ClinicalCaseWithQuestions | null> {
  const { data: a, error: aErr } = await supabase
    .from('pde_assessments')
    .select(
      `
      id, course_id, lesson_id, title, description,
      assessment_type, status, version, metadata,
      is_active, pass_threshold, time_limit_minutes,
      created_by, created_at, updated_at,
      vac_courses(id, code, name, institution_id),
      vac_lessons(id, case_scenario)
    `
    )
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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();

    const gate = await requireCaseAuthor(supabase);
    if (!gate.ok) {
      return NextResponse.json(
        {
          error:
            gate.status === 401
              ? 'Sign in to export a question paper.'
              : 'You do not have access to export question papers. This is limited to Senior Learners — ask an administrator if you need it.',
        },
        { status: gate.status }
      );
    }

    const documentParam = request.nextUrl.searchParams.get('document') ?? 'paper';
    if (!isMeqDocumentKind(documentParam)) {
      return NextResponse.json(
        { error: "document must be one of 'paper', 'answer-key' or 'rubric'." },
        { status: 400 }
      );
    }
    const kind: MeqDocumentKind = documentParam;
    const totalMarks = resolveTotalMarks(request.nextUrl.searchParams.get('totalMarks'));

    // Read with the caller's own client: RLS on pde_assessment_questions keeps
    // a cross-institution reader away from the answer-key columns.
    const clinicalCase = await loadCaseForExport(supabase as any, id);
    if (!clinicalCase) {
      return NextResponse.json(
        { error: 'That clinical case was not found, or it is not in your institution.' },
        { status: 404 }
      );
    }

    if (!clinicalCase.questions || clinicalCase.questions.length === 0) {
      return NextResponse.json(
        {
          error:
            'This case has no questions yet, so there is nothing to put on a paper. Add questions to the case first.',
        },
        { status: 409 }
      );
    }

    const model = buildMeqPaperModel(clinicalCase, { totalMarks });
    const pdf = renderMeqDocumentBuffer(model, kind);

    return new NextResponse(pdf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${meqFileName(model, kind)}"`,
        // The key must never sit in a shared cache.
        'Cache-Control': 'no-store, max-age=0',
        // Lets the download surface the mismatch without re-deriving it.
        'X-Meq-Marks-Balanced': model.marksBalanced ? 'true' : 'false',
      },
    });
  } catch (e: any) {
    console.error('GET /api/pde/cases/[id]/meq-export error:', e);
    return NextResponse.json(
      { error: e?.message || 'Could not build the question paper.' },
      { status: 500 }
    );
  }
}
