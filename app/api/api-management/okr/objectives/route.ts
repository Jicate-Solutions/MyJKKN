// app/api/api-management/okr/objectives/route.ts
// External API for OKR Objectives

import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { corsHeaders } from '@/lib/api-keys/cors';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  try {
    // Use service role key for API key authentication to bypass RLS
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        cookies: {
          get() { return undefined; },
          set() {},
          remove() {}
        }
      }
    );

    // Get API key from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'API key is required in Authorization header' },
        { status: 401, headers: corsHeaders }
      );
    }

    const apiKey = authHeader.substring(7);
    const hashedKey = createHash('sha256').update(apiKey).digest('hex');

    // Verify API key
    const { data: keyData, error: keyError } = await supabase
      .from('api_keys')
      .select('*')
      .eq('key_value', hashedKey)
      .eq('is_active', true)
      .single();

    if (keyError || !keyData) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401, headers: corsHeaders }
      );
    }

    // Check if key has expired
    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'API key has expired' },
        { status: 401, headers: corsHeaders }
      );
    }

    // Check read permission
    if (!keyData.permissions?.read) {
      return NextResponse.json(
        { error: 'API key does not have read permission' },
        { status: 403, headers: corsHeaders }
      );
    }

    // Get query parameters
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '10'), 100);
    const institutionId = url.searchParams.get('institution_id');
    const departmentId = url.searchParams.get('department_id');
    const ownerId = url.searchParams.get('owner_id');
    const tier = url.searchParams.get('tier');
    const level = url.searchParams.get('level');
    const status = url.searchParams.get('status');
    const cycleType = url.searchParams.get('cycle_type');
    const search = url.searchParams.get('search');

    // Build query
    let query = (supabase as any)
      .from('okr_objectives')
      .select(`
        *,
        owner:auth.users!owner_id(id, email, raw_user_meta_data),
        institution:institutions(id, name),
        department:departments(id, department_name),
        key_results:okr_key_results(*)
      `, { count: 'exact' });

    // Apply filters
    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }
    if (departmentId) {
      query = query.eq('department_id', departmentId);
    }
    if (ownerId) {
      query = query.eq('owner_id', ownerId);
    }
    if (tier) {
      query = query.eq('tier', tier);
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

    // Update last used timestamp
    await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyData.id);

    return NextResponse.json({
      data: data || [],
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: count ? Math.ceil(count / limit) : 0
      }
    }, { headers: corsHeaders });

  } catch (error) {
    console.error('[OKR Objectives API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
