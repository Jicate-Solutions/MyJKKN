import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/supabase/server';
import { ServiceRequestService } from '@/lib/services/service-requests/service-request-service';
import type { ServiceRequestFilters } from '@/types/service-request';

export async function GET(request: Request) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const filters: ServiceRequestFilters = {
      status: searchParams.get('status') as any || undefined,
      service_type_id: searchParams.get('service_type_id') || undefined,
      priority: searchParams.get('priority') as any || undefined,
      search: searchParams.get('search') || undefined,
      page: searchParams.get('page') ? parseInt(searchParams.get('page')!) : 1,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 20,
      sortBy: searchParams.get('sortBy') || 'created_at',
      sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc',
    };

    const result = await ServiceRequestService.getMyRequests(
      session.user.id,
      filters
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('[service-requests/my] GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
