// =============================================================================
// LOOP BAR PROPOSALS — the machine proposes one bar per loop, daily
// =============================================================================
// Director rulings 2026-09-16 (Gauntlet-Loop borrowings G3): every operational
// loop carries ONE concrete bar its verdict is judged against; the MACHINE
// proposes that bar and the Director approves it by tap.
//
// This route is the machine half, and only that: one RPC to
// fn_loop_bar_proposals_generate, which for every active loop with no bar and
// no open bar question either proposes a bar (from the charter legs already on
// loop_registry) or files an honest 'insufficient' note saying what a human
// must supply first. It writes NO bar — loop_registry.bar is written solely by
// fn_loop_bar_decide when a super admin approves on /admin/loops/charters.
//
// Idempotent by construction: a loop with a 'proposed' or 'insufficient'
// kind='bar' row is skipped, so a daily clock never re-asks a question that is
// already on the Director's desk (his 2026-09-17 confirmation: an insufficient
// note is standing, never re-written daily). Safe no-op while the migration is
// unapplied — the RPC error lands as a 500 the dispatcher records.
//
// Auth: CRON_SECRET Bearer only — the dispatcher and the AI Routines manual
// trigger both send the header; secrets never sit in URLs.
// Dispatch: ai_routine_schedules row 'loop-bar-proposals' (daily 11:19 IST,
// migration 20261225070100), NOT vercel.json (hard 100-cron cap).
// Created: 2026-09-17.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

type GenerateResult = {
  proposed: number;
  insufficient: number;
  skipped: number;
};

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc('fn_loop_bar_proposals_generate');
  if (error) {
    // Never a silent 200: the dispatcher reads last_status from the HTTP code
    // and the daily watchdog reads last_status.
    return NextResponse.json(
      { ok: false, error: `bar proposal generate failed: ${error.message}` },
      { status: 500 }
    );
  }

  const result = (data ?? null) as GenerateResult | null;
  if (!result) {
    return NextResponse.json(
      { ok: false, error: 'bar proposal generate returned nothing' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    proposed: result.proposed,
    insufficient: result.insufficient,
    skipped: result.skipped,
  });
}
