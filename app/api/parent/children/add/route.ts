import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { resolveParentScope, parentErrorResponse } from '@/lib/utils/parent-access';
import { verifyOtp } from '@/lib/services/auth/parent-otp-service';
import { findLearnerByAdmissionAndMobile } from '@/lib/utils/parent-identifier';
import type { AddSiblingPayload } from '@/types/parent-portal';

export const runtime = 'nodejs';

/**
 * POST /api/parent/children/add — link a sibling to the logged-in parent.
 * Body: { admission, otp }. OTP (purpose 'add_sibling') must have been sent to
 * the parent's registered mobile via /api/parent/auth/otp first. The admission
 * must pair with that same mobile (re-verified server-side).
 */
export async function POST(req: NextRequest) {
  try {
    const scope = await resolveParentScope(req);
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as Partial<AddSiblingPayload>;
    const admission = (body.admission ?? '').trim();
    const otp = (body.otp ?? '').trim();
    if (!admission || otp.length !== 6)
      return NextResponse.json({ error: 'Admission number and 6-digit OTP are required' }, { status: 400 });

    const otpResult = await verifyOtp(scope.mobile, 'add_sibling', otp);
    if (!otpResult.ok) return NextResponse.json({ error: 'Invalid or expired OTP.' }, { status: 400 });

    const db = createServiceRoleClient();
    const match = await findLearnerByAdmissionAndMobile(db, admission, scope.mobile);
    if (!match || !match.learner.institution_id)
      return NextResponse.json({ error: 'We could not verify those details.' }, { status: 400 });

    if (scope.learnerIds.includes(match.learner.id))
      return NextResponse.json({ error: 'This child is already linked.' }, { status: 409 });

    const { error } = await db.from('pp_parent_learner_links').insert({
      parent_account_id: scope.parentAccountId,
      learner_profile_id: match.learner.id,
      institutions_id: match.learner.institution_id,
      relationship: match.relationship,
      is_verified: true,
      verified_at: new Date().toISOString(),
      is_primary: false,
    });
    if (error) return NextResponse.json({ error: 'Failed to link sibling' }, { status: 500 });

    return NextResponse.json({ ok: true, learnerProfileId: match.learner.id });
  } catch (err) {
    return parentErrorResponse(err);
  }
}
