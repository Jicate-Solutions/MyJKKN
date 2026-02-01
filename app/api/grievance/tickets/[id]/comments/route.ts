// app/api/grievance/tickets/[id]/comments/route.ts
// F004: Grievance Ticketing System - Comments API

import { z } from 'zod';
import { NextResponse } from 'next/server';
import { GrievanceService } from '@/lib/services/grievance/grievance-service';
import { getAuthSession } from '@/lib/supabase/server';
import { createGrievanceCommentSchema } from '@/lib/validations/grievance';

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

    const { searchParams } = new URL(request.url);
    const includeInternal = searchParams.get('include_internal') === 'true';

    const comments = await GrievanceService.getComments(id, includeInternal);

    return NextResponse.json({ data: comments });
  } catch (error) {
    console.error('Error in GET /api/grievance/tickets/[id]/comments:', error);

    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

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
    const validatedData = createGrievanceCommentSchema.parse(json);

    const comment = await GrievanceService.addComment(id, validatedData as any);

    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/grievance/tickets/[id]/comments:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
