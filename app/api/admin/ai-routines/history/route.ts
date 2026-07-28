// ============================================================================
// AI Routine run history — rolling 7-day, per routine (super_admin only)
// ============================================================================
// GET ?routineId=<id> → the last 7 days of runs for that routine across BOTH
// lanes (the cloud dispatcher row + its 'maxlane:' Max-lane twin), newest first.
// fn_ai_routine_run_history enforces super_admin/admin server-side; this route
// runs under the caller's Supabase session so the RPC sees the real auth.uid().
// ============================================================================

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  await connection();
  const routineId = new URL(request.url).searchParams.get('routineId') ?? '';
  if (!routineId) {
    return NextResponse.json({ ok: false, error: 'routineId required' }, { status: 400 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('fn_ai_routine_run_history', {
    p_routine_id: routineId,
  });
  if (error) {
    const status = error.message.includes('not authorized') ? 403 : 500;
    return NextResponse.json({ ok: false, error: error.message }, { status });
  }
  return NextResponse.json({ ok: true, runs: data ?? [] });
}
