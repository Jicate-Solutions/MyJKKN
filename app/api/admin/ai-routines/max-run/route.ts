// ============================================================================
// Max Lane runs — queue + list (super_admin only)
// ============================================================================
// POST → queue a "Run on Max" request for one routine (fn_max_lane_request_run):
//        { routineId }. RPC returns { ok:true, request_id } or { ok:false, error:'already queued' }.
// GET  → list the last 20 requests (fn_max_lane_requests_list) → { ok, requests }.
// Both RPCs enforce super_admin server-side; this route runs under the caller's
// Supabase session so the RPC sees the real auth.uid(). A Mac-side service-role
// poller (not this route) claims + completes the queued rows.
// ============================================================================

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('fn_max_lane_requests_list');
  if (error) {
    const status = error.message.includes('not authorized') ? 403 : 500;
    return NextResponse.json({ ok: false, error: error.message }, { status });
  }
  return NextResponse.json({ ok: true, requests: data ?? [] });
}

export async function POST(request: NextRequest) {
  await connection();
  const supabase = await createClient();

  let body: { routineId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const routineId = typeof body.routineId === 'string' ? body.routineId.trim() : '';
  if (!routineId) {
    return NextResponse.json({ ok: false, error: 'routineId is required' }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('fn_max_lane_request_run', {
    p_routine_id: routineId,
  });
  if (error) {
    const status = error.message.includes('not authorized') ? 403 : 400;
    return NextResponse.json({ ok: false, error: error.message }, { status });
  }
  // data is the RPC's jsonb: { ok:true, request_id } | { ok:false, error:'already queued' }
  return NextResponse.json(data);
}
