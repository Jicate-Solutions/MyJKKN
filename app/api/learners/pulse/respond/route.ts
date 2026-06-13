// app/api/learners/pulse/respond/route.ts
// POST /api/learners/pulse/respond
// Submit a student's response to a mandatory pulse question.
// Body: { notification_id: string, response_value: string }
// Creates a learner_pulse_responses row and marks the notification acknowledged.

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { LearnerPulseService } from '@/services/learner-pulse-service';

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

    // Parse body
    const body = await request.json();
    const { notification_id, response_value } = body;

    if (!notification_id || typeof notification_id !== 'string') {
      return NextResponse.json(
        { error: 'notification_id is required' },
        { status: 400 }
      );
    }

    if (!response_value || typeof response_value !== 'string') {
      return NextResponse.json(
        { error: 'response_value is required' },
        { status: 400 }
      );
    }

    if (response_value.length > 500) {
      return NextResponse.json(
        { error: 'response_value must be 500 characters or fewer' },
        { status: 400 }
      );
    }

    // Get profile + learner_id for this user
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('learner_id, institution_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.learner_id) {
      return NextResponse.json(
        { error: 'User is not a learner' },
        { status: 403 }
      );
    }

    // Get the notification to extract question + pulse_type from metadata
    const { data: notification, error: notifError } = await supabase
      .from('notifications')
      .select('id, body, metadata')
      .eq('id', notification_id)
      .eq('category', 'mandatory_pulse')
      .single();

    if (notifError || !notification) {
      return NextResponse.json(
        { error: 'Pulse notification not found' },
        { status: 404 }
      );
    }

    const metadata = notification.metadata as Record<string, unknown> | null;

    await LearnerPulseService.respondToPulse(supabase, {
      learner_id: profile.learner_id,
      institution_id: profile.institution_id || '',
      notification_id: notification.id,
      response_value,
      pulse_type: (metadata?.pulse_type as string) || 'belonging',
      question_text: (metadata?.question as string) || notification.body || '',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[pulse/respond] Error submitting pulse response:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
