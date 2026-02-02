import { NextRequest, NextResponse } from 'next/server';
import { NPSService } from '@/lib/services/stakeholder-nps/nps-service';
import { createNPSSurveySchema, npsSurveyFiltersSchema } from '@/lib/validations/stakeholder-nps';
import type { NPSSurveyFilters, CreateNPSSurveyDto } from '@/types/stakeholder-nps';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filters = {
      institution_id: searchParams.get('institution_id') || '',
      status: searchParams.get('status') as any,
      stakeholder_type: searchParams.get('stakeholder_type') as any,
      search: searchParams.get('search') || undefined,
      page: searchParams.get('page') ? parseInt(searchParams.get('page')!) : 1,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 10
    };

    const validated = npsSurveyFiltersSchema.parse(filters) as NPSSurveyFilters;
    const result = await NPSService.getSurveys(validated);
    
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[API] GET /api/stakeholder-nps/surveys error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch surveys' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = createNPSSurveySchema.parse(body) as CreateNPSSurveyDto;
    const survey = await NPSService.createSurvey(validated);
    
    return NextResponse.json(survey, { status: 201 });
  } catch (error: any) {
    console.error('[API] POST /api/stakeholder-nps/surveys error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create survey' },
      { status: 500 }
    );
  }
}
