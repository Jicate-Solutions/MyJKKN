import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import { NPSService } from '@/lib/services/stakeholder-nps/nps-service';
import { npsAnalyticsFiltersSchema } from '@/lib/validations/stakeholder-nps';
import type { NPSAnalyticsFilters } from '@/types/stakeholder-nps';

export async function GET(request: NextRequest) {
  await connection();
  try {
    const { searchParams } = new URL(request.url);
    const institutionId = searchParams.get('institution_id');

    if (!institutionId) {
      return NextResponse.json(
        { error: 'institution_id is required' },
        { status: 400 }
      );
    }

    const filters = {
      institution_id: institutionId,
      stakeholder_type: searchParams.get('stakeholder_type') as any || undefined,
      date_from: searchParams.get('date_from') || undefined,
      date_to: searchParams.get('date_to') || undefined,
      survey_id: searchParams.get('survey_id') || undefined
    };

    const validated = npsAnalyticsFiltersSchema.parse(filters) as NPSAnalyticsFilters;
    const trends = await NPSService.getTrendAnalytics(validated);
    
    return NextResponse.json({ trends });
  } catch (error: any) {
    console.error('[API] GET /api/stakeholder-nps/analytics error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch analytics' },
      { status: 500 }
    );
  }
}
