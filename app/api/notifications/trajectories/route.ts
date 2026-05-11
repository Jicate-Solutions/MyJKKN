// app/api/notifications/trajectories/route.ts
//
// GET /api/notifications/trajectories?days=14
//   Returns per-category trajectory cards for the authenticated user's
//   daily-digest notifications. Used by the /notifications page TRENDS section.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getNotificationTrajectories } from '@/lib/services/notification/notification-trajectories-service';

export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const daysParam = request.nextUrl.searchParams.get('days');
    const days = daysParam ? Math.min(60, Math.max(1, parseInt(daysParam, 10) || 14)) : 14;

    const trajectories = await getNotificationTrajectories(supabase, user.id, days);

    return NextResponse.json({
      trajectories,
      window_days: days
    });
  } catch (error: any) {
    console.error('Error fetching notification trajectories:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
