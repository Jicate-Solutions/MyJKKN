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
// NO PERMISSION-KEY GATE HERE, DELIBERATELY. The RPC's caller check is
// fn_fp_can_view_student, and that predicate admits THE LEARNER THEMSELVES —
// this route is the API behind the learner's own "My progress" card as well as
// behind the Senior Learner's report screen. Adding assessments.manage here
// would lock a learner out of their own numbers. A caller the predicate refuses
// gets the RPC's 42501, surfaced below as an explicit 403 (CLAUDE.md #27),
// never a silent redirect.
//
// BUT NOT "NO GATE AT ALL". This is a learner-PII endpoint taking a
// caller-supplied uuid, and `fn_onemark_learner_report` is another lane's
// unwritten SECURITY DEFINER function: if it ships without the predicate, every
// signed-in caller could read every learner's report by uuid, and nothing here
// would notice. So the route first reads the `fp_students` row through the
// SESSION client. That table's own RLS (`fp_students_select`,
// 20260706063000:118-124) is super-admin OR `profile_id = auth.uid()` OR
// `parent_profile_id = auth.uid()` OR `fn_fp_manages_school(school_id)` OR
// `fn_fp_teaches_student(id)` — the same set fn_fp_can_view_student admits, so
// this is defence in depth rather than a second, different rule, and it CANNOT
// lock out the learner (line 120 is their own row) or a school owner. Zero rows
// means the caller cannot see that learner at all: an explicit 403 that names
// the reason, never a redirect.

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

    // Defence in depth — see the header. One indexed read, RLS-scoped.
    const { data: visible, error: visibleError } = await (supabase as any)
      .from('fp_students')
      .select('id')
      .eq('id', studentId)
      .maybeSingle();
    if (visibleError) throw visibleError;
    if (!visible) {
      return NextResponse.json(
        {
          error:
            'You do not have access to this learner’s OneMark report. Ask the Foundation programme lead to record you as a JKKN owner for the school, or open your own report from OneMark practice.',
        },
        { status: 403 },
      );
    }

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
