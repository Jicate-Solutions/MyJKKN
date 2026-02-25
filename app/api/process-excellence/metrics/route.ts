import { z } from 'zod';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthSession } from '@/lib/supabase/server';
import { processMetricsFiltersSchema } from '@/lib/validations/process-excellence';
import { ProcessExcellenceService } from '@/lib/services/process-excellence/process-excellence-service';

export async function GET(request: Request) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    // Parse and validate query parameters
    const queryParams = {
      institution_id: searchParams.get('institution_id') || '',
      process_id: searchParams.get('process_id') || undefined,
      category: searchParams.get('category') || undefined,
      period_start: searchParams.get('period_start') || undefined,
      period_end: searchParams.get('period_end') || undefined
    };

    const validatedFilters = processMetricsFiltersSchema.parse(queryParams);

    const supabase = await createClient();
    const metrics = await ProcessExcellenceService.getProcessMetrics(validatedFilters, supabase);

    return NextResponse.json(metrics);
  } catch (error) {
    console.error('[process-excellence/metrics] GET Error:', error);

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
