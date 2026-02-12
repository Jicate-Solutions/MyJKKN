/**
 * Social Media Accounts API
 * GET /api/social-media/accounts - List accounts (all roles, RLS-scoped)
 * POST /api/social-media/accounts - Create account (admin+ only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { smAccountFiltersSchema, createSmAccountSchema } from '@/lib/validations/social-media';

const ADMIN_ROLES = ['super_admin', 'admin', 'principal'];

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch profile for institution validation
    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id, role, department_id')
      .eq('id', user.id)
      .single();

    if (!profile?.institution_id) {
      return NextResponse.json({ error: 'User not assigned to institution' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    // Prevent horizontal privilege escalation
    const requestedInstitution = searchParams.get('institution_id');
    if (profile.role !== 'super_admin' && requestedInstitution && requestedInstitution !== profile.institution_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const filters = smAccountFiltersSchema.parse({
      institution_id: requestedInstitution || profile.institution_id,
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
      // Escape ILIKE special characters to prevent wildcard injection
      const sanitized = filters.search
        .replace(/\\/g, '\\\\')
        .replace(/%/g, '\\%')
        .replace(/_/g, '\\_')
        .replace(/"/g, '');  // Strip quotes to prevent PostgREST quote breakout
      // Wrap values in double quotes to prevent PostgREST comma/dot parsing issues
      query = query.or(`username.ilike."%${sanitized}%",display_name.ilike."%${sanitized}%"`);
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

    // Only admins can create accounts
    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id, role')
      .eq('id', user.id)
      .single();

    if (!profile || !ADMIN_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: 'Only administrators can create accounts' }, { status: 403 });
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
