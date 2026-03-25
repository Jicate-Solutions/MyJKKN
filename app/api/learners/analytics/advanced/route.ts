import { NextRequest, NextResponse } from 'next/server';
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
