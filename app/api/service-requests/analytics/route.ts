export const dynamic = 'force-dynamic';

import { NextResponse , connection } from 'next/server';
import { getAuthSession, createServerSupabaseClient } from '@/lib/supabase/server';
import { ServiceRequestService } from '@/lib/services/service-requests/service-request-service';

export async function GET(request: Request) {
  await connection();
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Institution scoping, matching /api/service-requests exactly. This route
    // previously took institution_id straight from the query string and the hub
    // page sent none, so the stat cards fell back to "whatever RLS permits"
    // while the list beside them was pinned to the caller's institution. The
    // two disagreed: a Dental HOD saw Total 54 above a 52-row list, because
    // role_has_institution_access() returns TRUE for a NULL institution_id
    // ("system-wide records"), letting 2 institution-less requests into every
    // institution's totals.
    const supabase = await createServerSupabaseClient();
    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('role, institution_id')
      .eq('id', session.user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    const isSuperAdmin = profile.role === 'super_admin';
    const { searchParams } = new URL(request.url);
    const requestedInstitutionId = searchParams.get('institution_id');
    const type = searchParams.get('type');
    const filters = {
      institution_id: isSuperAdmin
        ? (requestedInstitutionId || undefined)
        : (profile.institution_id || undefined),
      service_type_id: searchParams.get('service_type_id') || undefined,
      from_date: searchParams.get('from_date') || undefined,
      to_date: searchParams.get('to_date') || undefined,
    };

    // Return just status counts for the hub page stat cards
    if (type === 'counts') {
      const counts = await ServiceRequestService.getRequestCountsByStatus({
        institution_id: filters.institution_id,
        service_type_id: filters.service_type_id,
      });
      return NextResponse.json(counts);
    }

    // Return full analytics
    const analytics = await ServiceRequestService.getAnalytics(filters);
    return NextResponse.json(analytics);
  } catch (error) {
    console.error('[service-requests/analytics] GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
