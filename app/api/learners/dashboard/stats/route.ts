// ============================================
// LEARNERS DASHBOARD STATS API
// ============================================
// Created: 2026-01-05
// Purpose: Server-side API for dashboard statistics
// Fixes: CORS errors when calling from client components
// Note: No dynamic/runtime exports (incompatible with Cache Components mode)
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { LearnerProfileService } from '@/lib/services/learner-profile-service';
import type { LearnerDashboardFilters } from '@/types/learner-dashboard';

/**
 * GET /api/learners/dashboard/stats
 *
 * Fetch comprehensive dashboard statistics
 *
 * Query Parameters:
 * - institutionIds: comma-separated list of institution IDs
 * - academicYearId: filter by academic year
 * - degreeId: filter by degree
 * - departmentId: filter by department
 * - programId: filter by program
 * - semesterId: filter by semester
 * - sectionId: filter by section
 * - dateFrom: start date for date range filter
 * - dateTo: end date for date range filter
 */
export async function GET(request: NextRequest) {
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
      .select('role, institution_id')
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
    const institutionIdsParam = searchParams.get('institutionIds');
    if (institutionIdsParam) {
      filters.institutionIds = institutionIdsParam.split(',').filter(Boolean);
    } else if (profile.institution_id) {
      // If user has institution_id, restrict to that institution
      filters.institutionIds = [profile.institution_id];
    }

    // Academic Year
    const academicYearId = searchParams.get('academicYearId');
    if (academicYearId) {
      filters.academicYearId = academicYearId;
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
    console.error('[api/learners/dashboard/stats] Error:', error);

    return NextResponse.json(
      {
        error: 'Failed to fetch dashboard stats',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
