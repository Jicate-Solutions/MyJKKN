// =====================================================================
// Attention Bar — nightly retention pruner
// =====================================================================
// Spec: specs/attention-bar-5-layer-system.md §3
//   - quick_action_taps      → 90-day retention (Layer 3 tap history)
//   - quick_action_audit     → 30-day retention (universal audit trail)
//   - quick_action_ai_cache  → 1-hour TTL (Layer 4 LLM responses)
//
// Each helper is idempotent and only deletes already-expired rows, so this
// cron can run as often as needed without risk. Recommended schedule: nightly
// (UTC) — early morning IST is a low-traffic window for MyJKKN.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` header (Vercel cron
// invoker sends this automatically) OR `?secret=` query param (manual runs).
// Pattern matches the other /api/cron/* routes.
//
// Returns a JSON summary so the admin Tab 6 audit log can surface last-run
// stats. Deleted-row counts are best-effort (Supabase bulk DELETE returns
// the deleted slice, not an exact count for very large purges).
// =====================================================================

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { purgeAuditOlderThan30Days } from '@/lib/attention-bar/audit-log';
import { pruneExpiredCache } from '@/lib/attention-bar/ai-cache';
import { purgeOlderThan90Days } from '@/lib/attention-bar/tap-tracker';
import { createServiceRoleClient } from '@/lib/supabase/server';

interface PruneSummary {
  taps_deleted: number;
  audit_deleted: number;
  cache_deleted: number;
  elapsed_ms: number;
  errors: string[];
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET not configured' },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (
    authHeader !== `Bearer ${cronSecret}` &&
    querySecret !== cronSecret
  ) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized' },
      { status: 401 },
    );
  }

  const started = Date.now();
  const summary: PruneSummary = {
    taps_deleted: 0,
    audit_deleted: 0,
    cache_deleted: 0,
    elapsed_ms: 0,
    errors: [],
  };

  // 1. quick_action_taps — 90-day retention. Uses the service-role client
  //    because cross-user deletes can't be done under any single user's RLS.
  try {
    const serviceClient = createServiceRoleClient();
    summary.taps_deleted = await purgeOlderThan90Days(serviceClient);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    summary.errors.push(`taps: ${msg}`);
    console.error('[cron/attention-bar-prune] taps purge failed:', err);
  }

  // 2. quick_action_audit — 30-day retention.
  try {
    const result = await purgeAuditOlderThan30Days();
    summary.audit_deleted = result.deleted;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    summary.errors.push(`audit: ${msg}`);
    console.error('[cron/attention-bar-prune] audit purge failed:', err);
  }

  // 3. quick_action_ai_cache — 1-hour TTL. Re-uses the helper Phase 6a
  //    shipped; we just call it on a schedule.
  try {
    const result = await pruneExpiredCache();
    summary.cache_deleted = result.deleted;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    summary.errors.push(`cache: ${msg}`);
    console.error('[cron/attention-bar-prune] cache purge failed:', err);
  }

  summary.elapsed_ms = Date.now() - started;

  // Return 200 even on partial failures — the cron should NOT retry the whole
  // pass when one of three independent purges errors. The errors[] array
  // surfaces the failure for monitoring; a future PR can add a Sentry capture.
  return NextResponse.json({
    ok: summary.errors.length === 0,
    summary,
  });
}
