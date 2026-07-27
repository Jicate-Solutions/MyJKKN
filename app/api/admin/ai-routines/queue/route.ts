// ============================================================================
// AI job queue health — read + lane routing (super_admin only)
// ============================================================================
// GET  → one snapshot of the shared ai_jobs queue: depth, arrival-vs-completion
//        rate, per-lane depth, worker liveness, backlog composition, stuck jobs,
//        failure shapes.
// POST → move ONE pending job between lanes: 'mac' hands it to the local Mac
//        drain, 'max' hands it back to the Windows box.
//
// Mirrors ../schedule/route.ts: runs under the CALLER's Supabase session so the
// RPC sees the real auth.uid() and enforces super_admin itself. No service-role
// client here — the authorization lives in one place, in the database. That is
// why POST does no role check of its own: fn_ai_job_set_lane raises, and the
// refusal to feed a Mac that has not claimed in 15 minutes lives there too, so
// it cannot be bypassed by calling the RPC from anywhere else.
// ============================================================================

import { NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('fn_ai_queue_health');
  if (error) {
    const status = error.message.includes('not authorized') ? 403 : 500;
    return NextResponse.json({ ok: false, error: error.message }, { status });
  }
  return NextResponse.json({ ok: true, queue: data });
}

export async function POST(request: Request) {
  await connection();

  let body: { jobId?: unknown; lane?: unknown; action?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON body' }, { status: 400 });
  }

  // The undo: put every pending job on the mac lane back on the Windows lane.
  // This is what makes it safe to have NO "is the Mac awake?" precondition on
  // the move itself — gating on that deadlocks, because the Mac only claims
  // work the move puts there.
  if (body.action === 'return-all') {
    const sb = await createClient();
    const { data, error } = await sb.rpc('fn_ai_mac_lane_return_all');
    if (error) {
      const status = error.message.includes('not authorized') ? 403 : 500;
      return NextResponse.json({ ok: false, error: error.message }, { status });
    }
    return NextResponse.json({ ok: true, returned: data });
  }

  const jobId = typeof body.jobId === 'string' ? body.jobId : '';
  const lane = typeof body.lane === 'string' ? body.lane : '';
  if (!jobId || (lane !== 'mac' && lane !== 'max')) {
    return NextResponse.json(
      { ok: false, error: 'jobId (uuid) and lane ("mac" | "max") are required' },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('fn_ai_job_set_lane', {
    p_job_id: jobId,
    p_lane: lane,
  });

  if (error) {
    // The RPC raises for three distinct reasons and the caller should be able to
    // tell them apart: not a super_admin (403), the Mac has not claimed recently
    // or the job is no longer pending (409 — the request was valid, the world
    // moved), anything else (500).
    const msg = error.message;
    const status = msg.includes('not authorized') ? 403
      : msg.includes('no Mac runner') || msg.includes('is not pending') ? 409
      : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }

  return NextResponse.json({ ok: true, job: data });
}
