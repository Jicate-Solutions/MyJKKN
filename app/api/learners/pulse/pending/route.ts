// app/api/learners/pulse/pending/route.ts
// GET /api/learners/pulse/pending
// Check if the current authenticated user has a pending mandatory pulse.
// Returns { hasPending, pulse? } where pulse contains the question to show.

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { LearnerPulseService } from '@/services/learner-pulse-service';

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const pulse = await LearnerPulseService.getPendingPulse(supabase, user.id);

    return NextResponse.json({
      hasPending: pulse !== null,
      pulse: pulse ?? undefined,
    });
  } catch (error) {
    console.error('[pulse/pending] Error checking pending pulse:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
