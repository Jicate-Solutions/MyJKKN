import { z } from 'zod';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthSession } from '@/lib/supabase/server';
import {
  createWasteIncidentSchema,
  wasteIncidentFiltersSchema
} from '@/lib/validations/process-excellence';
import type { WasteIncidentFilters } from '@/types/process-excellence';

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
      process_instance_id: searchParams.get('process_instance_id') || undefined,
      waste_category: searchParams.get('waste_category') || undefined,
      status: searchParams.get('status') || undefined,
      reported_from: searchParams.get('reported_from') || undefined,
      reported_to: searchParams.get('reported_to') || undefined,
      page: searchParams.get('page') ? parseInt(searchParams.get('page')!) : 1,
      limit: searchParams.get('limit')
        ? parseInt(searchParams.get('limit')!)
        : 10,
      sortBy: searchParams.get('sortBy') || undefined,
      sortDirection: searchParams.get('sortDirection') as 'asc' | 'desc' | undefined
    };

    const validatedFilters = wasteIncidentFiltersSchema.parse(queryParams) as WasteIncidentFilters;

    const supabase = await createClient();

    let query = supabase
      .from('waste_incidents')
      .select(
        `
        *,
        process:process_definitions(id, name, category),
        reporter:users_profiles!waste_incidents_reported_by_fkey(id, first_name, last_name),
        institution:institutions(id, name)
      `,
        { count: 'exact' }
      );

    // Apply filters
    if (validatedFilters.institution_id) {
      query = query.eq('institution_id', validatedFilters.institution_id);
    }

    if (validatedFilters.process_id) {
      query = query.eq('process_id', validatedFilters.process_id);
    }

    if (validatedFilters.process_instance_id) {
      query = query.eq('process_instance_id', validatedFilters.process_instance_id);
    }

    if (validatedFilters.waste_category) {
      query = query.eq('waste_category', validatedFilters.waste_category);
    }

    if (validatedFilters.status) {
      query = query.eq('status', validatedFilters.status);
    }

    if (validatedFilters.reported_from) {
      query = query.gte('reported_at', validatedFilters.reported_from);
    }

    if (validatedFilters.reported_to) {
      query = query.lte('reported_at', validatedFilters.reported_to);
    }

    if (validatedFilters.search) {
      query = query.or(
        `description.ilike.%${validatedFilters.search}%,root_cause.ilike.%${validatedFilters.search}%`
      );
    }

    // Apply sorting
    const sortBy = validatedFilters.sortBy || 'reported_at';
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
      console.error('[process-excellence/waste] Error:', error);
      throw new Error(`Failed to fetch waste incidents: ${error.message}`);
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
    console.error('[process-excellence/waste] GET Error:', error);

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
    const validatedData = createWasteIncidentSchema.parse(json);

    const supabase = await createClient();

    const { data, error } = await supabase
      .from('waste_incidents')
      .insert({
        ...validatedData,
        reported_by: session.user.id,
        status: 'open'
      })
      .select(
        `
        *,
        process:process_definitions(id, name, category),
        reporter:users_profiles!waste_incidents_reported_by_fkey(id, first_name, last_name),
        institution:institutions(id, name)
      `
      )
      .single();

    if (error) {
      console.error('[process-excellence/waste] Create error:', error);
      throw new Error(`Failed to report waste incident: ${error.message}`);
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('[process-excellence/waste] POST Error:', error);

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
