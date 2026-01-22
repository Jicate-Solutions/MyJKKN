// app/api/learners/change-requests/history/[learnerId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { LearnerProfileChangeService } from '@/lib/services/learner-profile-change-service';

/**
 * GET /api/learners/change-requests/history/[learnerId]
 * Get all change requests for a specific learner (history)
 *
 * Security: Students can only view their own requests
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ learnerId: string }> }
) {
  try {
    const supabase = await createClient();
    const { learnerId } = await params;

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // Get user's profile to verify role and access
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role, learner_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ message: 'Profile not found' }, { status: 404 });
    }

    // Students can only view their own requests
    if (profile.role === 'student') {
      // Verify the student owns this learner profile
      if (!profile.learner_id || profile.learner_id !== learnerId) {
        return NextResponse.json(
          { message: 'You can only view your own change requests' },
          { status: 403 }
        );
      }
    }

    // Fetch all change requests for the learner
    const requests = await LearnerProfileChangeService.getAllChangeRequestsForLearner(learnerId);

    return NextResponse.json({
      success: true,
      data: requests,
    });
  } catch (error: any) {
    console.error('[change-requests-history] Error:', error);
    return NextResponse.json(
      { message: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
