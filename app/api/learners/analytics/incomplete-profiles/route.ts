// ============================================
// INCOMPLETE PROFILES API
// ============================================
// Created: 2026-02-09
// Purpose: Fetch detailed incomplete learner profiles with missing field info
// Used by: Profile Completion Tab drill-down table
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { IncompleteProfileDetail } from '@/types/learner-dashboard';

/**
 * GET /api/learners/analytics/incomplete-profiles
 *
 * Returns detailed list of learners with incomplete profiles,
 * including which fields are missing and related academic info.
 *
 * Query Parameters:
 * - institutionIds: comma-separated institution IDs
 * - limit: max results (default 50, max 100)
 */
export async function GET(request: NextRequest) {
  try {
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

    const searchParams = request.nextUrl.searchParams;

    // Parse limit
    const limitParam = parseInt(searchParams.get('limit') || '50', 10);
    const limit = Math.min(Math.max(1, limitParam), 100);

    // Build query
    let query = supabase
      .from('learners_profiles')
      .select(
        `
        id,
        first_name,
        last_name,
        college_email,
        lifecycle_status,
        roll_number,
        application_id,
        created_at,
        academic_year_id,
        semester_id,
        section_id,
        program:programs(id, program_name),
        semester:semesters(id, semester_name),
        section:sections(id, section_name),
        academic_year:academic_years(id, academic_year_name)
      `,
        { count: 'exact' }
      )
      .or('is_profile_complete.eq.false,is_profile_complete.is.null')
      .order('created_at', { ascending: false })
      .limit(limit);

    // Apply institution filter
    const institutionIdsParam = searchParams.get('institutionIds');
    if (institutionIdsParam) {
      const institutionIds = institutionIdsParam.split(',').filter(Boolean);
      if (institutionIds.length > 0) {
        query = query.in('institution_id', institutionIds);
      }
    } else if (profile.institution_id) {
      query = query.eq('institution_id', profile.institution_id);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[api/learners/analytics/incomplete-profiles] Query error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch incomplete profiles', details: error.message },
        { status: 500 }
      );
    }

    // Compute missing fields per profile and auto-fix stale flags
    const staleIds: string[] = [];
    const profiles: IncompleteProfileDetail[] = (data || []).map((row: any) => {
      const missingFields: string[] = [];

      if (!row.college_email) missingFields.push('College Email');
      if (!row.academic_year_id) missingFields.push('Academic Year');
      if (!row.semester_id) missingFields.push('Semester');
      if (!row.section_id) missingFields.push('Section');

      // Detect stale is_profile_complete flag (all fields present but flag is false)
      if (missingFields.length === 0) {
        staleIds.push(row.id);
      }

      return {
        id: row.id,
        first_name: row.first_name,
        last_name: row.last_name,
        college_email: row.college_email,
        lifecycle_status: row.lifecycle_status,
        roll_number: row.roll_number,
        application_id: row.application_id,
        created_at: row.created_at,
        missingFields,
        program_name: row.program?.program_name ?? null,
        semester_name: row.semester?.semester_name ?? null,
        section_name: row.section?.section_name ?? null,
        academic_year_name: row.academic_year?.academic_year_name ?? null,
      };
    });

    // Auto-fix stale is_profile_complete flags in the background
    if (staleIds.length > 0) {
      supabase
        .from('learners_profiles')
        .update({ is_profile_complete: true, updated_at: new Date().toISOString() })
        .in('id', staleIds)
        .then(({ error: fixError }) => {
          if (fixError) {
            console.error('[api/learners/analytics/incomplete-profiles] Error fixing stale flags:', fixError);
          } else {
            console.log(`[api/learners/analytics/incomplete-profiles] Auto-fixed ${staleIds.length} stale is_profile_complete flags`);
          }
        });
    }

    // Filter out profiles with no actual missing fields (stale flags)
    const actualIncomplete = profiles.filter((p) => p.missingFields.length > 0);

    return NextResponse.json(
      { profiles: actualIncomplete, total: actualIncomplete.length, limit },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    console.error('[api/learners/analytics/incomplete-profiles] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch incomplete profiles',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
