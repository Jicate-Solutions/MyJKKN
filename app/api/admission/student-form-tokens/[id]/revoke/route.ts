// app/api/admission/student-form-tokens/[id]/revoke/route.ts
//
// Manual token revocation (admission action). Path param `id` here is the
// TOKEN id; the sibling /status route also uses `[id]` but reads it as a
// learner id. Next.js requires the same dynamic segment name at a given
// depth, so we share `[id]` and disambiguate by endpoint suffix.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { StudentFormService } from '@/lib/services/admission/student-form-service';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Permission check — uses the .revoke key (stricter than .generate;
  // counselors don't get this).
  const { data: hasPerm } = await (supabase as any)
    .rpc('user_has_permission', {
      user_id: user.id,
      permission_key: 'admission.leads.student_form.revoke',
    });
  if (!hasPerm) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id: token_id } = await params;

  // Institution-scope check — find the token's learner, then verify access.
  const svc = createServiceRoleClient();
  const { data: tokenRow } = await (svc as any)
    .from('learner_self_fill_tokens')
    .select('learner_profile_id')
    .eq('id', token_id)
    .maybeSingle();
  if (!tokenRow) {
    return NextResponse.json({ error: 'Token not found' }, { status: 404 });
  }
  const { data: learner } = await (svc as any)
    .from('learners_profiles')
    .select('institution_id')
    .eq('id', tokenRow.learner_profile_id)
    .maybeSingle();
  if (!learner) {
    return NextResponse.json({ error: 'Learner not found' }, { status: 404 });
  }
  const { data: hasAccess } = await (supabase as any)
    .rpc('role_has_institution_access', { check_institution_id: learner.institution_id });
  if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    await StudentFormService.revokeToken(token_id, user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[token revoke]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
