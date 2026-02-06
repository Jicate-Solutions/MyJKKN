import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { HealthScoreService } from '@/lib/services/analytics/health-score-service';

/**
 * GET /api/analytics/usage/comparison
 * Returns cross-institution comparison data (super admin only)
 *
 * Query params:
 * - days: Number of days to look back (default: 30)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_super_admin')
      .eq('id', user.id)
      .single();

    if (!profile?.is_super_admin) {
      return NextResponse.json(
        { error: 'Forbidden - super admin access required' },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get('days') || '30', 10);

    const data = await HealthScoreService.getInstitutionComparison(user.id, days);

    return NextResponse.json({ data });
  } catch (error) {
    console.error('[analytics/usage/comparison] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch comparison data' },
      { status: 500 }
    );
  }
}
