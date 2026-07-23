import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CoeRestClient, CoeApiError } from '@/lib/services/coe/coe-rest-client';
import {
  resolveInternalMarksAccess,
  resolveEffectiveInstitutionId,
  resolveCoeInstitutionCode,
} from '@/lib/utils/internal-marks/internal-marks-access';
import { resolveQpScope } from '@/lib/utils/question-papers/qp-scope';
import { getCoeCourseCategoryMap } from '@/lib/utils/question-papers/coe-course-categories';
import type { IaQuestionPaper } from '@/types/ia-question-paper';

/**
 * /api/question-papers — proxy to COE /api/v1/ia/question-papers.
 *
 * GET  → list papers for a (COE) institution, optionally filtered.
 * POST → bulk-scaffold papers from the applicable template for a program+semester+round.
 *
 * Institution scoping (incl. CAS SF+Aided → single COE institution) is enforced
 * by resolving the MyJKKN institution UUID to the COE institution_code. Fine-grained
 * per-course paper-setter scoping is deferred to a later phase; access here is
 * institution-scoped and the UI gates actions by permission.
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
    const institutionId = resolveEffectiveInstitutionId(
      scope,
      searchParams.get('institutionId')
    );
    if (!institutionId) {
      return NextResponse.json({ error: 'Institution ID is required' }, { status: 400 });
    }

    const institutionCode = await resolveCoeInstitutionCode(institutionId);
    if (!institutionCode) {
      return NextResponse.json({ error: 'Institution not mapped in COE' }, { status: 404 });
    }

    const params: Record<string, string> = { institution_code: institutionCode };
    const passthrough = ['examination_session_id', 'cia_round', 'program_code', 'semester', 'status'];
    for (const key of passthrough) {
      const value = searchParams.get(key);
      if (value) params[key] = value;
    }

    // Visibility scope:
    //   faculty (course tier)      → only their assigned course codes
    //   any staff member with plans → only their own program(s); must pick one
    //   super_admin / admin w/o plans → the whole institution
    const qpScope = await resolveQpScope(supabase, user.id, scope.isSuperAdmin, scope.role);
    if (qpScope.level === 'course') {
      if (qpScope.courseCodes.length === 0) return NextResponse.json({ data: [] });
      params.course_code = qpScope.courseCodes.join(',');
    } else if (qpScope.programCodes.length > 0) {
      // Limited to their own program(s) — never the whole institution.
      if (!params.program_code || !qpScope.programCodes.includes(params.program_code)) {
        return NextResponse.json({ data: [] });
      }
    }

    const client = CoeRestClient.create();
    // COE ia/* endpoints wrap their payload in { data }. Unwrap so MyJKKN's own
    // { data } contract carries the array, not a nested envelope.
    const coe = await client.get<{ data: IaQuestionPaper[] }>('/api/v1/ia/question-papers', params);
    let list = coe?.data ?? [];

    // Enrich with the authoritative COE courses.course_category so the UI can
    // filter theory vs practical exactly (the IA list endpoint doesn't return it).
    // Non-fatal: on failure papers carry no category and are shown (fail open).
    try {
      const categoryMap = await getCoeCourseCategoryMap(institutionCode);
      list = list.map((p) => ({
        ...p,
        course_category: p.course_code ? categoryMap.get(p.course_code) : undefined,
      }));
    } catch (e) {
      console.warn('[question-papers] course_category enrichment failed:', e);
    }

    return NextResponse.json({ data: list });
  } catch (error) {
    if (error instanceof CoeApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[question-papers] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch question papers' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
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
    const body = await request.json();
    const institutionId = resolveEffectiveInstitutionId(scope, body.institutionId ?? null);
    if (!institutionId) {
      return NextResponse.json({ error: 'Institution ID is required' }, { status: 400 });
    }
    if (!body.examSessionId || !body.programCode || body.semester == null) {
      return NextResponse.json(
        { error: 'examSessionId, programCode and semester are required' },
        { status: 400 }
      );
    }

    const institutionCode = await resolveCoeInstitutionCode(institutionId);
    if (!institutionCode) {
      return NextResponse.json({ error: 'Institution not mapped in COE' }, { status: 404 });
    }

    const client = CoeRestClient.create();
    const coe = await client.post<{ data: { created: number; skipped: number } }>(
      '/api/v1/ia/question-papers',
      {
        institution_code: institutionCode,
        examination_session_id: body.examSessionId,
        program_code: body.programCode,
        semester: body.semester,
        cia_round: body.ciaRound ?? 1,
        cia_round_name: body.ciaRoundName ?? null,
        cia_setting_id: body.ciaSettingId ?? null,
        template_id: body.templateId ?? null,
        // Stamp the MyJKKN user as the author/provenance for the generated shells.
        author_id: user.id,
      }
    );
    return NextResponse.json({ data: coe?.data }, { status: 201 });
  } catch (error) {
    if (error instanceof CoeApiError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status }
      );
    }
    console.error('[question-papers] POST error:', error);
    return NextResponse.json({ error: 'Failed to generate question papers' }, { status: 500 });
  }
}
