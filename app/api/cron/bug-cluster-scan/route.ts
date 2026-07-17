// =====================================================================
// Bug-Triage Loop — nightly duplicate-cluster scan
// =====================================================================
// Calls fn_bug_cluster_scan(): deterministic pg_trgm clustering over the
// open /admin/bug-reports backlog (status new/seen/in_progress, not already
// a duplicate). Proposals land in public.bug_clusters for the Groups tab;
// confirmed/dismissed decisions are never touched. Idempotent full
// recompute — safe to fire nightly (see vercel.json) or on demand.
//
// Auth + shape match app/api/cron/capgap-scan/route.ts (CRON_SECRET via
// Authorization: Bearer header OR ?secret=, service-role client).

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
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

  const { data, error } = await (supabase as any).rpc('fn_bug_cluster_scan');

  if (error) {
    console.error('[cron/bug-cluster-scan] fn_bug_cluster_scan failed:', error.message);
    return NextResponse.json(
      { ok: false, error: error.message, elapsed_ms: Date.now() - startedAt },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    ...(data ?? {}),
    elapsed_ms: Date.now() - startedAt
  });
}
