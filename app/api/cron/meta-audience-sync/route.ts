// =====================================================================
// Meta Custom Audiences — daily sync cron
// =====================================================================
// Runs `RemarketingService.syncAudience(rule.id)` for every enabled rule
// across all institutions. Each sync writes its own history row, so a
// partial failure (one rule out of many) is recorded but does not abort
// the rest of the run.
//
// Gated by the platform_policy `meta.audiences.is_enabled` — if that's
// false (default), the cron exits early with a 200 + skipped=true so
// Vercel cron stops alerting.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` header (Vercel
// cron invoker sends this automatically) OR `?secret=` query param.
// Pattern matches the other /api/cron/* routes.
// =====================================================================

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { RemarketingService } from '@/lib/services/marketing/remarketing-service';

interface SyncSummary {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  rules_total: number;
  rules_synced: number;
  rules_failed: number;
  elapsed_ms: number;
  failures: Array<{ rule_id: string; error: string }>;
}

async function handle(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET not configured' },
      { status: 500 }
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
      { status: 401 }
    );
  }

  const started = Date.now();
  const summary: SyncSummary = {
    ok: true,
    rules_total: 0,
    rules_synced: 0,
    rules_failed: 0,
    elapsed_ms: 0,
    failures: [],
  };

  const supabase = createServiceRoleClient();

  // Kill-switch — read the master is_enabled policy.
  const policyResp = await supabase.rpc('fn_get_policy_bool', {
    p_key: 'meta.audiences.is_enabled',
    p_default: false,
    p_scope_id: null,
  });
  const isEnabled = (policyResp.data as boolean | null) ?? false;
  if (!isEnabled) {
    summary.skipped = true;
    summary.reason =
      'meta.audiences.is_enabled is false (master kill-switch). Set to true to start syncing.';
    summary.elapsed_ms = Date.now() - started;
    return NextResponse.json(summary);
  }

  if (!process.env.META_ACCESS_TOKEN) {
    summary.skipped = true;
    summary.reason = 'META_ACCESS_TOKEN env var not set';
    summary.elapsed_ms = Date.now() - started;
    return NextResponse.json(summary);
  }

  // Enumerate enabled rules across all institutions. Cast to bypass typed
  // client (meta_audience_* tables landed in this PR's migration and are
  // not yet in generated database.types).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('meta_audience_rules')
    .select('id')
    .eq('is_enabled', true);

  if (error) {
    summary.ok = false;
    summary.reason = `enumerate-rules failed: ${error.message}`;
    summary.elapsed_ms = Date.now() - started;
    return NextResponse.json(summary, { status: 500 });
  }

  const ruleIds = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  summary.rules_total = ruleIds.length;

  for (const ruleId of ruleIds) {
    try {
      const result = await RemarketingService.syncAudience(ruleId);
      if (result.success) {
        summary.rules_synced += 1;
      } else {
        summary.rules_failed += 1;
        summary.failures.push({
          rule_id: ruleId,
          error: result.error ?? 'unknown',
        });
      }
    } catch (err) {
      summary.rules_failed += 1;
      summary.failures.push({
        rule_id: ruleId,
        error: err instanceof Error ? err.message : 'unknown',
      });
    }
  }

  summary.elapsed_ms = Date.now() - started;
  summary.ok = summary.rules_failed === 0;
  return NextResponse.json(summary);
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
