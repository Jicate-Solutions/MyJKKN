import { NextRequest, NextResponse } from 'next/server';
import { NPSService } from '@/lib/services/stakeholder-nps/nps-service';
import { submitNPSResponseSchema, npsResponseFiltersSchema } from '@/lib/validations/stakeholder-nps';
import type { NPSResponseFilters, SubmitNPSResponseDto } from '@/types/stakeholder-nps';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filters = {
      survey_id: searchParams.get('survey_id') || undefined,
      stakeholder_type: searchParams.get('stakeholder_type') as any,
      sentiment: searchParams.get('sentiment') as any,
      page: searchParams.get('page') ? parseInt(searchParams.get('page')!) : 1,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 10
    };

    const validated = npsResponseFiltersSchema.parse(filters) as NPSResponseFilters;
    const result = await NPSService.getResponses(validated);
    
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[API] GET /api/stakeholder-nps/responses error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch responses' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = submitNPSResponseSchema.parse(body) as SubmitNPSResponseDto;
    const response = await NPSService.submitResponse(validated);
    
    return NextResponse.json(response, { status: 201 });
  } catch (error: any) {
    console.error('[API] POST /api/stakeholder-nps/responses error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to submit response' },
      { status: 500 }
    );
  }
}
