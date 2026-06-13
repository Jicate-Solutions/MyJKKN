/**
 * PDE Tier 4 — T4.1 Bridge API surface
 * =============================================================================
 *
 * POST /api/pde/bridge
 *   Query:
 *     ?scope=all                — bridge every learner's legacy rows
 *     ?scope=learner&learner_id=<uuid>
 *     ?dry_run=true (default) | false
 *   Returns BridgeRunResult.
 *
 * GET  /api/pde/bridge
 *   Returns the last 50 runs from pde_bridge_audit grouped by run_id.
 *
 * Both endpoints require super_admin. Director-only operation by design.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient, createServerSupabaseClient } from '@/lib/supabase/server';
import { runBridge } from '@/lib/services/pde-bridge-service';
import type { BridgeRunOptions } from '@/lib/types/pde-bridge';

async function requireSuperAdmin(): Promise<{ ok: true; userId: string } | { ok: false; status: number; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: 'Unauthorized' };

  const ssr = await createServerSupabaseClient();
  const { data: profile, error } = await ssr
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: error.message };
  if (!profile || (profile as { role: string }).role !== 'super_admin') {
    return { ok: false, status: 403, error: 'super_admin only' };
  }
  return { ok: true, userId: user.id };
}

export async function POST(request: NextRequest) {
  await connection();
  try {
    const authz = await requireSuperAdmin();
    if (!authz.ok) {
      return NextResponse.json({ error: authz.error }, { status: authz.status });
    }

    const url = new URL(request.url);
    const scopeParam = url.searchParams.get('scope') ?? 'all';
    const learnerId = url.searchParams.get('learner_id');
    const dryRunParam = url.searchParams.get('dry_run');
    const dryRun = dryRunParam === null ? true : dryRunParam !== 'false';

    if (scopeParam === 'learner' && !learnerId) {
      return NextResponse.json({ error: 'learner_id required when scope=learner' }, { status: 400 });
    }

    const options: BridgeRunOptions = {
      scope: scopeParam === 'learner' && learnerId ? { learnerId } : 'all',
      dry_run: dryRun,
    };

    const result = await runBridge(options);
    return NextResponse.json({ data: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  await connection();
  try {
    const authz = await requireSuperAdmin();
    if (!authz.ok) {
      return NextResponse.json({ error: authz.error }, { status: authz.status });
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('pde_bridge_audit')
      .select('run_id, source_table, status, dry_run, run_started_at, run_completed_at, learner_id, category_key, error_message')
      .order('run_started_at', { ascending: false, nullsFirst: false })
      .limit(500);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Group by run_id and produce a per-run summary for the UI.
    const grouped = new Map<string, {
      run_id: string;
      started_at: string | null;
      completed_at: string | null;
      dry_run: boolean;
      total: number;
      applied: number;
      dry_runs: number;
      failed: number;
      per_source: Record<string, number>;
    }>();
    for (const row of (data ?? []) as Array<{
      run_id: string;
      source_table: string;
      status: string;
      dry_run: boolean;
      run_started_at: string | null;
      run_completed_at: string | null;
    }>) {
      const key = row.run_id;
      const existing = grouped.get(key) ?? {
        run_id: key,
        started_at: row.run_started_at,
        completed_at: row.run_completed_at,
        dry_run: row.dry_run,
        total: 0,
        applied: 0,
        dry_runs: 0,
        failed: 0,
        per_source: {},
      };
      existing.total++;
      if (row.status === 'applied') existing.applied++;
      else if (row.status === 'dry_run') existing.dry_runs++;
      else if (row.status === 'failed') existing.failed++;
      existing.per_source[row.source_table] = (existing.per_source[row.source_table] ?? 0) + 1;
      grouped.set(key, existing);
    }

    const runs = Array.from(grouped.values())
      .sort((a, b) => (b.started_at ?? '').localeCompare(a.started_at ?? ''))
      .slice(0, 50);

    return NextResponse.json({ data: runs });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
