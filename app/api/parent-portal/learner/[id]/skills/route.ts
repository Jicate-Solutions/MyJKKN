// app/api/parent-portal/learner/[id]/skills/route.ts
// Protected endpoint: Returns learner skill progression data for authenticated parents
// SECURITY: Validates parent session AND parent-learner relationship before returning data

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { ParentSessionService } from '@/lib/services/parent-portal/parent-session-service';
import { ParentSkillService } from '@/lib/services/parent-portal/parent-skill-service';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_req: NextRequest, context: RouteContext) {
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
      console.error('[parent-portal/learner/skills] Link check error:', linkError);
      return NextResponse.json(
        { error: 'Failed to verify access' },
        { status: 500 }
      );
    }

    if (!link) {
      return NextResponse.json(
        { error: 'Access denied: Learner not linked to your account' },
        { status: 403 }
      );
    }

    // Fetch skill data
    const skillData = await ParentSkillService.getSkillDataForLearner(learnerId);

    return NextResponse.json(skillData);
  } catch (error) {
    console.error('[parent-portal/learner/skills] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch skill data' },
      { status: 500 }
    );
  }
}
