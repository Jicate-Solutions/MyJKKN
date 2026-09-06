// ============================================================================
// AI Routine schedules — read + edit (super_admin only)
// ============================================================================
// GET  → list all schedule rows (fn_ai_routine_schedules_list).
// POST → upsert one routine's schedule (fn_ai_routine_schedule_upsert):
//        { routineId, enabled, daysOfWeek: number[] (0=Sun..6=Sat), minuteOfDay: 0..1439 (IST) }
// Both RPCs enforce super_admin server-side; this route runs under the caller's
// Supabase session so the RPC sees the real auth.uid().
// ============================================================================

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('fn_ai_routine_schedules_list');
  if (error) {
    const status = error.message.includes('not authorized') ? 403 : 500;
    return NextResponse.json({ ok: false, error: error.message }, { status });
  }
  return NextResponse.json({ ok: true, schedules: data ?? [] });
}

export async function POST(request: NextRequest) {
  await connection();
  const supabase = await createClient();

  let body: {
    routineId?: unknown;
    enabled?: unknown;
    daysOfWeek?: unknown;
    minuteOfDay?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const routineId = typeof body.routineId === 'string' ? body.routineId : '';
  const minuteOfDay = typeof body.minuteOfDay === 'number' ? body.minuteOfDay : NaN;
  const daysOfWeek = Array.isArray(body.daysOfWeek)
    ? body.daysOfWeek.filter((d): d is number => typeof d === 'number' && d >= 0 && d <= 6)
    : null;
  const enabled = body.enabled !== false; // default true

  if (
    !routineId ||
    !daysOfWeek ||
    daysOfWeek.length === 0 ||
    Number.isNaN(minuteOfDay) ||
    minuteOfDay < 0 ||
    minuteOfDay > 1439
  ) {
    return NextResponse.json(
      { ok: false, error: 'routineId, at least one day (0-6), and minuteOfDay (0-1439) are required' },
      { status: 400 },
    );
  }

  const { data, error } = await supabase.rpc('fn_ai_routine_schedule_upsert', {
    p_routine_id: routineId,
    p_enabled: enabled,
    p_days_of_week: daysOfWeek,
    p_minute_of_day: minuteOfDay,
  });
  if (error) {
    const status = error.message.includes('not authorized') ? 403 : 400;
    return NextResponse.json({ ok: false, error: error.message }, { status });
  }
  return NextResponse.json({ ok: true, schedule: data });
}
