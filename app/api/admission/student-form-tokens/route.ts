// app/api/admission/student-form-tokens/route.ts
//
// Admission-side: generate a fresh student-form token for a converted
// learner. Returns the URL the QR component encodes plus the expiry
// timestamp for the countdown UI.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';   // need crypto (HMAC) — not Edge

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { StudentFormService } from '@/lib/services/admission/student-form-service';

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Auth
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (!user || authErr) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Permission check
  const { data: hasPerm } = await (supabase as any)
    .rpc('user_has_permission', {
      user_id: user.id,
      permission_key: 'admission.leads.student_form.generate'
    });
  if (!hasPerm) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 3. Parse body
  let learnerProfileId: string;
  try {
    const body = await request.json();
    if (typeof body.learner_profile_id !== 'string' || !body.learner_profile_id) {
      return NextResponse.json({ error: 'learner_profile_id required' }, { status: 400 });
    }
    learnerProfileId = body.learner_profile_id;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // 4. Generate token
  try {
    const result = await StudentFormService.generateToken(learnerProfileId, user.id);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
    return NextResponse.json({
      token_id: result.token_id,
      token_url: `${baseUrl}/student-form/${encodeURIComponent(result.token)}`,
      expires_at: result.expires_at,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    if (msg === 'learner_not_found') {
      return NextResponse.json({ error: 'Learner not found' }, { status: 404 });
    }
    if (msg === 'already_submitted') {
      return NextResponse.json(
        { error: 'Form already submitted by this student' },
        { status: 409 },
      );
    }
    console.error('[student-form-tokens POST]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
