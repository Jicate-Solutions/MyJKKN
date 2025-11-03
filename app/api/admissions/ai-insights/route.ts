import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AdmissionService } from '@/lib/services/admission/admission-service';
import { AdmissionAIService } from '@/lib/services/admission/admission-ai-service';
import { AdmissionAnalyticsFilters } from '@/types/admission';

/**
 * GET /api/admissions/ai-insights
 *
 * Generates AI-powered insights from admissions analytics data.
 *
 * Query Parameters:
 * - institution_id?: string
 * - degree_id?: string
 * - department_id?: string
 * - program_id?: string
 * - status?: string
 * - state?: string
 * - district?: string
 * - from?: ISO date string
 * - to?: ISO date string
 *
 * Returns:
 * - 200: AdmissionAIInsights object
 * - 401: Unauthorized (not logged in)
 * - 403: Forbidden (no permission)
 * - 500: Server error
 *
 * Security:
 * - Requires authentication
 * - Requires 'admissions.dashboard' permission
 * - Institution filtering applied for non-super-admin users
 * - API key kept server-side only
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Authenticate user
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Check permissions
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role, is_super_admin, institution_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Failed to fetch user profile' },
        { status: 500 }
      );
    }

    // Get user's role and permissions
    const { data: roleData, error: roleError } = await supabase
      .from('custom_roles')
      .select('permissions')
      .eq('role_key', profile.role)
      .single();

    if (roleError) {
      return NextResponse.json(
        { error: 'Failed to fetch role permissions' },
        { status: 500 }
      );
    }

    // Check for admissions.dashboard permission
    const permissions = roleData?.permissions || {};
    const hasPermission =
      permissions['all'] === true ||
      permissions['admissions.dashboard'] === true ||
      permissions['admissions.analytics.view'] === true ||
      profile.is_super_admin;

    if (!hasPermission) {
      return NextResponse.json(
        { error: 'You do not have permission to access admissions analytics' },
        { status: 403 }
      );
    }

    // 3. Check if Claude API is configured
    const configStatus = AdmissionAIService.getConfigStatus();
    if (!configStatus.configured) {
      return NextResponse.json(
        { error: configStatus.message },
        { status: 503 }
      );
    }

    // 4. Parse query parameters
    const { searchParams } = new URL(request.url);

    const filters: AdmissionAnalyticsFilters = {};

    // Institution filter
    const institutionId = searchParams.get('institution_id');
    if (institutionId) {
      filters.institution_id = institutionId;
    }

    // Degree filter
    const degreeId = searchParams.get('degree_id');
    if (degreeId) {
      filters.degree_id = degreeId;
    }

    // Department filter
    const departmentId = searchParams.get('department_id');
    if (departmentId) {
      filters.department_id = departmentId;
    }

    // Program filter
    const programId = searchParams.get('program_id');
    if (programId) {
      filters.program_id = programId;
    }

    // Status filter
    const status = searchParams.get('status');
    if (status) {
      filters.status = status;
    }

    // State filter
    const state = searchParams.get('state');
    if (state) {
      filters.state = state;
    }

    // District filter
    const district = searchParams.get('district');
    if (district) {
      filters.district = district;
    }

    // Date range filter
    const fromDate = searchParams.get('from');
    const toDate = searchParams.get('to');
    if (fromDate && toDate) {
      filters.dateRange = {
        from: new Date(fromDate),
        to: new Date(toDate)
      };
    }

    // 5. Fetch analytics data with server-side client and user context
    const userContext = {
      userId: user.id,
      institutionId: profile.institution_id,
      isSuperAdmin: profile.is_super_admin || false
    };

    const analytics = await AdmissionService.getDashboardAnalytics(
      filters,
      supabase,
      userContext
    );

    // 6. Generate AI insights
    const insights = await AdmissionAIService.generateInsights(analytics);

    // 7. Return insights
    return NextResponse.json(insights, { status: 200 });
  } catch (error) {
    console.error('[api/admissions/ai-insights] Error:', error);

    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('CLAUDE_API_KEY')) {
        return NextResponse.json(
          { error: 'AI service not configured. Please contact administrator.' },
          { status: 503 }
        );
      }

      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { error: 'Failed to generate AI insights' },
      { status: 500 }
    );
  }
}
