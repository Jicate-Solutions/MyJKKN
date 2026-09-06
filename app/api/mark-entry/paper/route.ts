import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CoeRestClient, CoeApiError } from '@/lib/services/coe/coe-rest-client';
import {
  resolveInternalMarksAccess,
  resolveEffectiveInstitutionId,
  resolveCoeInstitutionCode,
} from '@/lib/utils/internal-marks/internal-marks-access';
import { guardMarkEntryScope } from '@/lib/utils/mark-entry/mark-entry-access';
import {
  buildEntryPaper,
  isEntryEligible,
  rankPapers,
} from '@/lib/utils/mark-entry/entry-rules';
import type { IaQuestionPaper, IaQuestionPaperDetail } from '@/types/ia-question-paper';
import type {
  MarkEntryPaperOption,
  MarkEntryPaperResponse,
} from '@/types/mark-entry';

/**
 * GET /api/mark-entry/paper — resolve the question paper that drives the
 * question-wise mark grid.
 *
 * Two things make this different from the /api/question-papers proxy:
 *
 * 1. It resolves by COURSE CODE across every program, not by course_offering_id.
 *    A course common to several programs (e.g. 24UGEN03) is authored ONCE, under
 *    whichever program's offering the setter happened to use. Every other
 *    program's staff must be able to mark against that same paper, with its CO
 *    and K-level intact. The response flags `is_shared` so the UI can say where
 *    the paper came from.
 *
 * 2. Scope uses the CIA assessment period, not today. See QpScopeOptions —
 *    marks are keyed in after teaching ends, when the staff plan may have lapsed.
 *
 * Authorization tiers (identical to Question Papers):
 *   course  → faculty; the requested course must be one of theirs
 *   program → HOD; the requested program must be one of theirs
 *   all     → principal / registrar / CoE-office; whole institution
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scope = await resolveInternalMarksAccess(user.id);
    const { searchParams } = new URL(request.url);
    const institutionId = resolveEffectiveInstitutionId(scope, searchParams.get('institutionId'));
    const examSessionId = searchParams.get('examSessionId');
    const ciaRound = searchParams.get('ciaRound');
    const courseCode = searchParams.get('courseCode');
    const programCode = searchParams.get('programCode') ?? undefined;
    const ciaSettingId = searchParams.get('ciaSettingId') ?? undefined;
    const paperId = searchParams.get('paperId') ?? undefined;

    if (!institutionId || !examSessionId || !ciaRound || !courseCode) {
      return NextResponse.json(
        { error: 'institutionId, examSessionId, ciaRound and courseCode are required' },
        { status: 400 }
      );
    }

    const institutionCode = await resolveCoeInstitutionCode(institutionId);
    if (!institutionCode) {
      return NextResponse.json({ error: 'Institution not mapped in COE' }, { status: 404 });
    }

    // Widen the staff-plan window to the round's assessment period so a faculty
    // whose plan ended with the semester can still enter that semester's marks.
    const guard = await guardMarkEntryScope(supabase, user.id, scope.isSuperAdmin, scope.role, {
      courseCode,
      programCode,
      sessionFrom: searchParams.get('sessionFrom'),
      sessionTo: searchParams.get('sessionTo'),
    });
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status ?? 403 });
    }

    const client = CoeRestClient.create();

    // Deliberately NO program_code filter — that is what lets a shared paper
    // authored under one program serve every other program taking the course.
    const listed = await client.get<{ data: IaQuestionPaper[] }>(
      '/api/v1/ia/question-papers',
      {
        institution_code: institutionCode,
        examination_session_id: examSessionId,
        cia_round: ciaRound,
        course_code: courseCode,
      }
    );

    const candidates = (listed?.data ?? []).map((p) => ({
      ...p,
      set_number: p.set_number ?? 1,
      authored: p.authored !== false,
    }));

    // rankPapers drops drafts (COE refuses marks against them). Capture what it
    // dropped BEFORE filtering, so the UI can distinguish "no paper exists" from
    // "the paper is written but nobody has submitted it".
    const drafts = candidates.filter(
      (p) => !isEntryEligible(p.status) && (!p.cia_setting_id || !ciaSettingId || p.cia_setting_id === ciaSettingId)
    );
    const ranked = rankPapers(candidates, ciaSettingId);
    const draftOnly = ranked.length === 0 && drafts.length > 0;
    const draftSetLabels = drafts.map((p) => p.set_label ?? String(p.set_number));

    const options: MarkEntryPaperOption[] = ranked.map((p) => ({
      id: p.id,
      set_number: p.set_number,
      set_label: p.set_label,
      status: p.status,
      authored: p.authored !== false,
      program_code: p.program_code,
      is_shared: !!programCode && !!p.program_code && p.program_code !== programCode,
    }));

    // Honour an explicit set choice, but never let a paperId from another course
    // slip through — it would file marks against the wrong questions.
    const picked = paperId ? ranked.find((p) => p.id === paperId) : ranked[0];
    if (!picked) {
      return NextResponse.json({
        data: {
          options,
          paper: null,
          access: guard.access,
          draft_only: draftOnly,
          draft_set_labels: draftOnly ? draftSetLabels : undefined,
        } as MarkEntryPaperResponse,
      });
    }

    const detailRes = await client.get<{ data: IaQuestionPaperDetail }>(
      `/api/v1/ia/question-papers/${picked.id}`
    );
    const detail = detailRes?.data;
    if (!detail || detail.course_code !== courseCode) {
      return NextResponse.json(
        { error: 'Resolved paper does not match the requested course' },
        { status: 409 }
      );
    }

    const { questions, parts, questionsTotal } = buildEntryPaper(
      detail.questions ?? [],
      detail.template_parts ?? []
    );

    const payload: MarkEntryPaperResponse = {
      options,
      access: guard.access,
      draft_only: false,
      paper: {
        id: detail.id,
        course_code: detail.course_code ?? courseCode,
        subject_title: detail.subject_title,
        set_number: detail.set_number ?? 1,
        set_label: detail.set_label,
        status: detail.status,
        max_marks: Number(detail.max_marks ?? 0),
        questions_total: questionsTotal,
        questions,
        parts,
        program_code: detail.program_code,
        is_shared:
          !!programCode && !!detail.program_code && detail.program_code !== programCode,
      },
    };

    return NextResponse.json({ data: payload });
  } catch (error) {
    if (error instanceof CoeApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[mark-entry/paper] GET error:', error);
    return NextResponse.json({ error: 'Failed to resolve question paper' }, { status: 500 });
  }
}
