import { z } from 'zod';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthSession } from '@/lib/supabase/server';
import {
  startProcessInstanceSchema,
  processInstanceFiltersSchema
} from '@/lib/validations/process-excellence';

export async function GET(request: Request) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    // Parse and validate query parameters
    const queryParams = {
      search: searchParams.get('search') || undefined,
      institution_id: searchParams.get('institution_id') || undefined,
      process_id: searchParams.get('process_id') || undefined,
      reference_type: searchParams.get('reference_type') || undefined,
      sla_status: searchParams.get('sla_status') || undefined,
      is_completed: searchParams.get('is_completed')
        ? searchParams.get('is_completed') === 'true'
        : undefined,
      started_from: searchParams.get('started_from') || undefined,
      started_to: searchParams.get('started_to') || undefined,
      page: searchParams.get('page') ? parseInt(searchParams.get('page')!) : 1,
      limit: searchParams.get('limit')
        ? parseInt(searchParams.get('limit')!)
        : 10,
      sortBy: searchParams.get('sortBy') || undefined,
      sortDirection: searchParams.get('sortDirection') as 'asc' | 'desc' | undefined
    };

    const validatedFilters = processInstanceFiltersSchema.parse(queryParams);

    const supabase = await createClient();

    let query = supabase
      .from('process_instances')
      .select(
        `
        *,
        process:process_definitions(
          id, name, category, sla_hours, target_value_add_ratio,
          institution:institutions(id, name)
        )
      `,
        { count: 'exact' }
      );

    // Apply filters
    if (validatedFilters.process_id) {
      query = query.eq('process_id', validatedFilters.process_id);
    }

    if (validatedFilters.reference_type) {
      query = query.eq('reference_type', validatedFilters.reference_type);
    }

    if (validatedFilters.sla_status) {
      query = query.eq('sla_status', validatedFilters.sla_status);
    }

    if (validatedFilters.is_completed !== undefined) {
      if (validatedFilters.is_completed) {
        query = query.not('completed_at', 'is', null);
      } else {
        query = query.is('completed_at', null);
      }
    }

    if (validatedFilters.started_from) {
      query = query.gte('started_at', validatedFilters.started_from);
    }

    if (validatedFilters.started_to) {
      query = query.lte('started_at', validatedFilters.started_to);
    }

    // Apply sorting
    const sortBy = validatedFilters.sortBy || 'started_at';
    const sortDirection = validatedFilters.sortDirection || 'desc';
    query = query.order(sortBy, { ascending: sortDirection === 'asc' });

    // Apply pagination
    const page = validatedFilters.page || 1;
    const limit = validatedFilters.limit || 10;
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, count, error } = await query;

    if (error) {
      console.error('[process-excellence/instances] Error:', error);
      throw new Error(`Failed to fetch process instances: ${error.message}`);
    }

    return NextResponse.json({
      data: data || [],
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit)
      }
    });
  } catch (error) {
    console.error('[process-excellence/instances] GET Error:', error);

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
    const validatedData = startProcessInstanceSchema.parse(json);

    const supabase = await createClient();
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('process_instances')
      .insert({
        ...validatedData,
        started_at: now,
        current_stage: 'initiated',
        stage_history: [
          {
            stage: 'initiated',
            started_at: now,
            completed_at: null,
            duration_hours: null
          }
        ]
      })
      .select(
        `
        *,
        process:process_definitions(*)
      `
      )
      .single();

    if (error) {
      console.error('[process-excellence/instances] Create error:', error);
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'A process instance already exists for this reference' },
          { status: 409 }
        );
      }
      throw new Error(`Failed to start process instance: ${error.message}`);
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('[process-excellence/instances] POST Error:', error);

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
