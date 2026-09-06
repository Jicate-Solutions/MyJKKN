import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { LearnerRiskService } from '@/services/learner-risk-service';

/**
 * GET /api/learners/risk-summary
 *
 * Query params:
 *  - institution_id (required)
 *  - department_id, section_id (optional scope)
 *
 * Returns: { critical, high, moderate, low, healthy, total }
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
      .select('role, is_super_admin, institution_id, department_id')
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

    const searchParams = request.nextUrl.searchParams;
    const institution_id = searchParams.get('institution_id');

    if (!institution_id) {
      return NextResponse.json(
        { error: 'Missing required parameter: institution_id' },
        { status: 400 }
      );
    }

    const department_id = searchParams.get('department_id') || undefined;
    const section_id = searchParams.get('section_id') || undefined;

    const summary = await LearnerRiskService.getRiskSummary(
      supabase,
      institution_id,
      department_id,
      section_id
    );

    return NextResponse.json(summary);
  } catch (error) {
    console.error('[API] Error in risk-summary:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
