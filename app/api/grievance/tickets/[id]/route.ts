// app/api/grievance/tickets/[id]/route.ts
// F004: Grievance Ticketing System - Ticket by ID API

import { z } from 'zod';
import { NextResponse } from 'next/server';
import { GrievanceService } from '@/lib/services/grievance/grievance-service';
import { getAuthSession } from '@/lib/supabase/server';
import { updateGrievanceTicketSchema } from '@/lib/validations/grievance';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Ticket ID is required' },
        { status: 400 }
      );
    }

    // Check if the ID looks like a ticket number (starts with GRV-)
    const isTicketNumber = id.startsWith('GRV-');

    const ticket = isTicketNumber
      ? await GrievanceService.getTicketByNumber(id)
      : await GrievanceService.getTicket(id);

    return NextResponse.json(ticket);
  } catch (error) {
    console.error('Error in GET /api/grievance/tickets/[id]:', error);

    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        { error: 'Ticket not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Ticket ID is required' },
        { status: 400 }
      );
    }

    const json = await request.json();
    const validatedData = updateGrievanceTicketSchema.parse(json);

    const ticket = await GrievanceService.updateTicket(id, validatedData as any);

    return NextResponse.json(ticket);
  } catch (error) {
    console.error('Error in PATCH /api/grievance/tickets/[id]:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        { error: 'Ticket not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
