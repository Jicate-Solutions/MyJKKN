import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { resolveParentScope, assertLearnerAccess, parentErrorResponse } from '@/lib/utils/parent-access';
import type { GatePass, CreateGatePassPayload } from '@/types/parent-portal';

export const runtime = 'nodejs';

/** GET /api/parent/gate-pass?learnerId=… */
export async function GET(req: NextRequest) {
  try {
    const scope = await resolveParentScope(req);
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const learnerId = new URL(req.url).searchParams.get('learnerId') ?? '';
    assertLearnerAccess(scope, learnerId);

    const db = createServiceRoleClient();
    const { data: rows } = await db
      .from('pp_gate_passes')
      .select('id, pass_type, reason, requested_date, requested_time, status, qr_token')
      .eq('learner_profile_id', learnerId)
      .order('requested_date', { ascending: false });

    const data: GatePass[] = (rows ?? []).map((r) => ({
      id: r.id,
      passType: r.pass_type ?? undefined,
      reason: r.reason,
      requestedDate: r.requested_date,
      requestedTime: r.requested_time ?? undefined,
      status: r.status,
      qrToken: r.status === 'approved' ? r.qr_token ?? undefined : undefined,
    }));
    return NextResponse.json({ data });
  } catch (err) {
    return parentErrorResponse(err);
  }
}

/** POST /api/parent/gate-pass — request a gate pass. */
export async function POST(req: NextRequest) {
  try {
    const scope = await resolveParentScope(req);
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = (await req.json().catch(() => ({}))) as Partial<CreateGatePassPayload>;
    const { learnerId, passType, reason, requestedDate, requestedTime, pickupMemberId } = body;
    if (!learnerId || !passType || !reason || !requestedDate)
      return NextResponse.json({ error: 'Type, reason and date are required' }, { status: 400 });
    assertLearnerAccess(scope, learnerId);
    if (requestedDate < new Date().toISOString().slice(0, 10))
      return NextResponse.json({ error: 'Date cannot be in the past' }, { status: 400 });

    const db = createServiceRoleClient();
    const { data: learner } = await db
      .from('learners_profiles')
      .select('institution_id')
      .eq('id', learnerId)
      .maybeSingle();
    if (!learner?.institution_id) return NextResponse.json({ error: 'Learner not found' }, { status: 404 });

    const { error } = await db.from('pp_gate_passes').insert({
      institutions_id: learner.institution_id,
      learner_profile_id: learnerId,
      parent_account_id: scope.parentAccountId,
      pass_type: passType,
      reason,
      requested_date: requestedDate,
      requested_time: requestedTime ?? null,
      pickup_member_id: pickupMemberId ?? null,
    });
    if (error) return NextResponse.json({ error: 'Failed to request pass' }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return parentErrorResponse(err);
  }
}
