export const dynamic = 'force-dynamic';

import { NextResponse, connection } from 'next/server';
import { getAuthSession } from '@/lib/supabase/server';
import { ServiceRequestApprovalService } from '@/lib/services/service-requests/service-request-approval-service';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET() {
  await connection();
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's role + institution for scoping
    const supabase = await createServerSupabaseClient();
    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('role, institution_id')
      .eq('id', session.user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    // Same scoping rule as /api/service-requests/approvals: cross-institutional
    // users (super_admin, or roles with institution_scope='all' like CAO)
    // see every institution; everyone else is pinned to their own.
    const isSuperAdmin = profile.role === 'super_admin';

    const { data: userCustomRole } = await (supabase as any)
      .from('custom_roles')
      .select('institution_scope')
      .eq('role_key', profile.role)
      .eq('institution_scope', 'all')
      .maybeSingle();
    const isCrossInstitutional = isSuperAdmin || !!userCustomRole;

    const scopeInstitutionId = isCrossInstitutional
      ? undefined
      : (profile.institution_id || undefined);

    const count = await ServiceRequestApprovalService.getPendingApprovalCount(
      profile.role,
      session.user.id,
      scopeInstitutionId
    );

    return NextResponse.json({ count });
  } catch (error) {
    console.error('[service-requests/approvals/count] GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
