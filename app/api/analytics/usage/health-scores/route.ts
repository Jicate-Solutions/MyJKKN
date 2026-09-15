export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { HealthScoreService } from '@/lib/services/analytics/health-score-service';

/**
 * GET /api/analytics/usage/health-scores
 * Returns institution health scores
 *
 * Query params:
 * - institution_id: Optional UUID filter. A super admin may name any
 *   institution; a principal, HOD, admin or accounts user only their own.
 *   Any other institution is a 403 with a plain message.
 * - score_date: Optional ISO date (defaults to today)
 *
 * With no institution_id, a super admin gets every institution and everyone
 * else only their own.
 */
export async function GET(request: NextRequest) {
  await connection();
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
    const institutionId = searchParams.get('institution_id') || undefined;

    // Refuse an institution outside the viewer's scope with a plain 403 before
    // any health score row is read, never an empty list (the service checks
    // again and filters).
    const access = await HealthScoreService.checkAccess(user.id, institutionId);
    if (!access.allowed) {
      return NextResponse.json({ error: access.reason }, { status: access.status });
    }

    const data = await HealthScoreService.getHealthScores(
      user.id,
      institutionId,
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
