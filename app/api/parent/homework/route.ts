import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { resolveParentScope, assertLearnerAccess, parentErrorResponse } from '@/lib/utils/parent-access';
import { listHomework } from '@/lib/services/parent/parent-homework-builder';

export const runtime = 'nodejs';

/** GET /api/parent/homework?learnerId=… — homework for the learner's section. */
export async function GET(req: NextRequest) {
  try {
    const scope = await resolveParentScope(req);
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const learnerId = new URL(req.url).searchParams.get('learnerId') ?? '';
    assertLearnerAccess(scope, learnerId);

    const db = createServiceRoleClient();
    const { data: learner } = await db
      .from('learners_profiles')
      .select('section_id, institution_id')
      .eq('id', learnerId)
      .maybeSingle();

    const data = await listHomework(db, learnerId, learner?.section_id ?? null, learner?.institution_id ?? null);
    return NextResponse.json({ data });
  } catch (err) {
    return parentErrorResponse(err);
  }
}
