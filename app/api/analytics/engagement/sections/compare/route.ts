import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { EngagementService } from '@/lib/services/analytics/engagement-service';
import type { SectionComparisonRequest } from '@/types/analytics';

/**
 * GET /api/analytics/engagement/sections/compare
 * Compare engagement metrics across sections in a semester
 *
 * Query params:
 * - semester_id: UUID of the semester
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

    // Allow access for admins, HODs, and principals
    const allowedRoles = ['principal', 'hod', 'admin'];

    if (!profile.is_super_admin && !allowedRoles.includes(profile.role)) {
      return NextResponse.json(
        { error: 'Forbidden - insufficient permissions' },
        { status: 403 }
      );
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const semesterId = searchParams.get('semester_id');

    // Validate required parameters
    if (!semesterId) {
      return NextResponse.json(
        { error: 'Missing required parameter: semester_id' },
        { status: 400 }
      );
    }

    // Validate semester ID (should be UUID)
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(semesterId)) {
      return NextResponse.json(
        { error: 'Invalid semester ID format' },
        { status: 400 }
      );
    }

    // Build request object
    const comparisonRequest: SectionComparisonRequest = {
      semesterId
    };

    // Fetch section comparison data
    const sections = await EngagementService.getSectionComparison(
      comparisonRequest,
      user.id
    );

    return NextResponse.json({
      success: true,
      count: sections.length,
      data: sections
    });
  } catch (error) {
    console.error('[Analytics API] Error in section comparison endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
