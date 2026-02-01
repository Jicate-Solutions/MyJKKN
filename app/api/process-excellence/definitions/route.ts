import { z } from 'zod';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthSession } from '@/lib/supabase/server';
import {
  createProcessDefinitionSchema,
  processDefinitionFiltersSchema
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
      category: searchParams.get('category') || undefined,
      is_active: searchParams.get('is_active')
        ? searchParams.get('is_active') === 'true'
        : undefined,
      page: searchParams.get('page') ? parseInt(searchParams.get('page')!) : 1,
      limit: searchParams.get('limit')
        ? parseInt(searchParams.get('limit')!)
        : 10,
      sortBy: searchParams.get('sortBy') || undefined,
      sortDirection: searchParams.get('sortDirection') as 'asc' | 'desc' | undefined
    };

    const validatedFilters = processDefinitionFiltersSchema.parse(queryParams);

    const supabase = await createClient();

    let query = supabase
      .from('process_definitions')
      .select(
        `
        *,
        institution:institutions(id, name)
      `,
        { count: 'exact' }
      );

    // Apply filters
    if (validatedFilters.institution_id) {
      query = query.eq('institution_id', validatedFilters.institution_id);
    }

    if (validatedFilters.category) {
      query = query.eq('category', validatedFilters.category);
    }

    if (validatedFilters.is_active !== undefined) {
      query = query.eq('is_active', validatedFilters.is_active);
    }

    if (validatedFilters.search) {
      query = query.or(
        `name.ilike.%${validatedFilters.search}%,description.ilike.%${validatedFilters.search}%`
      );
    }

    // Apply sorting
    const sortBy = validatedFilters.sortBy || 'name';
    const sortDirection = validatedFilters.sortDirection || 'asc';
    query = query.order(sortBy, { ascending: sortDirection === 'asc' });

    // Apply pagination
    const page = validatedFilters.page || 1;
    const limit = validatedFilters.limit || 10;
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, count, error } = await query;

    if (error) {
      console.error('[process-excellence/definitions] Error:', error);
      throw new Error(`Failed to fetch process definitions: ${error.message}`);
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
    console.error('[process-excellence/definitions] GET Error:', error);

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
    const validatedData = createProcessDefinitionSchema.parse(json);

    const supabase = await createClient();

    const { data, error } = await supabase
      .from('process_definitions')
      .insert({
        ...validatedData,
        created_by: session.user.id,
        updated_by: session.user.id
      })
      .select(
        `
        *,
        institution:institutions(id, name)
      `
      )
      .single();

    if (error) {
      console.error('[process-excellence/definitions] Create error:', error);
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'A process with this name already exists in this institution' },
          { status: 409 }
        );
      }
      throw new Error(`Failed to create process definition: ${error.message}`);
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('[process-excellence/definitions] POST Error:', error);

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
