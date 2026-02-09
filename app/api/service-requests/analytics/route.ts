import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/supabase/server';
import { ServiceRequestService } from '@/lib/services/service-requests/service-request-service';

export async function GET(request: Request) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const filters = {
      institution_id: searchParams.get('institution_id') || undefined,
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
