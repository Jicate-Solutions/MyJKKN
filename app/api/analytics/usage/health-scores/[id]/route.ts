import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { HealthScoreService } from '@/lib/services/analytics/health-score-service';

/**
 * GET /api/analytics/usage/health-scores/[id]
 * Returns a single institution's health score with history
 *
 * Query params:
 * - days: Number of days of history (default: 30)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get('days') || '30', 10);

    const data = await HealthScoreService.getHealthScoreDetail(user.id, id, days);

    return NextResponse.json({ data });
  } catch (error) {
    console.error('[analytics/usage/health-scores/[id]] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch health score detail' },
      { status: 500 }
    );
  }
}
