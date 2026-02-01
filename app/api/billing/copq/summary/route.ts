// app/api/billing/copq/summary/route.ts
// API routes for COPQ summary, dashboard, and iceberg data

import { z } from 'zod';
import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/supabase/server';
import { BillingCOPQService } from '@/lib/services/billing/copq/billing-copq-service';
import { copqSummaryFiltersSchema } from '@/lib/validations/billing-copq';

export async function GET(request: Request) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'dashboard';

    // Parse and validate query parameters
    const queryParams = {
      institution_id: searchParams.get('institution_id') || '',
      year: searchParams.get('year')
        ? parseInt(searchParams.get('year')!)
        : undefined
    };

    const validatedFilters = copqSummaryFiltersSchema.parse(queryParams);

    let result;

    switch (type) {
      case 'summary':
        result = await BillingCOPQService.getSummary(
          validatedFilters.institution_id,
          validatedFilters.year
        );
        break;

      case 'dashboard':
        result = await BillingCOPQService.getDashboard(
          validatedFilters.institution_id,
          validatedFilters.year
        );
        break;

      case 'iceberg':
        result = await BillingCOPQService.getIcebergData(
          validatedFilters.institution_id,
          validatedFilters.year
        );
        break;

      default:
        return NextResponse.json(
          {
            error:
              'Invalid type. Use ?type=summary, ?type=dashboard, or ?type=iceberg'
          },
          { status: 400 }
        );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[API] Error in GET /api/billing/copq/summary:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: error.errors },
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
