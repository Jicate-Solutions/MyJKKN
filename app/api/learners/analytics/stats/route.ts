export const dynamic = 'force-dynamic';

// ============================================
// LEARNERS ANALYTICS STATS API
// ============================================
// Created: 2026-01-05
// Updated: 2026-01-20 - Moved from /dashboard/stats to /analytics/stats
// Purpose: Server-side API for analytics statistics
// Fixes: CORS errors when calling from client components
// Note: Caching handled by React Query on client side (staleTime: 0 for real-time)
// Architecture: This route uses Supabase auth which requires cookies() - cannot use 'use cache'
// ============================================

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { LearnerProfileService } from '@/lib/services/learner-profile-service';
import { resolveInstitutionScope } from '@/lib/auth/institution-scope';
import type { LearnerDashboardFilters } from '@/types/learner-dashboard';

/**
 * GET /api/learners/analytics/stats
 *
 * Fetch comprehensive analytics statistics
 *
 * Caching Strategy:
 * - Server-side: No caching (uses cookies for auth - incompatible with 'use cache')
 * - Client-side: React Query with staleTime: 0 for real-time data
 * - Database: Optimized queries with indexes (idx_learners_profiles_updated_at)
 *
 * Query Parameters:
 * - institutionIds: comma-separated list of institution IDs
 * - academicYearId: filter by academic year
 * - admissionYear: filter by admission cohort, as a calendar year (e.g. 2026)
 * - degreeId: filter by degree
 * - departmentId: filter by department
 * - programId: filter by program
 * - semesterId: filter by semester
 * - sectionId: filter by section
 * - lifecycleStatuses: comma-separated list of lifecycle statuses (enquiry, pending, approved, active, etc.)
 * - isProfileComplete: filter by profile completion (true/false)
 * - gender: filter by gender (male/female/other)
 * - dateFrom: start date for date range filter
 * - dateTo: end date for date range filter
 */
export async function GET(request: NextRequest) {
  // Note: Cannot use 'use cache' here because createClient() uses cookies() for auth
  // This is a fundamental limitation of Next.js 16 Cache Components with auth

  try {
    // Check authentication
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check permissions
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_super_admin, institution_id')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      );
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;

    const filters: LearnerDashboardFilters = {};

    // Institution IDs
    // Omitting the param means "all institutions" from the client, so it must
    // not collapse to the caller's own institution for a super admin — theirs
    // points at their employer, not a college. See resolveInstitutionScope.
    const institutionIdsParam = searchParams.get('institutionIds');
    const institutionScope = resolveInstitutionScope(
      profile,
      institutionIdsParam ? institutionIdsParam.split(',').filter(Boolean) : null
    );
    if (institutionScope) {
      filters.institutionIds = institutionScope;
    }

    // Academic Year
    const academicYearId = searchParams.get('academicYearId');
    if (academicYearId) {
      filters.academicYearId = academicYearId;
    }

    // Admission Year
    //
    // A calendar year, not an admission_years row id — the service fans it out
    // to every institution's row for that year. Parsed strictly: a junk value
    // must not become NaN and travel into the query as a real predicate.
    const admissionYearParam = searchParams.get('admissionYear');
    if (admissionYearParam) {
      const admissionYear = Number(admissionYearParam);
      if (Number.isFinite(admissionYear)) {
        filters.admissionYear = admissionYear;
      }
    }

    // Degree
    const degreeId = searchParams.get('degreeId');
    if (degreeId) {
      filters.degreeId = degreeId;
    }

    // Department
    const departmentId = searchParams.get('departmentId');
    if (departmentId) {
      filters.departmentId = departmentId;
    }

    // Program
    const programId = searchParams.get('programId');
    if (programId) {
      filters.programId = programId;
    }

    // Semester
    const semesterId = searchParams.get('semesterId');
    if (semesterId) {
      filters.semesterId = semesterId;
    }

    // Section
    const sectionId = searchParams.get('sectionId');
    if (sectionId) {
      filters.sectionId = sectionId;
    }

    // Lifecycle Statuses
    const lifecycleStatusesParam = searchParams.get('lifecycleStatuses');
    if (lifecycleStatusesParam) {
      filters.lifecycleStatuses = lifecycleStatusesParam.split(',').filter(Boolean) as any;
    }

    // Profile Completion
    const isProfileCompleteParam = searchParams.get('isProfileComplete');
    if (isProfileCompleteParam !== null) {
      filters.isProfileComplete = isProfileCompleteParam === 'true';
    }

    // Gender
    //
    // Normalised to the stored canon (Title Case) rather than allow-listed
    // verbatim: the previous check only accepted lower case, which is exactly
    // what the dashboard used to send and what then matched zero rows. Taking
    // the value case-insensitively keeps any bookmarked `?gender=male` working
    // now that the filter panel emits 'Male'.
    const genderParam = searchParams.get('gender');
    const gender = genderParam
      ? (['Male', 'Female', 'Other'] as const).find(
          (g) => g.toLowerCase() === genderParam.trim().toLowerCase()
        )
      : undefined;
    if (gender) {
      filters.gender = gender;
    }

    // Date Range
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    if (dateFrom && dateTo) {
      filters.dateRange = {
        from: new Date(dateFrom),
        to: new Date(dateTo)
      };
    }

    // Fetch dashboard stats using the service with server-side Supabase client
    const stats = await LearnerProfileService.getDashboardStats(filters, supabase);

    return NextResponse.json(stats, {
      headers: {
        'Cache-Control': 'no-store, max-age=0'
      }
    });
  } catch (error) {
    console.error('[api/learners/analytics/stats] Error:', error);

    return NextResponse.json(
      {
        error: 'Failed to fetch dashboard stats',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
