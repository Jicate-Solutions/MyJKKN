import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { HealthScoreService } from '@/lib/services/analytics/health-score-service';

/**
 * GET /api/analytics/usage/health-scores
 * Returns institution health scores
 *
 * Query params:
 * - institution_id: Optional UUID filter
 * - score_date: Optional ISO date (defaults to today)
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

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const allowedRoles = ['principal', 'hod', 'admin', 'accounts'];
    if (!profile.is_super_admin && !allowedRoles.includes(profile.role)) {
      return NextResponse.json(
        { error: 'Forbidden - insufficient permissions' },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const data = await HealthScoreService.getHealthScores(
      user.id,
      searchParams.get('institution_id') || undefined,
      searchParams.get('score_date') || undefined
    );

    return NextResponse.json({ data });
  } catch (error) {
    console.error('[analytics/usage/health-scores] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch health scores' },
      { status: 500 }
    );
  }
}
