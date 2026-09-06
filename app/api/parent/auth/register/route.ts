import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { hashPassword } from '@/lib/auth/parent-password';
import {
  signParentSession,
  PARENT_SESSION_COOKIE,
  parentSessionCookieOptions,
} from '@/lib/auth/parent-jwt';
import { verifyOtp } from '@/lib/services/auth/parent-otp-service';
import { findLearnerByAdmissionAndMobile, normalizeMobile } from '@/lib/utils/parent-identifier';
import type { RegisterPayload } from '@/types/parent-portal';

export const runtime = 'nodejs';

/**
 * Per-student registration: verify OTP, confirm admission+mobile pair a learner,
 * then create/set ONE pp_parent_accounts row for that student (shared password).
 * Siblings are NOT linked here — they resolve live (shared parent mobile) once
 * logged in. Both father & mother use this one account + password.
 */
export async function POST(req: NextRequest) {
  let body: RegisterPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const mobile = normalizeMobile(body.mobile);
  const admission = (body.admission ?? '').trim();
  const otp = (body.otp ?? '').trim();
  const password = body.password ?? '';

  if (!mobile || !admission || !otp || password.length < 8) {
    return NextResponse.json(
      { error: 'Mobile, admission number, OTP and an 8+ character password are required.' },
      { status: 400 }
    );
  }

  const db = createServiceRoleClient();

  // 1. Verify the OTP (single-use, 5-min, attempt-capped).
  const otpResult = await verifyOtp(mobile, 'register', otp);
  if (!otpResult.ok) {
    return NextResponse.json({ error: 'Invalid or expired OTP.' }, { status: 400 });
  }

  // 2. Re-confirm the admission+mobile pairing server-side.
  const match = await findLearnerByAdmissionAndMobile(db, admission, mobile);
  if (!match) {
    return NextResponse.json({ error: 'We could not verify those details.' }, { status: 400 });
  }
  const learnerId = match.learner.id;

  // 3. Block re-registration of an already-active account for this student.
  const { data: existingRow } = await db
    .from('pp_parent_accounts')
    .select('id, password_hash')
    .eq('learner_profile_id', learnerId)
    .maybeSingle();
  const existing = existingRow as unknown as { id: string; password_hash: string } | null;
  if (existing?.password_hash) {
    return NextResponse.json(
      { error: 'An account already exists for this student. Please log in.' },
      { status: 409 }
    );
  }

  // 4. Create/set the student's account (one row per student, shared password).
  const password_hash = await hashPassword(password);
  const { data: acctRow, error } = await db
    .from('pp_parent_accounts')
    .upsert(
      { learner_profile_id: learnerId, password_hash, is_active: true },
      { onConflict: 'learner_profile_id' }
    )
    .select('id, learner_profile_id')
    .single();
  const account = acctRow as unknown as { id: string; learner_profile_id: string } | null;
  if (error || !account) {
    return NextResponse.json({ error: 'Failed to create account.' }, { status: 500 });
  }

  // 5. Issue the session.
  const token = await signParentSession({
    sub: account.id,
    learnerProfileId: account.learner_profile_id,
  });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(PARENT_SESSION_COOKIE, token, parentSessionCookieOptions());
  return res;
}
