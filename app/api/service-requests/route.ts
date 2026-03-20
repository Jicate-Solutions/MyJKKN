import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthSession } from '@/lib/supabase/server';
import { ServiceRequestService } from '@/lib/services/service-requests/service-request-service';
import { createServiceRequestSchema, type CreateServiceRequestDto } from '@/types/service-request';
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
      institution_id: searchParams.get('institution_id') || undefined,
      search: searchParams.get('search') || undefined,
      submitted_from: searchParams.get('submitted_from') || undefined,
      submitted_to: searchParams.get('submitted_to') || undefined,
      page: searchParams.get('page') ? parseInt(searchParams.get('page')!) : 1,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 20,
      sortBy: searchParams.get('sortBy') || 'created_at',
      sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc',
    };

    const result = await ServiceRequestService.getAllRequests(filters);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[service-requests] GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const json = await request.json();
    const validated = createServiceRequestSchema.parse(json) as CreateServiceRequestDto;

    const serviceRequest = await ServiceRequestService.createRequest(
      validated,
      session.user.id
    );

    return NextResponse.json(serviceRequest, { status: 201 });
  } catch (error) {
    console.error('[service-requests] POST error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    if (error instanceof Error) {
      if (error.message.includes('not allowed') || error.message.includes('already have')) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      if (error.message.includes('not found') || error.message.includes('unavailable')) {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
    }

    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
