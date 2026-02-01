// app/api/grievance/tickets/[id]/reopen/route.ts
// F004: Grievance Ticketing System - Reopen Ticket API

import { z } from 'zod';
import { NextResponse } from 'next/server';
import { GrievanceService } from '@/lib/services/grievance/grievance-service';
import { getAuthSession } from '@/lib/supabase/server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const reopenTicketSchema = z.object({
  reason: z
    .string()
    .min(10, 'Reason must be at least 10 characters')
    .max(1000, 'Reason must be less than 1000 characters')
});

export async function POST(request: Request, { params }: RouteParams) {
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
    const validatedData = reopenTicketSchema.parse(json);

    const ticket = await GrievanceService.reopenTicket(id, validatedData.reason);

    return NextResponse.json(ticket);
  } catch (error) {
    console.error('Error in POST /api/grievance/tickets/[id]/reopen:', error);

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
