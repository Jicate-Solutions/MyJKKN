import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { LearnerRiskService } from '@/services/learner-risk-service';

/**
 * GET /api/learners/[id]/risk-history
 *
 * Query params:
 *  - days (default 30)
 *
 * Returns: { data: [{ date, score, tier }] }
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
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      );
    }

    const allowedRoles = [
      'principal',
      'hod',
      'faculty',
      'admin',
      'counselor',
      'accounts',
    ];
    if (!profile.is_super_admin && !allowedRoles.includes(profile.role)) {
      return NextResponse.json(
        { error: 'Forbidden - insufficient permissions' },
        { status: 403 }
      );
    }

    const { id: learner_id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get('days') || '30', 10);

    const history = await LearnerRiskService.getRiskHistory(
      supabase,
      learner_id,
      days
    );

    return NextResponse.json({ data: history });
  } catch (error) {
    console.error('[API] Error in risk-history:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
