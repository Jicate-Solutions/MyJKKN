/**
 * Social Media Accounts API
 * GET /api/social-media/accounts - List accounts
 * POST /api/social-media/accounts - Create account
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { smAccountFiltersSchema, createSmAccountSchema } from '@/lib/validations/social-media';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const filters = smAccountFiltersSchema.parse({
      institution_id: searchParams.get('institution_id'),
      platform: searchParams.get('platform') || undefined,
      health_status: searchParams.get('health_status') || undefined,
      department_id: searchParams.get('department_id') || undefined,
      is_connected: searchParams.get('is_connected') || undefined,
      search: searchParams.get('search') || undefined,
      page: searchParams.get('page') || 1,
      limit: searchParams.get('limit') || 20,
    });

    const offset = (filters.page - 1) * filters.limit;

    let query = supabase
      .from('sm_accounts')
      .select('*', { count: 'exact' })
      .eq('institution_id', filters.institution_id)
      .order('platform')
      .order('username')
      .range(offset, offset + filters.limit - 1);

    if (filters.platform) query = query.eq('platform', filters.platform);
    if (filters.health_status) query = query.eq('health_status', filters.health_status);
    if (filters.department_id) query = query.eq('department_id', filters.department_id);
    if (filters.is_connected !== undefined) query = query.eq('is_connected', filters.is_connected);
    if (filters.search) {
      query = query.or(`username.ilike.%${filters.search}%,display_name.ilike.%${filters.search}%`);
    }

    const { data, error, count } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      data: data || [],
      metadata: {
        total: count || 0,
        page: filters.page,
        limit: filters.limit,
        totalPages: Math.ceil((count || 0) / filters.limit),
      },
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid filters', details: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const dto = createSmAccountSchema.parse(body);

    const { data, error } = await supabase
      .from('sm_accounts')
      .insert({ ...dto, created_by: user.id })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
