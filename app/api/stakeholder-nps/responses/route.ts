import { z } from 'zod';
import { NextResponse } from 'next/server';
import { NPSService } from '@/lib/services/stakeholder-nps/nps-service';
import { getAuthSession } from '@/lib/supabase/server';
import { submitResponseSchema, responseFiltersSchema } from '@/lib/validations/stakeholder-nps';

export async function GET(request: Request) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const queryParams = {
      survey_id: searchParams.get('survey_id') || undefined,
      nps_category: searchParams.get('nps_category') || undefined,
      department_id: searchParams.get('department_id') || undefined,
      respondent_type: searchParams.get('respondent_type') || undefined,
      submitted_from: searchParams.get('submitted_from') || undefined,
      submitted_to: searchParams.get('submitted_to') || undefined,
      search: searchParams.get('search') || undefined,
      page: searchParams.get('page') ? parseInt(searchParams.get('page')!) : 1,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 10,
      sortBy: searchParams.get('sortBy') || 'submitted_at',
      sortDirection: (searchParams.get('sortDirection') as 'asc' | 'desc') || 'desc'
    };

    const validatedFilters = responseFiltersSchema.parse(queryParams);
    const result = await NPSService.getResponses(validatedFilters);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[stakeholder-nps] Error in GET /api/stakeholder-nps/responses:', error);

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
    // Note: Response submission can be anonymous, so we don't require authentication
    // The RLS policy ensures only active surveys can receive responses

    const json = await request.json();
    const validatedData = submitResponseSchema.parse(json);

    const response = await NPSService.submitResponse(validatedData as any);

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('[stakeholder-nps] Error in POST /api/stakeholder-nps/responses:', error);

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
