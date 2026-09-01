export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
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
 * - admissionYear: Filter by admission cohort, as a calendar year (e.g. 2026)
 * - lifecycleStatus: Filter by lifecycle status (comma-separated or multiple params)
 * - gender: Filter by gender
 * - dateFrom: Start date filter
 * - dateTo: End date filter
 */
/**
 * Guarded 2026-09-01. Unauthenticated callers got HTTP 200 with every array
 * empty and every ratio 0 — not a leak (RLS blocked the reads) but a dishonest
 * answer: 'you are not signed in' rendered identically to 'the cohort has no
 * learners'. The same failure this codebase names elsewhere, where a missing
 * permission made everyone read as excluded. 401 says which it is.
 */
export const GET = withAuth(async (request: NextRequest) => {
  await connection();
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

    // Admission cohort — a calendar year, fanned out to admission_years row
    // ids in the service. Parsed strictly so a junk value cannot arrive as
    // NaN and be treated as a real filter.
    const admissionYearParam = searchParams.get('admissionYear');
    if (admissionYearParam) {
      const admissionYear = Number(admissionYearParam);
      if (Number.isFinite(admissionYear)) {
        filters.admissionYear = admissionYear;
      }
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
}, {
  requiredPermission: 'read',
  // Two sessions hardened this route independently on 2026-09-01 and the rebase
  // put both fixes here. Keeping the stronger set: `requiredPermission` alone
  // only proves a session exists, so any authenticated user could still read
  // analytics the UI denies them. `requirePermission` runs the same
  // `is_super_admin() OR is_admin() OR user_has_permission(key)` triad the RLS
  // policies use, so Role Management stays the single source of truth. The key
  // matches the client-side gate the page already applies, and is granted to 16
  // roles, so no caller who works today loses access.
  requirePermission: 'learners.dashboard.view',
  // This backs a UI dashboard and is not part of the documented B2A tool
  // surface. Fail closed; opt in deliberately if that changes.
  allowApiKey: false,
});
