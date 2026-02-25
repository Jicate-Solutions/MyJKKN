import { z } from 'zod';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthSession } from '@/lib/supabase/server';
import {
  createProcessAuditSchema,
  processAuditFiltersSchema
} from '@/lib/validations/process-excellence';
import type { ProcessAuditFilters } from '@/types/process-excellence';
import { ProcessExcellenceService } from '@/lib/services/process-excellence/process-excellence-service';

export async function GET(request: Request) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    // Validate required institution_id
    const institutionId = searchParams.get('institution_id');
    if (!institutionId) {
      return NextResponse.json({ error: 'institution_id is required' }, { status: 400 });
    }

    // Parse and validate query parameters
    const queryParams = {
      search: searchParams.get('search') || undefined,
      institution_id: institutionId,
      process_id: searchParams.get('process_id') || undefined,
      auditor_id: searchParams.get('auditor_id') || undefined,
      abcd_rating: searchParams.get('abcd_rating') || undefined,
      status: searchParams.get('status') || undefined,
      period_from: searchParams.get('period_from') || undefined,
      period_to: searchParams.get('period_to') || undefined,
      page: searchParams.get('page') ? parseInt(searchParams.get('page')!) : 1,
      limit: searchParams.get('limit')
        ? parseInt(searchParams.get('limit')!)
        : 10,
      sortBy: searchParams.get('sortBy') || undefined,
      sortDirection: searchParams.get('sortDirection') as 'asc' | 'desc' | undefined
    };

    const validatedFilters = processAuditFiltersSchema.parse(queryParams) as ProcessAuditFilters;

    const supabase = await createClient();
    const result = await ProcessExcellenceService.getProcessAudits(validatedFilters, supabase);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[process-excellence/audits] GET Error:', error);

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
    const validatedData = createProcessAuditSchema.parse(json);

    const supabase = await createClient();
    const data = await ProcessExcellenceService.createProcessAudit(
      validatedData,
      session.user.id,
      supabase
    );

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('[process-excellence/audits] POST Error:', error);

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
