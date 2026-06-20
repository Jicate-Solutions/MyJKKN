import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { resolveParentScope, assertLearnerAccess, parentErrorResponse } from '@/lib/utils/parent-access';
import type { PickupMember, CreatePickupMemberPayload } from '@/types/parent-portal';

export const runtime = 'nodejs';

/** GET /api/parent/pickup-members — authorised pickup persons for this parent. */
export async function GET(req: NextRequest) {
  try {
    const scope = await resolveParentScope(req);
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = createServiceRoleClient();
    const { data: rows } = await db
      .from('pp_pickup_members')
      .select('id, name, relationship, contact_no, photo_url')
      .eq('parent_account_id', scope.parentAccountId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    const data: PickupMember[] = (rows ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      relationship: r.relationship ?? undefined,
      contactNo: r.contact_no ?? undefined,
      photoUrl: r.photo_url ?? undefined,
    }));
    return NextResponse.json({ data });
  } catch (err) {
    return parentErrorResponse(err);
  }
}

/** POST /api/parent/pickup-members — add an authorised pickup person. */
export async function POST(req: NextRequest) {
  try {
    const scope = await resolveParentScope(req);
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = (await req.json().catch(() => ({}))) as Partial<CreatePickupMemberPayload>;
    if (!body.name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });

    // Institution comes from one of the parent's verified learners.
    if (body.learnerId) assertLearnerAccess(scope, body.learnerId);
    const targetLearner = body.learnerId ?? scope.learnerIds[0];
    if (!targetLearner) return NextResponse.json({ error: 'No linked learner' }, { status: 400 });

    const db = createServiceRoleClient();
    const { data: learner } = await db
      .from('learners_profiles')
      .select('institution_id')
      .eq('id', targetLearner)
      .maybeSingle();
    if (!learner?.institution_id) return NextResponse.json({ error: 'Learner not found' }, { status: 404 });

    const { error } = await db.from('pp_pickup_members').insert({
      institutions_id: learner.institution_id,
      parent_account_id: scope.parentAccountId,
      learner_profile_id: body.learnerId ?? null,
      name: body.name.trim(),
      relationship: body.relationship ?? null,
      contact_no: body.contactNo ?? null,
    });
    if (error) return NextResponse.json({ error: 'Failed to add member' }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return parentErrorResponse(err);
  }
}
