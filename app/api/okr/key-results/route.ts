// app/api/okr/key-results/route.ts
// Internal API for OKR Key Results (session-based auth)

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            cookieStore.set(name, value, options);
          },
          remove(name: string, options: any) {
            cookieStore.set(name, '', { ...options, maxAge: 0 });
          }
        }
      }
    );

    // Authenticate user
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get query parameters
    const url = new URL(request.url);
    const objectiveId = url.searchParams.get('objective_id');
    const status = url.searchParams.get('status');
    const dataSource = url.searchParams.get('data_source');

    if (!objectiveId) {
      return NextResponse.json(
        { error: 'objective_id is required' },
        { status: 400 }
      );
    }

    // Build query
    let query = (supabase as any)
      .from('okr_key_results')
      .select(`
        *,
        objective:okr_objectives!objective_id(id, title, owner_id, status)
      `)
      .eq('objective_id', objectiveId);

    if (status) {
      query = query.eq('status', status);
    }
    if (dataSource) {
      query = query.eq('data_source', dataSource);
    }

    query = query.order('order_index', { ascending: true });

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({ data: data || [] });

  } catch (error) {
    console.error('[OKR Key Results API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            cookieStore.set(name, value, options);
          },
          remove(name: string, options: any) {
            cookieStore.set(name, '', { ...options, maxAge: 0 });
          }
        }
      }
    );

    // Authenticate user
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Validate required fields
    if (!body.objective_id || !body.title) {
      return NextResponse.json(
        { error: 'Missing required fields: objective_id, title' },
        { status: 400 }
      );
    }

    // Validate "From X to Y" format values
    if (body.start_value === undefined || body.target_value === undefined) {
      return NextResponse.json(
        { error: 'Key Results require start_value and target_value for "From X to Y" format' },
        { status: 400 }
      );
    }

    // Verify objective exists and user has access
    const { data: objective, error: objError } = await (supabase as any)
      .from('okr_objectives')
      .select('id, owner_id, status')
      .eq('id', body.objective_id)
      .single();

    if (objError || !objective) {
      return NextResponse.json(
        { error: 'Objective not found' },
        { status: 404 }
      );
    }

    // Get max order_index for this objective
    const { data: maxOrder } = await (supabase as any)
      .from('okr_key_results')
      .select('order_index')
      .eq('objective_id', body.objective_id)
      .order('order_index', { ascending: false })
      .limit(1)
      .single();

    const nextOrderIndex = (maxOrder?.order_index || 0) + 1;

    // Build key result data
    const keyResultData = {
      objective_id: body.objective_id,
      title: body.title,
      description: body.description,
      start_value: body.start_value,
      current_value: body.current_value || body.start_value,
      target_value: body.target_value,
      unit: body.unit || 'number',
      deadline: body.deadline,
      data_source: body.data_source || 'manual',
      data_source_config: body.data_source_config,
      status: 'not_started',
      progress_percentage: 0,
      order_index: nextOrderIndex,
      created_by: user.id
    };

    const { data, error } = await (supabase as any)
      .from('okr_key_results')
      .insert([keyResultData])
      .select(`
        *,
        objective:okr_objectives!objective_id(id, title)
      `)
      .single();

    if (error) {
      console.error('[OKR Key Results API] Create error:', error);
      return NextResponse.json(
        { error: 'Failed to create key result', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ data }, { status: 201 });

  } catch (error) {
    console.error('[OKR Key Results API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
