// ============================================================================
// AI job queue health — read (super_admin only)
// ============================================================================
// GET → one snapshot of the shared ai_jobs queue: depth, arrival-vs-completion
//       rate, worker liveness, backlog composition, stuck jobs, failure shapes.
//
// Mirrors ../schedule/route.ts: runs under the CALLER's Supabase session so the
// RPC sees the real auth.uid() and enforces super_admin itself. No service-role
// client here — the authorization lives in one place, in the database.
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
