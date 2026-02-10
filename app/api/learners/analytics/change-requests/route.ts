// ============================================
// CHANGE REQUEST ANALYTICS API
// ============================================
// Created: 2026-02-10
// Purpose: Analytics endpoint for change request dashboard tab
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { LearnerProfileChangeService } from '@/lib/services/learner-profile-change-service';

/**
 * GET /api/learners/analytics/change-requests
 *
 * Query Parameters:
 * - institutionId: optional institution filter (non-super-admins auto-restricted)
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

    // Get user profile for role-based filtering
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

    // Determine institution filter
    const searchParams = request.nextUrl.searchParams;
    let institutionId = searchParams.get('institutionId') || undefined;

    // Non-super-admin users are restricted to their own institution
    if (profile.role !== 'super_admin' && profile.institution_id) {
      institutionId = profile.institution_id;
    }

    const analytics = await LearnerProfileChangeService.getChangeRequestAnalytics({
      institutionId,
    });

    return NextResponse.json(analytics, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    console.error('[api/learners/analytics/change-requests] Error:', error);

    return NextResponse.json(
      {
        error: 'Failed to fetch change request analytics',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
