/**
 * Account Posts API
 * GET /api/social-media/accounts/[id]/posts
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const parsedLimit = parseInt(searchParams.get('limit') || '20');
    const limit = Number.isNaN(parsedLimit) || parsedLimit < 1 ? 20 : Math.min(parsedLimit, 100);
    const ALLOWED_SORT_COLUMNS = ['posted_at', 'likes_count', 'comments_count', 'views_count', 'engagement_rate', 'created_at'];
    const rawSort = searchParams.get('sort_by') || 'posted_at';
    const sortBy = ALLOWED_SORT_COLUMNS.includes(rawSort) ? rawSort : 'posted_at';

    const { data, error, count } = await supabase
      .from('sm_post_metrics')
      .select('*', { count: 'exact' })
      .eq('account_id', id)
      .order(sortBy, { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      data: data || [],
      metadata: { total: count || 0, page: 1, limit, totalPages: 1 },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
