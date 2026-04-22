export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { StageDefinition } from '@/types/approval-chain';

/**
 * Hostel Vacate 72h SLA escalation cron (PR-C, 2026-04-23).
 *
 * Finds pending_warden requests idle >= 72h and auto-escalates to chief
 * warden. Idempotent: stamps warden_idle_escalated_at so subsequent runs
 * skip already-escalated requests.
 *
 * Duplicates the escalation logic from HostelVacateRequestService instead
 * of calling the service directly — the service uses createClientSupabaseClient
 * which is not available in a cron route context. This route runs with
 * service role + bypasses RLS.
 *
 * Schedule in vercel.json: every 6 hours (72h SLA tolerates this resolution).
 * Auth: CRON_SECRET query parameter.
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  const secret = request.nextUrl.searchParams.get('secret');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    console.warn('[cron/hostel-vacate-sla] Unauthorized attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const serviceClient = createServiceRoleClient();
  const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

  const results = {
    candidates: 0,
    escalated: 0,
    skipped_no_run: 0,
    errors: [] as string[],
    duration_ms: 0,
  };

  try {
    // 1. Find idle requests
    const { data: idleRows, error: idleErr } = await serviceClient
      .from('hostel_vacate_requests')
      .select('id, approval_chain_run_id, institution_id, warden_last_action_at')
      .eq('status', 'pending_warden')
      .is('warden_idle_escalated_at', null)
      .lt('warden_last_action_at', cutoff);

    if (idleErr) {
      results.errors.push(`Query failed: ${idleErr.message}`);
      return NextResponse.json({ ...results, duration_ms: Date.now() - startTime }, { status: 500 });
    }

    const idle = idleRows ?? [];
    results.candidates = idle.length;

    for (const r of idle) {
      if (!r.approval_chain_run_id) {
        results.skipped_no_run += 1;
        continue;
      }
      try {
        // 2. Load run + rule to find escalate target
        const { data: runRow, error: runErr } = await serviceClient
          .from('approval_chain_runs')
          .select('id, current_stage_idx, history, rule:approval_chain_rules(stages)')
          .eq('id', r.approval_chain_run_id)
          .single();
        if (runErr || !runRow) {
          results.errors.push(`Run ${r.approval_chain_run_id} fetch failed: ${runErr?.message ?? 'missing'}`);
          continue;
        }
        const run = runRow as unknown as {
          id: string;
          current_stage_idx: number;
          history: unknown[];
          rule: { stages: StageDefinition[] };
        };
        const currentStage = run.rule.stages[run.current_stage_idx];
        const escalateTo = currentStage?.sla_escalate_to_stage;
        if (escalateTo === undefined) {
          results.errors.push(
            `Request ${r.id}: stage has no sla_escalate_to_stage; cannot escalate.`
          );
          continue;
        }

        // 3. Advance engine run
        const historyEntry = {
          stage_idx: run.current_stage_idx,
          stage_name: currentStage.stage_name,
          actor_id: null,
          action: 'escalate',
          remarks: 'Auto-escalated: warden idle > 72h',
          at: new Date().toISOString(),
        };
        const { error: advErr } = await serviceClient
          .from('approval_chain_runs')
          .update({
            current_stage_idx: escalateTo,
            history: [...(run.history ?? []), historyEntry],
          })
          .eq('id', run.id);
        if (advErr) {
          results.errors.push(`Run ${run.id} advance failed: ${advErr.message}`);
          continue;
        }

        // 4. Mirror onto request row
        const { error: mirrorErr } = await serviceClient
          .from('hostel_vacate_requests')
          .update({
            status: 'pending_chief',
            warden_idle_escalated_at: new Date().toISOString(),
          })
          .eq('id', r.id);
        if (mirrorErr) {
          results.errors.push(`Request ${r.id} mirror failed: ${mirrorErr.message}`);
          continue;
        }

        results.escalated += 1;
      } catch (e) {
        results.errors.push(`Request ${r.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    results.duration_ms = Date.now() - startTime;
    console.log(
      `[cron/hostel-vacate-sla] Processed ${results.candidates} candidates, ` +
        `escalated ${results.escalated}, skipped ${results.skipped_no_run}, ` +
        `${results.errors.length} errors, ${results.duration_ms}ms`
    );
    return NextResponse.json(results);
  } catch (e) {
    results.errors.push(`Fatal: ${e instanceof Error ? e.message : String(e)}`);
    results.duration_ms = Date.now() - startTime;
    return NextResponse.json(results, { status: 500 });
  }
}
