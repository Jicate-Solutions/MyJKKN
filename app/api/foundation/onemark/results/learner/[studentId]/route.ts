export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseLearnerReport } from '@/lib/services/onemark/results-service';
import { NOT_READY_MESSAGE, UUID_RE, isMissingFunction } from '../../_shared';

// OneMark — Wave 3 Lane A. One learner's report.
//
// GET /api/foundation/onemark/results/learner/[studentId]?exam=<uuid> -> { report }
//
// Payload: Lane S3's `fn_onemark_learner_report(p_student_id, p_exam_definition_id)`,
// which wraps the existing fn_fp_student_progress and adds vault state and the
// last ten sittings.
//
// NO PERMISSION GATE HERE, DELIBERATELY. The RPC's caller check is
// fn_fp_can_view_student, and that predicate admits THE LEARNER THEMSELVES —
// this route is the API behind the learner's own "My progress" card as well as
// behind the Senior Learner's report screen. Adding assessments.manage here
// would lock a learner out of their own numbers. A caller the predicate refuses
// gets the RPC's 42501, surfaced below as an explicit 403 (CLAUDE.md #27),
// never a silent redirect.

export async function GET(request: NextRequest, { params }: { params: Promise<{ studentId: string }> }) {
  await connection();
  try {
    const { studentId } = await params;
    if (!UUID_RE.test(studentId)) {
      return NextResponse.json({ error: 'studentId must be a uuid' }, { status: 400 });
    }
    const examId = request.nextUrl.searchParams.get('exam') ?? '';
    if (!UUID_RE.test(examId)) {
      return NextResponse.json({ error: 'exam must be a uuid' }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabase.rpc('fn_onemark_learner_report', {
      p_student_id: studentId,
      p_exam_definition_id: examId,
    });
    if (error) {
      if (isMissingFunction(error)) {
        return NextResponse.json({ error: NOT_READY_MESSAGE }, { status: 503 });
      }
      if (error.code === '42501') {
        return NextResponse.json(
          { error: 'You do not have access to this learner’s OneMark report.' },
          { status: 403 },
        );
      }
      if (error.code === 'P0002' || error.code === '02000') {
        return NextResponse.json({ error: 'That learner has no OneMark record.' }, { status: 404 });
      }
      throw error;
    }
    if (data === null || data === undefined) {
      return NextResponse.json({ error: 'That learner has no OneMark record.' }, { status: 404 });
    }

    return NextResponse.json({ report: parseLearnerReport(data) });
  } catch (err) {
    console.error('[onemark/results/learner/[studentId]] GET failed', err);
    return NextResponse.json(
      { error: 'Could not load this report. Please try again.' },
      { status: 500 },
    );
  }
}
