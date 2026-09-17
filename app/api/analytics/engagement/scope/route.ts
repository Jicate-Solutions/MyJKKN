export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { EngagementService } from '@/lib/services/analytics/engagement-service';

/**
 * GET /api/analytics/engagement/scope
 * Which institutions, departments, programs, semesters and sections the
 * signed-in viewer may choose in the Engagement Analytics filters.
 *
 * Returns only the viewer's OWN scope, as ids (null = no limit at that picker),
 * so the screen can hide "All Institutions" and every choice outside it. The
 * screen is not the guard: the engagement routes refuse out-of-scope selections
 * with a 403 whatever the screen offers.
 */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const choices = await EngagementService.getScopeChoices(user.id);

    return NextResponse.json({ success: true, data: choices });
  } catch (error) {
    console.error('[Analytics API] Error in engagement scope endpoint:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
