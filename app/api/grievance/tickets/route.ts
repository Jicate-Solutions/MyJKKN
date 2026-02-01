// app/api/grievance/tickets/route.ts
// F004: Grievance Ticketing System - Tickets API

import { z } from 'zod';
import { NextResponse } from 'next/server';
import { GrievanceService } from '@/lib/services/grievance/grievance-service';
import { getAuthSession } from '@/lib/supabase/server';
import type { GrievanceTicketFilters } from '@/types/grievance';
import { createGrievanceTicketSchema, ticketFiltersSchema } from '@/lib/validations/grievance';

export async function GET(request: Request) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    const institutionId = searchParams.get('institution_id');
    if (!institutionId) {
      return NextResponse.json(
        { error: 'institution_id is required' },
        { status: 400 }
      );
    }

    const queryParams = {
      institution_id: institutionId,
      status: searchParams.get('status') || undefined,
      sla_status: searchParams.get('sla_status') || undefined,
      priority: searchParams.get('priority') || undefined,
      assigned_to: searchParams.get('assigned_to') || undefined,
      category_id: searchParams.get('category_id') || undefined,
      raised_by_type: searchParams.get('raised_by_type') || undefined,
      raised_by_id: searchParams.get('raised_by_id') || undefined,
      department_id: searchParams.get('department_id') || undefined,
      search: searchParams.get('search') || undefined,
      date_from: searchParams.get('date_from') || undefined,
      date_to: searchParams.get('date_to') || undefined,
      page: searchParams.get('page') ? parseInt(searchParams.get('page')!) : 1,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 10,
      sortBy: searchParams.get('sortBy') || undefined,
      sortDirection: (searchParams.get('sortDirection') as 'asc' | 'desc') || undefined
    };

    const validatedFilters = ticketFiltersSchema.parse(queryParams) as GrievanceTicketFilters;

    // Check if this is a "my tickets" request
    const myTickets = searchParams.get('my') === 'true';
    const assignedTickets = searchParams.get('assigned') === 'true';

    let result;
    if (myTickets) {
      result = await GrievanceService.getMyTickets(validatedFilters);
    } else if (assignedTickets) {
      result = await GrievanceService.getAssignedTickets(validatedFilters);
    } else {
      result = await GrievanceService.getTickets(validatedFilters);
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in GET /api/grievance/tickets:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const json = await request.json();
    const validatedData = createGrievanceTicketSchema.parse(json);

    const ticket = await GrievanceService.createTicket(validatedData as any);

    return NextResponse.json(ticket, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/grievance/tickets:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
