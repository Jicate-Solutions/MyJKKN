// =====================================================================
// Capability-Gap Loop — detection cron (Phase 1)
// =====================================================================
// Runs the detection pass: calls fn_capgap_scan(), which mines the
// ai_jobs chat log (job_type='ai_query.chat') for model-flagged refusal
// phrases, clusters them, auto-proposes a gap-class, and upserts
// public.capability_gaps. Idempotent — safe to fire daily (see vercel.json).
//
// Auth + shape match app/api/cron/ai-pulse-anomaly-scan/route.ts
// (CRON_SECRET via Authorization: Bearer header OR ?secret=, service-role
// client). fn_capgap_scan is service-role-safe (auth.uid() IS NULL gate).

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  // -- Auth: CRON_SECRET (Vercel cron sends as Authorization header) ----
  const authHeader = req.headers.get('authorization') || '';
  const querySecret = req.nextUrl.searchParams.get('secret') || '';
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: 'CRON_SECRET not configured' },
      { status: 500 }
    );
  }
  const headerOk = authHeader === `Bearer ${cronSecret}`;
  const queryOk = querySecret === cronSecret;
  if (!headerOk && !queryOk) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const startedAt = Date.now();

  const { data, error } = await (supabase as any).rpc('fn_capgap_scan');

  if (error) {
    console.error('[cron/capgap-scan] fn_capgap_scan failed:', error.message);
    return NextResponse.json(
      { ok: false, error: error.message, elapsed_ms: Date.now() - startedAt },
      { status: 500 }
    );
  }

  const result = (data ?? {}) as {
    success?: boolean;
    scanned?: number;
    clusters?: number;
    error?: string;
  };

  // Phase 3: sync the per-refusal event audit (capability_gap_events).
  // Idempotent; non-fatal — a failure here must not fail the scan.
  let eventsSynced: number | null = null;
  const { data: evData, error: evError } = await (supabase as any).rpc(
    'fn_capgap_events_sync'
  );
  if (evError) {
    console.error('[cron/capgap-scan] fn_capgap_events_sync failed:', evError.message);
  } else {
    eventsSynced = (evData as { inserted?: number })?.inserted ?? 0;
  }

  console.log('[cron/capgap-scan]', {
    ...result,
    events_synced: eventsSynced,
    elapsed_ms: Date.now() - startedAt,
  });

  return NextResponse.json({
    ok: result.success !== false,
    scanned: result.scanned ?? 0,
    clusters: result.clusters ?? 0,
    events_synced: eventsSynced,
    result,
    elapsed_ms: Date.now() - startedAt,
  });
}
