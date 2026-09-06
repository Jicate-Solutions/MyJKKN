// =====================================================================
// SCF Prepared Pulse — auto-open sweep (every 5 min)
// =====================================================================
// Opens a minimal session-feedback pulse for TOPIC-SET sessions so learners
// can give feedback even when the Senior Learner never opened a poll live.
// A session qualifies when it has a PUBLISHED learning-pathway lesson linked
// (class_session_lesson -> curriculum_lesson.status='published'), attendance is
// marked with >=1 Present learner, it is not on a declared institution holiday,
// and no poll exists for it yet. Marking attendance IS the "session-start"
// signal (Director decision); a marked-but-never-opened session is caught by a
// later run (the "open at session-end if never opened" case). Reschedule +
// cancel are handled by re-deriving the candidate set from the live timetable
// each run — no stored "prepared" rows, no parallel poll mechanism.
//
// All work is in the SECURITY DEFINER RPC fn_scf_prepared_pulse_sweep
// (service_role only). It is idempotent (never double-opens, never clobbers a
// team member's poll) and gated on the platform_policies kill switch
// 'scf.prepared_pulse.enabled' (dark by default → the RPC no-ops when off).
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` header (Vercel cron
// invoker sends this automatically) OR `?secret=` query param (manual runs).
// Created: 2026-08-02 (mould of /api/cron/session-feedback-nudge).

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.rpc('fn_scf_prepared_pulse_sweep');

  if (error) {
    console.error('[cron/scf-prepared-pulse-sweep] RPC failed:', error);
    return NextResponse.json(
      { ok: false, error: error.message, elapsed_ms: Date.now() - started },
      { status: 500 }
    );
  }

  // The RPC RETURNS jsonb → supabase-js returns the object directly.
  return NextResponse.json({
    ok: true,
    elapsed_ms: Date.now() - started,
    result: data
  });
}
