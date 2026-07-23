import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { resolveParentScope, parentErrorResponse } from '@/lib/utils/parent-access';
import type { CreateFeedbackPayload } from '@/types/parent-portal';

export const runtime = 'nodejs';

/** POST /api/parent/feedback — Report Issue / Suggest / Appreciate / Question / Rating. */
export async function POST(req: NextRequest) {
  try {
    const scope = await resolveParentScope(req);
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = (await req.json().catch(() => ({}))) as Partial<CreateFeedbackPayload>;
    if (!body.type) return NextResponse.json({ error: 'Type required' }, { status: 400 });

    const db = createServiceRoleClient();
    const { data: learner } = await db
      .from('learners_profiles')
      .select('institution_id')
      .eq('id', scope.learnerIds[0] ?? '')
      .maybeSingle();
    if (!learner?.institution_id) return NextResponse.json({ error: 'No linked learner' }, { status: 400 });

    const { error } = await db.from('pp_feedback').insert({
      institutions_id: learner.institution_id,
      parent_account_id: scope.parentAccountId,
      type: body.type,
      rating: body.rating ?? null,
      message: body.message ?? null,
    });
    if (error) return NextResponse.json({ error: 'Failed to submit feedback' }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return parentErrorResponse(err);
  }
}
