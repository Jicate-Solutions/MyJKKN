import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { resolveParentScope, assertLearnerAccess, parentErrorResponse } from '@/lib/utils/parent-access';
import type { Concern, CreateConcernPayload } from '@/types/parent-portal';

export const runtime = 'nodejs';

/** GET /api/parent/concerns — all concerns raised by this parent. */
export async function GET(req: NextRequest) {
  try {
    const scope = await resolveParentScope(req);
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = createServiceRoleClient();
    const { data: rows } = await db
      .from('pp_concerns')
      .select('id, category, subject, status, priority, created_at, updated_at')
      .eq('parent_account_id', scope.parentAccountId)
      .order('updated_at', { ascending: false });

    const data: Concern[] = (rows ?? []).map((r) => ({
      id: r.id,
      category: r.category ?? undefined,
      subject: r.subject,
      status: r.status,
      priority: r.priority,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
    return NextResponse.json({ data });
  } catch (err) {
    return parentErrorResponse(err);
  }
}

/** POST /api/parent/concerns — raise a concern (opens a thread with first message). */
export async function POST(req: NextRequest) {
  try {
    const scope = await resolveParentScope(req);
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = (await req.json().catch(() => ({}))) as Partial<CreateConcernPayload>;
    const { learnerId, category, subject, message } = body;
    if (!learnerId || !subject || !message)
      return NextResponse.json({ error: 'Subject and message are required' }, { status: 400 });
    assertLearnerAccess(scope, learnerId);

    const db = createServiceRoleClient();
    const { data: learner } = await db
      .from('learners_profiles')
      .select('institution_id')
      .eq('id', learnerId)
      .maybeSingle();
    if (!learner?.institution_id) return NextResponse.json({ error: 'Learner not found' }, { status: 404 });

    const { data: concern, error } = await db
      .from('pp_concerns')
      .insert({
        institutions_id: learner.institution_id,
        parent_account_id: scope.parentAccountId,
        learner_profile_id: learnerId,
        category: category ?? 'other',
        subject,
      })
      .select('id')
      .single();
    if (error || !concern) return NextResponse.json({ error: 'Failed to create concern' }, { status: 500 });

    await db.from('pp_concern_messages').insert({
      concern_id: concern.id,
      sender_type: 'parent',
      sender_id: scope.parentAccountId,
      message,
    });

    return NextResponse.json({ ok: true, id: concern.id });
  } catch (err) {
    return parentErrorResponse(err);
  }
}
