import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { resolveParentScope, assertLearnerAccess, parentErrorResponse } from '@/lib/utils/parent-access';
import { getHomework } from '@/lib/services/parent/parent-homework-builder';

export const runtime = 'nodejs';

/** GET /api/parent/homework/[id]?learnerId=… — detail + the learner's submission. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const scope = await resolveParentScope(req);
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const learnerId = new URL(req.url).searchParams.get('learnerId') ?? '';
    assertLearnerAccess(scope, learnerId);

    const { id } = await ctx.params;
    const db = createServiceRoleClient();
    const hw = await getHomework(db, id, learnerId);
    if (!hw) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(hw);
  } catch (err) {
    return parentErrorResponse(err);
  }
}
