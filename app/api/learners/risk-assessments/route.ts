import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { LearnerRiskService } from '@/services/learner-risk-service';
import type { RiskTier } from '@/services/learner-risk-service';

/**
 * GET /api/learners/risk-assessments
 *
 * Query params:
 *  - institution_id (required)
 *  - department_id, section_id (optional scope)
 *  - risk_tier (comma-separated: critical,high,moderate,low,healthy)
 *  - date (YYYY-MM-DD, defaults to today)
 *  - page (default 1)
 *  - page_size (default 50)
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
    const date = searchParams.get('date') || undefined;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const page_size = parseInt(searchParams.get('page_size') || '50', 10);

    // Parse comma-separated risk_tier
    const riskTierParam = searchParams.get('risk_tier');
    const risk_tier = riskTierParam
      ? (riskTierParam.split(',') as RiskTier[])
      : undefined;

    const result = await LearnerRiskService.getRiskAssessments(supabase, {
      institution_id,
      department_id,
      section_id,
      risk_tier,
      date,
      page,
      page_size,
    });

    return NextResponse.json({
      data: result.data,
      count: result.count,
      page,
      page_size,
    });
  } catch (error) {
    console.error('[API] Error in risk-assessments:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
