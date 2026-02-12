/**
 * Account Snapshots API
 * GET /api/social-media/accounts/[id]/snapshots
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
    const parsedLimit = parseInt(searchParams.get('limit') || '30');
    const limit = Number.isNaN(parsedLimit) || parsedLimit < 1 ? 30 : Math.min(parsedLimit, 200);

    const { data, error, count } = await supabase
      .from('sm_snapshots')
      .select('*', { count: 'exact' })
      .eq('account_id', id)
      .order('snapshot_date', { ascending: false })
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
