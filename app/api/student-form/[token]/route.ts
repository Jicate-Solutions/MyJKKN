// app/api/student-form/[token]/route.ts
//
// PUBLIC — no auth. HMAC validates the token. Service-role writes; the
// column whitelist (lib/services/admission/student-form-write-whitelist.ts)
// is the security boundary.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { StudentFormService } from '@/lib/services/admission/student-form-service';
import {
  STUDENT_WRITABLE_COLUMNS,
  type StudentSection,
} from '@/lib/services/admission/student-form-write-whitelist';

const READABLE_COLUMNS = [
  ...STUDENT_WRITABLE_COLUMNS.basic,
  ...STUDENT_WRITABLE_COLUMNS.academic,
  ...STUDENT_WRITABLE_COLUMNS.contact,
  // Pre-filled from conversion bridge — student sees but doesn't edit:
  'institution_id',
];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;
  let ctx;
  try {
    ctx = await StudentFormService.validateToken(decodeURIComponent(token));
  } catch (e) {
    return mapErrorToResponse(e instanceof Error ? e.message : 'invalid');
  }

  const svc = createServiceRoleClient();
  const { data: learner, error } = await (svc as any)
    .from('learners_profiles')
    .select(READABLE_COLUMNS.join(','))
    .eq('id', ctx.learner_profile_id)
    .single();
  if (error || !learner) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }

  return NextResponse.json({
    learner,
    section_progress: ctx.section_progress,
    expires_at: ctx.expires_at,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;
  let body: { section: StudentSection; fields: Record<string, unknown>; final: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!['basic', 'academic', 'contact'].includes(body.section)) {
    return NextResponse.json({ error: 'Invalid section' }, { status: 400 });
  }

  try {
    await StudentFormService.saveSection(
      decodeURIComponent(token),
      body.section,
      body.fields ?? {},
      body.final === true,
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return mapErrorToResponse(e instanceof Error ? e.message : 'invalid');
  }
}

function mapErrorToResponse(msg: string): NextResponse {
  // Bad-token signals (HMAC fail, malformed, missing row, id mismatch) → 401
  if ([
    'malformed_token', 'bad_signature', 'bad_payload',
    'token_not_found', 'token_id_mismatch',
  ].includes(msg)) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 });
  }
  // Lifecycle terminal states → 410 Gone
  if (['expired', 'consumed', 'superseded'].includes(msg)) {
    return NextResponse.json({ error: msg }, { status: 410 });
  }
  console.error('[student-form]', msg);
  return NextResponse.json({ error: 'server_error' }, { status: 500 });
}
