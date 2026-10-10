import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CoeRestClient, CoeApiError } from '@/lib/services/coe/coe-rest-client';
import {
  resolveInternalMarksAccess,
  resolveEffectiveInstitutionId,
  resolveCoeInstitutionId,
  fetchInstitutionRegisterNumbers,
} from '@/lib/utils/internal-marks/internal-marks-access';
import { flattenReportExtraMarks } from '@/lib/utils/internal-marks/flatten-extra-marks';
import type { CiaReportResponse } from '@/types/internal-marks';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scope = await resolveInternalMarksAccess(user.id);
    const { searchParams } = new URL(request.url);
    const institutionId = resolveEffectiveInstitutionId(scope, searchParams.get('institutionId'));
    const examSessionId = searchParams.get('examSessionId');
    const courseCode = searchParams.get('courseCode');
    const ciaRound = searchParams.get('ciaRound');
    const programCode = searchParams.get('programCode');
    const semester = searchParams.get('semester');

    if (!institutionId || !examSessionId || !courseCode || !ciaRound) {
      return NextResponse.json({ error: 'institutionId, examSessionId, courseCode, ciaRound are required' }, { status: 400 });
    }

    const coeInstitutionId = await resolveCoeInstitutionId(institutionId);
    if (!coeInstitutionId) {
      return NextResponse.json({ error: 'Institution not mapped in COE' }, { status: 404 });
    }

    const client = CoeRestClient.create();
    const raw = await client.get<CiaReportResponse>('/api/v1/cia-marks/report', {
      institutions_id: coeInstitutionId,
      examination_session_id: examSessionId,
      course_code: courseCode,
      cia_round: ciaRound,
      program_code: programCode ?? undefined,
      semester: semester ?? undefined,
    });
    const data = flattenReportExtraMarks(raw);

    // Filter learners by user's MyJKKN institution (Aided/SF separation)
    if (institutionId && data?.learners?.length > 0) {
      const myRegNos = await fetchInstitutionRegisterNumbers(institutionId);

      if (myRegNos) {
        data.learners = data.learners.filter(
          (l) => myRegNos.has(l.register_number)
        );
        // Update summary counts
        data.summary.total_learners = data.learners.length;
        data.summary.marks_entered = data.learners.filter((l) => l.total > 0).length;
        data.summary.pending = data.summary.total_learners - data.summary.marks_entered;
      }
    }

    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof CoeApiError) {
      return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
    }
    console.error('[internal-marks/report] error:', error);
    return NextResponse.json({ error: 'Failed to fetch report' }, { status: 500 });
  }
}
