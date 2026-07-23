import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { resolveParentScope, assertLearnerAccess, parentErrorResponse } from '@/lib/utils/parent-access';
import type { LeaveRequest, CreateLeavePayload } from '@/types/parent-portal';

export const runtime = 'nodejs';

/** GET /api/parent/leaves?learnerId=… */
export async function GET(req: NextRequest) {
  try {
    const scope = await resolveParentScope(req);
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const learnerId = new URL(req.url).searchParams.get('learnerId') ?? '';
    assertLearnerAccess(scope, learnerId);

    const db = createServiceRoleClient();
    const { data: rows } = await db
      .from('pp_leave_requests')
      .select('id, leave_type, from_date, to_date, reason, status')
      .eq('learner_profile_id', learnerId)
      .order('from_date', { ascending: false });

    const data: LeaveRequest[] = (rows ?? []).map((r) => ({
      id: r.id,
      leaveType: r.leave_type,
      fromDate: r.from_date,
      toDate: r.to_date,
      reason: r.reason,
      status: r.status,
    }));
    return NextResponse.json({ data });
  } catch (err) {
    return parentErrorResponse(err);
  }
}

/** POST /api/parent/leaves — request leave. */
export async function POST(req: NextRequest) {
  try {
    const scope = await resolveParentScope(req);
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = (await req.json().catch(() => ({}))) as Partial<CreateLeavePayload>;
    const { learnerId, leaveType, fromDate, toDate, reason } = body;
    if (!learnerId || !leaveType || !fromDate || !toDate || !reason)
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    if (toDate < fromDate)
      return NextResponse.json({ error: 'End date must be on/after start date' }, { status: 400 });
    assertLearnerAccess(scope, learnerId);

    const db = createServiceRoleClient();
    const { data: learner } = await db
      .from('learners_profiles')
      .select('institution_id')
      .eq('id', learnerId)
      .maybeSingle();
    if (!learner?.institution_id) return NextResponse.json({ error: 'Learner not found' }, { status: 404 });

    const { error } = await db.from('pp_leave_requests').insert({
      institutions_id: learner.institution_id,
      learner_profile_id: learnerId,
      parent_account_id: scope.parentAccountId,
      leave_type: leaveType,
      from_date: fromDate,
      to_date: toDate,
      reason,
    });
    if (error) return NextResponse.json({ error: 'Failed to request leave' }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return parentErrorResponse(err);
  }
}
