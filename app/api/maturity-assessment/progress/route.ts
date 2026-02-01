import { z } from 'zod';
import { NextResponse } from 'next/server';
import { MaturityAssessmentService } from '@/lib/services/maturity-assessment/maturity-assessment-service';
import { getAuthSession } from '@/lib/supabase/server';
import {
  createProgressItemSchema,
  progressFiltersSchema
} from '@/lib/validations/maturity-assessment';

export async function GET(request: Request) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const queryParams = {
      assessment_id: searchParams.get('assessment_id') || undefined,
      dimension: searchParams.get('dimension') || undefined,
      status: searchParams.get('status') || undefined,
      assigned_to: searchParams.get('assigned_to') || undefined,
      overdue: searchParams.get('overdue') === 'true' || undefined,
      page: searchParams.get('page') ? parseInt(searchParams.get('page')!) : 1,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 50
    };

    const validatedFilters = progressFiltersSchema.parse(queryParams);
    const result = await MaturityAssessmentService.getProgressItems(validatedFilters);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[GET /api/maturity-assessment/progress] Error:', error);

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
    const validatedData = createProgressItemSchema.parse(json);

    const progressItem = await MaturityAssessmentService.createProgressItem(validatedData as any);

    return NextResponse.json(progressItem, { status: 201 });
  } catch (error) {
    console.error('[POST /api/maturity-assessment/progress] Error:', error);

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
