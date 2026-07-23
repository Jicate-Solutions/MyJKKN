// app/api/cron/induction-mentorship-rollover/route.ts
// ============================================================================
// Senior Peer Mentor — year-end rollover (P2c-1).
//
// Ends mentorships whose freshers' first academic year has passed: flips the
// volunteer row to is_active=false + ended_at, and releases its freshers (drops
// the group rows), via fn_induction_close_ended_mentorships(). Next year's
// freshers get fresh mentors; a mentor never carries into the freshers' 2nd year.
//
// Correctness does NOT depend on this cron firing on time — the mentor write
// RPCs (mark_attendance / submit_feedback) also gate live on the academic year's
// end_date. This cron is state-hygiene: it makes the ended state visible and
// releases freshers for clean reporting. Safe to run daily; on any given day it
// closes only the mentorships whose academic_years.end_date < today.
//
// Auth: CRON_SECRET via Authorization: Bearer <secret> OR ?secret= query param.
// Scheduled in vercel.json.
// ============================================================================

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (cronSecret) {
    const headerOk = authHeader === `Bearer ${cronSecret}`;
    const queryOk = querySecret === cronSecret;
    if (!headerOk && !queryOk) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.rpc('fn_induction_close_ended_mentorships');
    if (error) throw error;

    const closed = (data as number) ?? 0;
    if (closed > 0) {
      logger.warn('induction/mentorship-rollover', `Closed ${closed} ended Senior Peer Mentor assignment(s).`);
    }
    return NextResponse.json({
      success: true,
      closed,
      duration_ms: Date.now() - startTime,
    });
  } catch (error: any) {
    logger.error('induction/mentorship-rollover', 'Rollover failed', error);
    return NextResponse.json(
      { success: false, error: error?.message ?? String(error) },
      { status: 500 },
    );
  }
}
