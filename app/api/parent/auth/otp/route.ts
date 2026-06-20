import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { sendOtp } from '@/lib/services/auth/parent-otp-service';
import {
  findLearnerByAdmissionAndMobile,
  findLearnersByMobile,
  normalizeMobile,
  admissionNumber,
  fullName,
} from '@/lib/utils/parent-identifier';
import type { SendOtpPayload, SiblingCandidate } from '@/types/parent-portal';

export const runtime = 'nodejs';

// Generic success-shaped response used whenever we DON'T want to confirm whether
// the supplied details exist (no enumeration leak). The client always shows
// "If the details match, an OTP has been sent."
function genericOk() {
  return NextResponse.json({ ok: true });
}

/**
 * POST /api/parent/auth/otp — send an OTP.
 * Body: { mobile, admission?, purpose }
 *  - register / add_sibling: require admission+mobile to match a learner, and
 *    return sibling candidates (other learners sharing that mobile).
 *  - reset: require an existing account for that mobile.
 */
export async function POST(req: NextRequest) {
  let body: SendOtpPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const mobile = normalizeMobile(body.mobile);
  const purpose = body.purpose;
  if (!mobile || mobile.length < 10) return genericOk();

  const db = createServiceRoleClient();

  if (purpose === 'register' || purpose === 'add_sibling') {
    const admission = (body.admission ?? '').trim();
    if (!admission) return genericOk();

    const match = await findLearnerByAdmissionAndMobile(db, admission, mobile);
    if (!match) return genericOk(); // details don't pair → stay generic

    if (purpose === 'register') {
      // Block re-registration when this STUDENT already has an account.
      const { data: existing } = await db
        .from('pp_parent_accounts')
        .select('id, password_hash')
        .eq('learner_profile_id', match.learner.id)
        .maybeSingle();
      if ((existing as unknown as { password_hash?: string } | null)?.password_hash) {
        return NextResponse.json(
          { ok: false, error: 'An account already exists for this student. Please log in.' },
          { status: 409 }
        );
      }
    }

    // Offer siblings sharing the mobile (the parent's own children).
    const siblings = await findLearnersByMobile(db, mobile);
    const candidates: SiblingCandidate[] = siblings
      .filter((s) => s.id !== match.learner.id && s.institution_id)
      .map((s) => ({
        learnerProfileId: s.id,
        fullName: fullName(s),
        admissionNumber: admissionNumber(s),
        institutionsId: s.institution_id as string,
      }));

    const result = await sendOtp(mobile, purpose);
    return NextResponse.json({
      ok: true,
      matchedLearner: {
        learnerProfileId: match.learner.id,
        fullName: fullName(match.learner),
        admissionNumber: admissionNumber(match.learner),
        relationship: match.relationship,
      },
      siblings: candidates,
      ...(result.devCode ? { devCode: result.devCode } : {}),
    });
  }

  if (purpose === 'reset') {
    // An account exists if any learner sharing this mobile has a pp_parent_accounts row.
    const family = await findLearnersByMobile(db, mobile);
    const ids = family.map((l) => l.id);
    let account = null as { id: string } | null;
    if (ids.length) {
      const { data } = await db
        .from('pp_parent_accounts')
        .select('id')
        .in('learner_profile_id', ids)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      account = (data as unknown as { id: string } | null) ?? null;
    }
    // Only actually send when an account exists, but always return generic.
    if (account) {
      const result = await sendOtp(mobile, 'reset');
      return NextResponse.json({ ok: true, ...(result.devCode ? { devCode: result.devCode } : {}) });
    }
    return genericOk();
  }

  return genericOk();
}
