/**
 * GET /api/pde/tier-eligibility
 * ============================================================================
 *
 * Resolves PDE course-tier eligibility for a learner against the active
 * `pde.rollout.tier_eligibility` policy and returns whether the learner
 * qualifies for the requested tier.
 *
 * Query params:
 *   tier            (required) — 1 | 2 | 3
 *   learnerId       (required) — learner profile id
 *   priorTier1Passes (optional) — integer; if absent the service derives 0
 *   collegeSlug     (optional) — e.g. 'medical', 'engineering' (used by
 *                                natural_fit_only mode); if absent we try to
 *                                load it from the learner's profile row
 *   institutionId   (optional) — for per-institution policy resolution
 *
 * Tier 2 Item 3 of PDE consumer wiring.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  PDETierEligibilityService,
  type CourseTier,
} from '@/lib/services/pde-tier-eligibility-service';

export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const tierRaw = searchParams.get('tier');
    const learnerId = searchParams.get('learnerId');
    const priorRaw = searchParams.get('priorTier1Passes');
    const collegeSlug = searchParams.get('collegeSlug');
    const institutionId = searchParams.get('institutionId');

    if (!tierRaw || !learnerId) {
      return NextResponse.json(
        { error: 'tier and learnerId query params are required' },
        { status: 400 }
      );
    }

    const tierNum = Number(tierRaw);
    if (tierNum !== 1 && tierNum !== 2 && tierNum !== 3) {
      return NextResponse.json(
        { error: `tier must be 1, 2, or 3 (got '${tierRaw}')` },
        { status: 400 }
      );
    }
    const tier = tierNum as CourseTier;

    const profile = collegeSlug
      ? { college_slug: collegeSlug }
      : await PDETierEligibilityService.loadLearnerProfile(learnerId);

    const decision = await PDETierEligibilityService.checkCourseEligibility({
      tier,
      learnerId,
      institutionId: institutionId ?? null,
      learnerProfile: {
        ...profile,
        prior_tier_1_passes: priorRaw ? Math.max(0, Number(priorRaw) || 0) : 0,
      },
    });

    return NextResponse.json({ data: decision }, { status: 200 });
  } catch (error: any) {
    console.error('Error resolving tier eligibility:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
