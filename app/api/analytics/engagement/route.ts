import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { EngagementService } from '@/lib/services/analytics/engagement-service';
import type { EngagementMetricsRequest } from '@/types/analytics';

/**
 * GET /api/analytics/engagement
 * Get engagement metrics for a specific organizational level
 *
 * Query params:
 * - level: OrganizationalLevel (institution | department | program | semester | section)
 * - id: UUID of the entity
 * - date_from: Optional start date (ISO format)
 * - date_to: Optional end date (ISO format)
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if user has analytics permission
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

    // Only allow specific roles to access analytics
    const allowedRoles = [
      'principal',
      'hod',
      'faculty',
      'admin',
      'accounts',
      'counselor'
    ];

    if (!profile.is_super_admin && !allowedRoles.includes(profile.role)) {
      return NextResponse.json(
        { error: 'Forbidden - insufficient permissions' },
        { status: 403 }
      );
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const level = searchParams.get('level');
    const id = searchParams.get('id');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');

    // Validate required parameters
    if (!level || !id) {
      return NextResponse.json(
        { error: 'Missing required parameters: level and id' },
        { status: 400 }
      );
    }

    // Validate level
    const validLevels = [
      'institution',
      'department',
      'program',
      'semester',
      'section'
    ];
    if (!validLevels.includes(level)) {
      return NextResponse.json(
        { error: 'Invalid level parameter' },
        { status: 400 }
      );
    }

    // Build request object
    const metricsRequest: EngagementMetricsRequest = {
      level: level as any,
      id,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined
    };

    // Fetch metrics
    const metrics = await EngagementService.getMetrics(metricsRequest, user.id);

    if (!metrics) {
      return NextResponse.json(
        { error: 'Failed to fetch metrics or access denied' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('[Analytics API] Error in engagement endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
