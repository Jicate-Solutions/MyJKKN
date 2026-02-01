import { z } from 'zod';
import { NextResponse } from 'next/server';
import { MaturityAssessmentService } from '@/lib/services/maturity-assessment/maturity-assessment-service';
import { getAuthSession } from '@/lib/supabase/server';
import {
  createAssessmentSchema,
  assessmentFiltersSchema
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
      institution_id: searchParams.get('institution_id') || undefined,
      department_id: searchParams.get('department_id') || undefined,
      status: searchParams.get('status') || undefined,
      date_from: searchParams.get('date_from') || undefined,
      date_to: searchParams.get('date_to') || undefined,
      assessor_id: searchParams.get('assessor_id') || undefined,
      search: searchParams.get('search') || undefined,
      page: searchParams.get('page') ? parseInt(searchParams.get('page')!) : 1,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 10,
      sortBy: searchParams.get('sortBy') || undefined,
      sortDirection: (searchParams.get('sortDirection') as 'asc' | 'desc') || undefined
    };

    const validatedFilters = assessmentFiltersSchema.parse(queryParams);
    const result = await MaturityAssessmentService.getAssessments(validatedFilters);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[GET /api/maturity-assessment/assessments] Error:', error);

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
    const validatedData = createAssessmentSchema.parse(json);

    const assessment = await MaturityAssessmentService.createAssessment(validatedData as any);

    return NextResponse.json(assessment, { status: 201 });
  } catch (error) {
    console.error('[POST /api/maturity-assessment/assessments] Error:', error);

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
