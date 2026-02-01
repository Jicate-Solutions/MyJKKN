import { z } from 'zod';
import { NextResponse } from 'next/server';
import { NPSService } from '@/lib/services/stakeholder-nps/nps-service';
import { getAuthSession } from '@/lib/supabase/server';
import type { AnalyticsFilters } from '@/types/stakeholder-nps';
import { analyticsFiltersSchema } from '@/lib/validations/stakeholder-nps';

export async function GET(request: Request) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    const institutionId = searchParams.get('institution_id');
    if (!institutionId) {
      return NextResponse.json({ error: 'institution_id is required' }, { status: 400 });
    }

    // Parse query parameters
    const queryParams = {
      institution_id: institutionId,
      stakeholder_type: searchParams.get('stakeholder_type') || undefined,
      department_id: searchParams.get('department_id') || undefined,
      period_start: searchParams.get('period_start') || undefined,
      period_end: searchParams.get('period_end') || undefined
    };

    const validatedFilters = analyticsFiltersSchema.parse(queryParams) as AnalyticsFilters;
    const analytics = await NPSService.getAnalytics(validatedFilters);

    return NextResponse.json(analytics);
  } catch (error) {
    console.error('[stakeholder-nps] Error in GET /api/stakeholder-nps/analytics:', error);

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

    if (!json.survey_id) {
      return NextResponse.json({ error: 'Survey ID is required' }, { status: 400 });
    }

    // Recalculate analytics for a specific survey
    await NPSService.recalculateAnalytics(json.survey_id);

    return NextResponse.json({ success: true, message: 'Analytics recalculated successfully' });
  } catch (error) {
    console.error('[stakeholder-nps] Error in POST /api/stakeholder-nps/analytics:', error);

    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
