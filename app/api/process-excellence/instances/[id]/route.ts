import { z } from 'zod';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthSession } from '@/lib/supabase/server';
import { advanceStageSchema } from '@/lib/validations/process-excellence';
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
        { error: 'Process instance ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const data = await ProcessExcellenceService.getProcessInstance(id, undefined, supabase);

    return NextResponse.json(data);
  } catch (error) {
    console.error('[process-excellence/instances/[id]] GET Error:', error);

    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        { error: 'Process instance not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// Advance stage
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Process instance ID is required' },
        { status: 400 }
      );
    }

    const json = await request.json();
    const validatedData = advanceStageSchema.parse(json);

    const supabase = await createClient();
    const data = await ProcessExcellenceService.advanceStage(
      id,
      validatedData.new_stage,
      validatedData.is_value_add,
      undefined,
      supabase
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error('[process-excellence/instances/[id]] PATCH Error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        { error: 'Process instance not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// Complete process
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Process instance ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const data = await ProcessExcellenceService.completeProcess(id, supabase);

    return NextResponse.json(data);
  } catch (error) {
    console.error('[process-excellence/instances/[id]] PUT Error:', error);

    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        { error: 'Process instance not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
