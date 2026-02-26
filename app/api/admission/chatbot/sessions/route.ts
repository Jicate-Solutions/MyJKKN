// app/api/admission/chatbot/sessions/route.ts
// Authenticated admin endpoint — view all chatbot sessions

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getAuthUser } from '@/lib/supabase/server';

/**
 * GET /api/admission/chatbot/sessions
 *
 * Query: { institution_id, status?, from?, to?, page?, limit? }
 * Returns: { sessions, total, page, limit }
 */
export async function GET(request: NextRequest) {
  try {
    // Auth check
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const institutionId = searchParams.get('institution_id');
    const status = searchParams.get('status');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);

    if (!institutionId) {
      return NextResponse.json(
        { error: 'institution_id is required' },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();
    const offset = (page - 1) * limit;

    let query = supabase
      .from('chatbot_sessions')
      .select('*, chatbot_configs(name)', { count: 'exact' })
      .eq('institution_id', institutionId)
      .order('last_activity_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }
    if (from) {
      query = query.gte('started_at', from);
    }
    if (to) {
      query = query.lte('started_at', to);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[api/admission/chatbot/sessions] Error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch sessions' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      sessions: data || [],
      total: count || 0,
      page,
      limit,
    });
  } catch (error) {
    console.error('[api/admission/chatbot/sessions] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
