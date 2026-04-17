// app/api/api-management/okr/check-ins/route.ts
// External API for OKR Check-ins

import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { corsHeaders } from '@/lib/api-keys/cors';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  try {
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

    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'API key has expired' },
        { status: 401, headers: corsHeaders }
      );
    }

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
    const userId = url.searchParams.get('user_id');
    const weekNumber = url.searchParams.get('week_number');
    const year = url.searchParams.get('year');
    const isCompleted = url.searchParams.get('is_completed');
    const isOverdue = url.searchParams.get('is_overdue');

    // Build query
    let query = (supabase as any)
      .from('okr_check_ins')
      .select(`
        *,
        user:auth.users!user_id(id, email, raw_user_meta_data),
        kr_updates:okr_kr_updates(
          *,
          key_result:okr_key_results(id, title)
        )
      `, { count: 'exact' });

    // Apply filters
    if (userId) {
      query = query.eq('user_id', userId);
    }
    if (weekNumber) {
      query = query.eq('week_number', parseInt(weekNumber));
    }
    if (year) {
      query = query.eq('year', parseInt(year));
    }
    if (isCompleted !== null) {
      query = query.eq('is_completed', isCompleted === 'true');
    }
    if (isOverdue !== null) {
      query = query.eq('is_overdue', isOverdue === 'true');
    }

    // Apply pagination
    const from = (page - 1) * limit;
    query = query
      .range(from, from + limit - 1)
      .order('due_date', { ascending: false });

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
    console.error('[OKR Check-ins API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
