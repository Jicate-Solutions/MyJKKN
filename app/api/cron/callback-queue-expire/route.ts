export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60; // expiry sweep is a single bulk-update — finishes in <5s typically

// app/api/cron/callback-queue-expire/route.ts
// Vercel Cron: hourly. Closes pending admission_callback_queue rows that are
// SLA-breached (callback_due_by < now) OR older than the policy expiry window
// (telephony.callback_queue.expiry_days, default 7).
//
// Brand-integrity recovery (2026-05-03, M-3):
//   528+ pending rows had ZERO closures since the system began. Director's
//   "we'll call you back" promise had no follow-through mechanism. This cron
//   runs the bulk-close every hour so the queue never silently grows again.
//   See probe-pipeline-2026-05-03.md F5.
//
// Calls public.fn_expire_stale_callbacks() — DDL in
// supabase/migrations/20260503140002_callback_queue_expiry_policy.sql.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const JOB_NAME = 'callback-queue-expire';

export async function GET(request: NextRequest) {
  // Auth: Vercel cron uses Bearer-token CRON_SECRET (matches sibling crons).
  const authHeader = request.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json(
      { ok: false, job: JOB_NAME, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { ok: false, job: JOB_NAME, error: 'Missing Supabase env vars' },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const ranAt = new Date().toISOString();

  try {
    const { data, error } = await supabase.rpc('fn_expire_stale_callbacks');

    if (error) {
      console.error(`[cron:${JOB_NAME}] RPC error:`, error);
      return NextResponse.json(
        { ok: false, job: JOB_NAME, ran_at: ranAt, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      job: JOB_NAME,
      ran_at: ranAt,
      result: data,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[cron:${JOB_NAME}] Exception:`, err);
    return NextResponse.json(
      { ok: false, job: JOB_NAME, ran_at: ranAt, error: message },
      { status: 500 }
    );
  }
}
