// app/api/parent-portal/learner/[id]/attendance/route.ts
// Protected endpoint: Returns learner attendance data for authenticated parents only
// SECURITY: Validates parent session AND parent-learner relationship before returning data

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { ParentSessionService } from '@/lib/services/parent-portal/parent-session-service';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: learnerId } = await context.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(learnerId)) {
      return NextResponse.json(
        { error: 'Invalid learner ID format' },
        { status: 400 }
      );
    }

    // Validate parent session
    const parentId = await ParentSessionService.getCurrentParentId();
    if (!parentId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Use service role client because parent portal uses custom session auth (not Supabase auth)
    // RLS policies check auth.uid() which is null for parent portal requests
    const supabase = createServiceRoleClient();

    // SECURITY: Verify parent-learner relationship before returning data
    const { data: link, error: linkError } = await supabase
      .from('parent_learner_links')
      .select('id')
      .eq('parent_id', parentId)
      .eq('learner_id', learnerId)
      .limit(1)
      .maybeSingle();

    if (linkError) {
      console.error('[parent-portal/learner/attendance] Link check error:', linkError);
      return NextResponse.json(
        { error: 'Failed to verify access' },
        { status: 500 }
      );
    }

    if (!link) {
      return NextResponse.json(
        { error: 'Access denied: learner not linked to your account' },
        { status: 403 }
      );
    }

    // Parse days parameter from query string
    const daysParam = request.nextUrl.searchParams.get('days');
    const days = daysParam ? Math.min(Math.max(parseInt(daysParam, 10) || 30, 1), 365) : 30;

    // Now safe to call the RPC
    const { data, error } = await supabase.rpc('get_learner_attendance_for_parent', {
      p_learner_id: learnerId,
      p_days: days,
    });

    if (error) {
      console.error('[parent-portal/learner/attendance] RPC error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch attendance data' },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[parent-portal/learner/attendance] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch attendance data' },
      { status: 500 }
    );
  }
}
