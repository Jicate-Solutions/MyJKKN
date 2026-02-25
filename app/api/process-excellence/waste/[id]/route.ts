import { z } from 'zod';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthSession } from '@/lib/supabase/server';
import { updateWasteIncidentSchema } from '@/lib/validations/process-excellence';
import { ProcessExcellenceService } from '@/lib/services/process-excellence/process-excellence-service';

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
        { error: 'Waste incident ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const data = await ProcessExcellenceService.getWasteIncident(id, supabase);

    return NextResponse.json(data);
  } catch (error) {
    console.error('[process-excellence/waste/[id]] GET Error:', error);

    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        { error: 'Waste incident not found' },
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
        { error: 'Waste incident ID is required' },
        { status: 400 }
      );
    }

    const json = await request.json();
    const validatedData = updateWasteIncidentSchema.parse(json);

    const supabase = await createClient();
    const data = await ProcessExcellenceService.updateWasteIncident(
      id,
      validatedData,
      session.user.id,
      supabase
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error('[process-excellence/waste/[id]] PATCH Error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        { error: 'Waste incident not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Waste incident ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    await ProcessExcellenceService.deleteWasteIncident(id, supabase);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('[process-excellence/waste/[id]] DELETE Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
