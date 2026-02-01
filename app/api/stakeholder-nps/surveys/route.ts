import { z } from 'zod';
import { NextResponse } from 'next/server';
import { NPSService } from '@/lib/services/stakeholder-nps/nps-service';
import { getAuthSession } from '@/lib/supabase/server';
import { createSurveySchema, surveyFiltersSchema } from '@/lib/validations/stakeholder-nps';

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
      stakeholder_type: searchParams.get('stakeholder_type') || undefined,
      status: searchParams.get('status') || undefined,
      department_id: searchParams.get('department_id') || undefined,
      program_id: searchParams.get('program_id') || undefined,
      search: searchParams.get('search') || undefined,
      start_date_from: searchParams.get('start_date_from') || undefined,
      start_date_to: searchParams.get('start_date_to') || undefined,
      page: searchParams.get('page') ? parseInt(searchParams.get('page')!) : 1,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 10,
      sortBy: searchParams.get('sortBy') || 'created_at',
      sortDirection: (searchParams.get('sortDirection') as 'asc' | 'desc') || 'desc'
    };

    const validatedFilters = surveyFiltersSchema.parse(queryParams);
    const result = await NPSService.getSurveys(validatedFilters);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[stakeholder-nps] Error in GET /api/stakeholder-nps/surveys:', error);

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
    const validatedData = createSurveySchema.parse(json);

    const survey = await NPSService.createSurvey(validatedData as any);

    return NextResponse.json(survey, { status: 201 });
  } catch (error) {
    console.error('[stakeholder-nps] Error in POST /api/stakeholder-nps/surveys:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
