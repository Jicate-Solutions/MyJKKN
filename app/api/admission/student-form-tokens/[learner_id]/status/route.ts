// app/api/admission/student-form-tokens/[learner_id]/status/route.ts
//
// Polling endpoint for the admission QR dialog. Returns the latest token
// status for a learner so the dialog can auto-close when student submits.
// Auth-only (admission users); no service-role write — read only.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ learner_id: string }> },
): Promise<NextResponse> {
  const { learner_id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Institution-scope check — user must have access to this learner's
  // institution. Same pattern as the token-generate endpoint.
  const svc = createServiceRoleClient();
  const { data: learner, error: learnerErr } = await (svc as any)
    .from('learners_profiles')
    .select('institution_id, is_profile_complete')
    .eq('id', learner_id)
    .maybeSingle();
  if (learnerErr || !learner) {
    return NextResponse.json({ error: 'Learner not found' }, { status: 404 });
  }
  const { data: hasAccess } = await (supabase as any)
    .rpc('role_has_institution_access', { check_institution_id: learner.institution_id });
  if (!hasAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Latest token (any status)
  const { data: token } = await (svc as any)
    .from('learner_self_fill_tokens')
    .select('id, status, expires_at, consumed_at, section_progress')
    .eq('learner_profile_id', learner_id)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    token: token ?? null,
    is_profile_complete: learner.is_profile_complete ?? false,
  });
}
