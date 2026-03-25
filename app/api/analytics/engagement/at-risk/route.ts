import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { EngagementService } from '@/lib/services/analytics/engagement-service';
import type { AtRiskRequest } from '@/types/analytics';

/**
 * GET /api/analytics/engagement/at-risk
 * Get list of at-risk students for early intervention
 *
 * Query params:
 * - level: OrganizationalLevel (institution | department | program | semester | section)
 * - id: UUID of the entity
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

    // Allow access for admins, faculty, and counselors
    const allowedRoles = [
      'principal',
      'hod',
      'faculty',
      'admin',
      'counselor',
      'accounts'
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
    const atRiskRequest: AtRiskRequest = {
      level: level as any,
      id
    };

    // Fetch at-risk students
    const students = await EngagementService.getAtRiskStudents(
      atRiskRequest,
      user.id
    );

    return NextResponse.json({
      success: true,
      count: students.length,
      data: students
    });
  } catch (error) {
    console.error('[Analytics API] Error in at-risk endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
