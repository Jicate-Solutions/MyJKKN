/**
 * GET /api/internal-marks/my-running-attendance
 *
 * The learner's own transparency score (Director, 2026-07-13: "you start at
 * 100 out of 100 and watch how much it comes down — there is no transparency").
 * Per-course running present/total/% from the first recorded session, computed
 * from the SAME day-one attendance record the exam audit holds departments to.
 *
 * SELF-SCOPED by construction: fn_my_running_attendance reads only the caller's
 * own learner rows (profiles.learner_id of auth.uid()); a staff caller gets an
 * empty list, never an error.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { MyRunningAttendanceRow } from '@/types/exam-audit';

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase.rpc('fn_my_running_attendance');
    if (error) {
      return NextResponse.json(
        { error: `Failed to compute your attendance: ${error.message}` },
        { status: 500 },
      );
    }
    return NextResponse.json({
      courses: (data ?? []) as MyRunningAttendanceRow[],
    });
  } catch (error) {
    console.error('[internal-marks/my-running-attendance] error:', error);
    return NextResponse.json(
      { error: 'Failed to load your running attendance.' },
      { status: 500 },
    );
  }
}
