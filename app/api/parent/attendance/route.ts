import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  resolveParentScope,
  assertLearnerAccess,
  parentErrorResponse,
} from '@/lib/utils/parent-access';
import { buildAttendanceSummary } from '@/lib/services/parent/parent-attendance-builder';

export const runtime = 'nodejs';

/** GET /api/parent/attendance?learnerId=…  — day-based attendance summary. */
export async function GET(req: NextRequest) {
  try {
    const scope = await resolveParentScope(req);
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const learnerId = new URL(req.url).searchParams.get('learnerId') ?? '';
    assertLearnerAccess(scope, learnerId);

    const db = createServiceRoleClient();
    // Default to the learner's current semester; allow ?semesterId= override.
    const requestedSemester = new URL(req.url).searchParams.get('semesterId');
    const { data: learner } = await db
      .from('learners_profiles')
      .select('semester_id, section_id, institution_id, academic_year_id')
      .eq('id', learnerId)
      .maybeSingle();

    const summary = await buildAttendanceSummary(db, {
      learnerId,
      semesterId: requestedSemester || learner?.semester_id || null,
      sectionId: learner?.section_id ?? null,
      institutionId: learner?.institution_id ?? null,
      academicYearId: learner?.academic_year_id ?? null,
    });

    return NextResponse.json(summary);
  } catch (err) {
    return parentErrorResponse(err);
  }
}
