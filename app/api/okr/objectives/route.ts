// app/api/okr/objectives/route.ts
// Internal API for OKR Objectives (session-based auth)

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

    // Get user profile for institution context
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, institution_id, department_id')
      .eq('id', user.id)
      .single();

    // Get query parameters
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '10'), 100);
    const ownerId = url.searchParams.get('owner_id');
    const tier = url.searchParams.get('tier');
    const level = url.searchParams.get('level');
    const status = url.searchParams.get('status');
    const cycleType = url.searchParams.get('cycle_type');
    const search = url.searchParams.get('search');
    const myObjectives = url.searchParams.get('my_objectives') === 'true';

    // Build query
    let query = (supabase as any)
      .from('okr_objectives')
      .select(`
        *,
        owner:profiles!owner_id(id, full_name, email, avatar_url),
        parent:okr_objectives!parent_objective_id(id, title),
        key_results:okr_key_results(
          id, title, current_value, target_value, start_value,
          unit, status, progress_percentage, data_source
        )
      `, { count: 'exact' });

    // Apply institution filter for non-super_admin users
    if (profile?.role !== 'super_admin' && profile?.institution_id) {
      query = query.eq('institution_id', profile.institution_id);
    }

    // Filter my objectives
    if (myObjectives) {
      query = query.eq('owner_id', user.id);
    } else if (ownerId) {
      query = query.eq('owner_id', ownerId);
    }

    // Apply other filters
    if (tier) {
      query = query.eq('tier', parseInt(tier));
    }
    if (level) {
      query = query.eq('level', level);
    }
    if (status) {
      query = query.eq('status', status);
    }
    if (cycleType) {
      query = query.eq('cycle_type', cycleType);
    }
    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
    }

    // Apply pagination
    const from = (page - 1) * limit;
    query = query
      .range(from, from + limit - 1)
      .order('created_at', { ascending: false });

    const { data, error, count } = await query;

    if (error) throw error;

    return NextResponse.json({
      data: data || [],
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: count ? Math.ceil(count / limit) : 0
      }
    });

  } catch (error) {
    console.error('[OKR Objectives API] Error:', error);
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

    // Get user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, institution_id, department_id')
      .eq('id', user.id)
      .single();

    const body = await request.json();

    // Validate required fields
    if (!body.title || !body.tier || !body.level) {
      return NextResponse.json(
        { error: 'Missing required fields: title, tier, level' },
        { status: 400 }
      );
    }

    // Cascade enforcement: child objectives must link to parent
    if (body.level !== 'institution' && !body.parent_objective_id) {
      return NextResponse.json(
        { error: 'Cascade enforcement: Non-institution objectives must have a parent objective' },
        { status: 400 }
      );
    }

    // Build objective data
    const objectiveData = {
      title: body.title,
      description: body.description,
      tier: body.tier,
      level: body.level,
      owner_id: body.owner_id || user.id,
      institution_id: body.institution_id || profile?.institution_id,
      department_id: body.department_id || profile?.department_id,
      parent_objective_id: body.parent_objective_id,
      cycle_type: body.cycle_type || 'quarterly',
      start_date: body.start_date,
      end_date: body.end_date,
      status: 'draft',
      created_by: user.id
    };

    const { data, error } = await (supabase as any)
      .from('okr_objectives')
      .insert([objectiveData])
      .select(`
        *,
        owner:profiles!owner_id(id, full_name, email),
        parent:okr_objectives!parent_objective_id(id, title)
      `)
      .single();

    if (error) {
      console.error('[OKR Objectives API] Create error:', error);
      return NextResponse.json(
        { error: 'Failed to create objective', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ data }, { status: 201 });

  } catch (error) {
    console.error('[OKR Objectives API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
