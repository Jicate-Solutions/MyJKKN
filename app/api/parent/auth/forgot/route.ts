import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { hashPassword } from '@/lib/auth/parent-password';
import { verifyOtp } from '@/lib/services/auth/parent-otp-service';
import { normalizeMobile, findLearnersByMobile } from '@/lib/utils/parent-identifier';
import type { ForgotPayload } from '@/types/parent-portal';

export const runtime = 'nodejs';

/** POST /api/parent/auth/forgot — reset password after OTP verification. */
export async function POST(req: NextRequest) {
  let body: ForgotPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const mobile = normalizeMobile(body.mobile);
  const otp = (body.otp ?? '').trim();
  const password = body.password ?? '';

  if (!mobile || !otp || password.length < 8) {
    return NextResponse.json(
      { error: 'Mobile, OTP and an 8+ character password are required.' },
      { status: 400 }
    );
  }

  const otpResult = await verifyOtp(mobile, 'reset', otp);
  if (!otpResult.ok) {
    return NextResponse.json({ error: 'Invalid or expired OTP.' }, { status: 400 });
  }

  const db = createServiceRoleClient();

  // Family = all students sharing this mobile (live). Reset the shared password
  // on all their accounts so father & mother stay in sync.
  const family = await findLearnersByMobile(db, mobile);
  const learnerIds = family.map((l) => l.id);
  if (!learnerIds.length) return NextResponse.json({ ok: true });

  await db
    .from('pp_parent_accounts')
    .update({ password_hash: await hashPassword(password) })
    .in('learner_profile_id', learnerIds);

  return NextResponse.json({ ok: true });
}
