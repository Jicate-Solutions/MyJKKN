import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { LearnerAdvancedAnalyticsService } from '@/lib/services/learner-advanced-analytics-service';
import type { LearnerDashboardFilters } from '@/types/learner-analytics';
import { logger } from '@/lib/utils/enhanced-logger';

/**
 * GET /api/learners/analytics/advanced
 * Returns advanced analytics: Intake & Capacity, Geography, Trends, School Feeders
 *
 * Query Parameters:
 * - institutionId: Filter by institution
 * - degreeId: Filter by degree
 * - departmentId: Filter by department
 * - programId: Filter by program
 * - semesterId: Filter by semester
 * - sectionId: Filter by section
 * - academicYearId: Filter by academic year
 * - lifecycleStatus: Filter by lifecycle status (comma-separated or multiple params)
 * - gender: Filter by gender
 * - dateFrom: Start date filter
 * - dateTo: End date filter
 */
export async function GET(request: NextRequest) {
  try {
    // Authentication check
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user profile for institution scoping
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, institution_id, is_super_admin')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const isSuperAdmin = profile.is_super_admin || profile.role === 'super_admin';

    const searchParams = request.nextUrl.searchParams;

    // Parse filters from URL params
    const filters: LearnerDashboardFilters = {
      institutionId: searchParams.get('institutionId') || undefined,
      degreeId: searchParams.get('degreeId') || undefined,
      departmentId: searchParams.get('departmentId') || undefined,
      programId: searchParams.get('programId') || undefined,
      semesterId: searchParams.get('semesterId') || undefined,
      sectionId: searchParams.get('sectionId') || undefined,
      academicYearId: searchParams.get('academicYearId') || undefined,
      gender: searchParams.get('gender') || undefined,
      dateFrom: searchParams.get('dateFrom') || undefined,
      dateTo: searchParams.get('dateTo') || undefined,
    };

    // Institution scoping: non-super-admins must be scoped to their institution
    if (!isSuperAdmin && !filters.institutionId && profile.institution_id) {
      filters.institutionId = profile.institution_id;
    }

    // Handle lifecycle status (can be multiple values)
    const lifecycleStatus = searchParams.getAll('lifecycleStatus');
    if (lifecycleStatus.length > 0) {
      filters.lifecycleStatus = lifecycleStatus;
    }

    logger.info('learners/analytics/advanced', 'Fetching advanced analytics', { filters });

    // Fetch analytics data
    const analytics = await LearnerAdvancedAnalyticsService.getAdvancedAnalytics(filters);

    logger.info('learners/analytics/advanced', 'Advanced analytics fetched successfully', {
      intakeCapacityCount: analytics.intakeCapacity.length,
      districtCount: analytics.geography.districtContributions.length,
      schoolCount: analytics.schoolFeeders.totalSchools,
    });

    return NextResponse.json(analytics);
  } catch (error) {
    logger.error('learners/analytics/advanced', 'Failed to fetch advanced analytics', error);

    return NextResponse.json(
      {
        error: 'Failed to fetch advanced analytics',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
