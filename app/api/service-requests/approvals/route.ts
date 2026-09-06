export const dynamic = 'force-dynamic';

import { NextResponse , connection } from 'next/server';
import { getAuthSession } from '@/lib/supabase/server';
import { ServiceRequestApprovalService } from '@/lib/services/service-requests/service-request-approval-service';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { paginationFromSearchParams } from '@/lib/services/service-requests/pagination';
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

    // Institution scoping: cross-institutional users (super_admin, or roles
    // with institution_scope='all' like CAO) can pass any institution_id or
    // see all institutions; everyone else is pinned to their own institution.
    const isSuperAdmin = profile.role === 'super_admin';

    const { data: userCustomRole } = await (supabase as any)
      .from('custom_roles')
      .select('institution_scope')
      .eq('role_key', profile.role)
      .eq('institution_scope', 'all')
      .maybeSingle();
    const isCrossInstitutional = isSuperAdmin || !!userCustomRole;

    const requestedInstitutionId = new URL(request.url).searchParams.get('institution_id');
    const effectiveInstitutionId = isCrossInstitutional
      ? (requestedInstitutionId || undefined)
      : (profile.institution_id || undefined);

    const { searchParams } = new URL(request.url);
    const { page, limit } = paginationFromSearchParams(searchParams);
    const filters: ServiceRequestFilters = {
      institution_id: effectiveInstitutionId,
      // Forwarded so narrowing happens in Postgres. Without these the inbox
      // could only filter the rows already on screen.
      service_type_id: searchParams.get('service_type_id') || undefined,
      priority: (searchParams.get('priority') as ServiceRequestFilters['priority']) || undefined,
      search: searchParams.get('search') || undefined,
      page,
      limit,
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
