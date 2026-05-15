export const dynamic = 'force-dynamic';

import { NextResponse , connection } from 'next/server';
import { getAuthSession } from '@/lib/supabase/server';
import { ServiceRequestApprovalService } from '@/lib/services/service-requests/service-request-approval-service';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ServiceRequestFilters } from '@/types/service-request';

export async function GET(request: Request) {
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

    // Institution scoping: super_admin can pass any institution_id (or none);
    // every other approver is pinned to their own institution. RLS enforces
    // this too, but the explicit filter keeps the pagination total honest and
    // stops a stale dropdown from leaking another institution's row counts.
    const isSuperAdmin = profile.role === 'super_admin';
    const requestedInstitutionId = new URL(request.url).searchParams.get('institution_id');
    const effectiveInstitutionId = isSuperAdmin
      ? (requestedInstitutionId || undefined)
      : (profile.institution_id || undefined);

    const { searchParams } = new URL(request.url);
    const filters: ServiceRequestFilters = {
      institution_id: effectiveInstitutionId,
      page: searchParams.get('page') ? parseInt(searchParams.get('page')!) : 1,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 20,
    };

    const result = await ServiceRequestApprovalService.getPendingApprovalsForUser(
      profile.role,
      session.user.id,
      filters
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('[service-requests/approvals] GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
