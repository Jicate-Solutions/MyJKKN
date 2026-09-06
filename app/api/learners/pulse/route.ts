// app/api/learners/pulse/route.ts
// GET  /api/learners/pulse?learner_id=UUID — Pulse history for a student (advisor view)
// POST /api/learners/pulse — Create a new pulse notification targeting a learner (admin/system)

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { LearnerPulseService } from '@/services/learner-pulse-service';

/**
 * GET /api/learners/pulse?learner_id=UUID
 * Returns pulse response history for a given learner.
 * Used by advisors/faculty to review a student's pulse trail.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const learnerId = request.nextUrl.searchParams.get('learner_id');

    if (!learnerId) {
      return NextResponse.json(
        { error: 'learner_id query parameter is required' },
        { status: 400 }
      );
    }

    // Permission check: allow staff/admin or the learner themselves
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, learner_id, is_super_admin')
      .eq('id', user.id)
      .single();

    const isOwnProfile = profile?.learner_id === learnerId;
    const staffRoles = [
      'admin',
      'principal',
      'hod',
      'faculty',
      'counselor',
      'super_admin',
    ];
    const isStaff =
      profile?.is_super_admin || staffRoles.includes(profile?.role || '');

    if (!isOwnProfile && !isStaff) {
      return NextResponse.json(
        { error: 'Forbidden - insufficient permissions' },
        { status: 403 }
      );
    }

    const history = await LearnerPulseService.getPulseHistory(
      supabase,
      learnerId
    );

    return NextResponse.json({
      success: true,
      data: history,
      count: history.length,
    });
  } catch (error) {
    console.error('[pulse] Error fetching pulse history:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/learners/pulse
 * Create a new mandatory pulse notification targeting a specific learner.
 * Body: { institution_id, learner_id, pulse_type, question, response_type }
 * Used by admin/system/cron to schedule pulse checks.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admin/staff can create pulses
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_super_admin')
      .eq('id', user.id)
      .single();

    const adminRoles = ['admin', 'principal', 'super_admin'];
    const isAdmin =
      profile?.is_super_admin || adminRoles.includes(profile?.role || '');

    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden - only admins can create pulse notifications' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { institution_id, learner_id, pulse_type, question, response_type } =
      body;

    // Validate required fields
    if (!institution_id || !learner_id || !question) {
      return NextResponse.json(
        {
          error:
            'institution_id, learner_id, and question are required',
        },
        { status: 400 }
      );
    }

    const validPulseTypes = ['belonging', 'academic_fit', 'wellbeing', 'custom'];
    if (pulse_type && !validPulseTypes.includes(pulse_type)) {
      return NextResponse.json(
        { error: `pulse_type must be one of: ${validPulseTypes.join(', ')}` },
        { status: 400 }
      );
    }

    const validResponseTypes = ['yes_no', 'free_text'];
    if (response_type && !validResponseTypes.includes(response_type)) {
      return NextResponse.json(
        {
          error: `response_type must be one of: ${validResponseTypes.join(', ')}`,
        },
        { status: 400 }
      );
    }

    const result = await LearnerPulseService.createPulseNotification(supabase, {
      institution_id,
      learner_id,
      pulse_type: pulse_type || 'belonging',
      question,
      response_type: response_type || 'yes_no',
      created_by: user.id,
    });

    return NextResponse.json({
      success: true,
      notification_id: result.notification_id,
    });
  } catch (error) {
    console.error('[pulse] Error creating pulse notification:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
