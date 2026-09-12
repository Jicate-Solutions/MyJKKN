export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { EngagementService } from '@/lib/services/analytics/engagement-service';
import { ENGAGEMENT_INSTITUTION_STAFF_ROLES } from '@/lib/services/analytics/engagement-scope';

/**
 * GET /api/analytics/engagement/student/[id]
 * Get detailed engagement information for a specific student
 *
 * Path params:
 * - id: UUID of the student (user_id)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    // Authenticate user
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permissions
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_super_admin')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Allow access for principals, HODs, faculty, and admin, counsellor and
    // accounts staff (by their stored role names; the old 'counselor' no longer
    // exists). The scope gate below holds every role to its own scope.
    const allowedRoles: string[] = [
      'principal',
      'hod',
      'faculty',
      ...ENGAGEMENT_INSTITUTION_STAFF_ROLES
    ];

    if (!profile.is_super_admin && !allowedRoles.includes(profile.role)) {
      return NextResponse.json(
        { error: 'Forbidden - insufficient permissions' },
        { status: 403 }
      );
    }

    const studentId = id;

    // Validate student ID (should be UUID)
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(studentId)) {
      return NextResponse.json({ error: 'Invalid student ID' }, { status: 400 });
    }

    // Refuse a learner outside the viewer's scope with a plain 403 before any
    // of their sessions are read (the service checks again and filters).
    const access = await EngagementService.checkStudentAccess(user.id, studentId);
    if (!access.allowed) {
      return NextResponse.json({ error: access.reason }, { status: access.status });
    }

    // Fetch student detail
    const studentDetail = await EngagementService.getStudentDetail(
      studentId,
      user.id
    );

    if (!studentDetail) {
      return NextResponse.json(
        { error: 'Student not found or access denied' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: studentDetail
    });
  } catch (error) {
    console.error('[Analytics API] Error in student detail endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
