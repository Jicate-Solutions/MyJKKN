#!/usr/bin/env node
/**
 * Rebuild the frozen approval chain on OPEN, UNTOUCHED leave requests.
 *
 * WHY THIS EXISTS. A request's approval chain is frozen at apply time, on
 * purpose: editing a flow must not silently re-route requests that people have
 * already started deciding. The cost of that design is that configuring a new
 * flow appears to do nothing — a three-step HOD -> Principal -> CAO flow saved
 * on 2026-09-03 left every request filed before it still carrying its old
 * one-step chain, so the Principal's approval still granted the leave outright
 * and the new flow looked broken.
 *
 * UNTOUCHED IS THE WHOLE SAFETY ARGUMENT. A request is rebuilt only when nobody
 * has acted on it: current_step is 0, every step is still 'pending', and no step
 * carries a decision or a decided_by. Anything a reviewer has already signed
 * keeps the chain it was signed under, so no completed review is ever erased and
 * nobody's decision is re-attributed to a step they never saw.
 *
 * It reuses LeaveService.buildApprovalChain — the same body the apply path uses,
 * including the most-specific-flow-wins match and the role-ladder resolution —
 * rather than reimplementing chain construction here, where it would drift.
 *
 *   npx tsx --env-file=.env scripts/hr/rebuild-open-leave-chains.ts           # preview
 *   npx tsx --env-file=.env scripts/hr/rebuild-open-leave-chains.ts --apply   # write
 *
 * Add --org=<uuid> or --type=<uuid> to narrow it to one organisation or leave
 * type; rebuilding everything at once is rarely what you want.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { LeaveService } from '../../lib/services/hr/leave-service';
import type { LeaveApprovalStep } from '../../types/hr';

const APPLY = process.argv.includes('--apply');
const argOf = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? null;
const ONLY_ORG = argOf('org');
const ONLY_TYPE = argOf('type');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.\n' +
      'Run with:  npx tsx --env-file=.env scripts/hr/rebuild-open-leave-chains.ts'
  );
  process.exit(1);
}

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
}) as SupabaseClient;

/** Nobody has acted on this request yet. */
function isUntouched(chain: LeaveApprovalStep[] | null, currentStep: number): boolean {
  if (currentStep !== 0) return false;
  if (!Array.isArray(chain) || chain.length === 0) return false;
  return chain.every(
    (s) =>
      (s.status ?? 'pending') === 'pending' &&
      !s.decided_by &&
      (s.decisions ?? []).length === 0
  );
}

/**
 * What actually matters about a chain: who decides, in what order, under what
 * quorum, and which step grants it. Timestamps and display names are noise —
 * comparing whole objects would report every request as changed.
 */
function signature(chain: LeaveApprovalStep[]): string {
  return chain
    .map((s) => {
      const who = (s.approvers && s.approvers.length > 0
        ? s.approvers
        : [{ approver_role: s.approver_role, approver_user_id: s.approver_user_id }]
      )
        .map((a) => `${a.approver_user_id ?? ''}:${a.approver_role ?? ''}`)
        .join(',');
      return `${who}|${s.quorum ?? 'any'}|${s.step_type ?? ''}`;
    })
    .join(' -> ');
}

async function main() {
  let q = sb
    .from('hr_leave_applications')
    .select(
      'id, employee_id, hr_organization_id, leave_type_id, status, current_step, approval_chain, start_date'
    )
    .in('status', ['pending', 'escalated'])
    .eq('current_step', 0)
    .order('created_at', { ascending: true });

  if (ONLY_ORG) q = q.eq('hr_organization_id', ONLY_ORG);
  if (ONLY_TYPE) q = q.eq('leave_type_id', ONLY_TYPE);

  const { data: rows, error } = await q;
  if (error) throw error;

  const candidates = (rows ?? []).filter((r: any) =>
    isUntouched(r.approval_chain as LeaveApprovalStep[] | null, r.current_step)
  );

  console.log(
    `${rows?.length ?? 0} open request(s) at step 1; ${candidates.length} untouched and eligible.`
  );

  // buildApprovalChain hits the database once per call; a role ladder makes the
  // answer depend on the applicant, so the cache key carries them too.
  const cache = new Map<string, LeaveApprovalStep[] | Error>();
  let changed = 0;
  let unchanged = 0;
  let failed = 0;

  for (const r of candidates as any[]) {
    const cacheKey = `${r.hr_organization_id}|${r.leave_type_id}|${r.employee_id}`;
    let built = cache.get(cacheKey);
    if (built === undefined) {
      try {
        built = await LeaveService.buildApprovalChain(
          sb,
          r.hr_organization_id,
          r.leave_type_id,
          null,
          r.employee_id
        );
      } catch (err) {
        built = err instanceof Error ? err : new Error(String(err));
      }
      cache.set(cacheKey, built);
    }

    if (built instanceof Error) {
      failed += 1;
      console.log(`  ! ${r.id}  ${r.start_date}  cannot rebuild: ${built.message}`);
      continue;
    }

    const before = signature(r.approval_chain as LeaveApprovalStep[]);
    const after = signature(built);
    if (before === after) {
      unchanged += 1;
      continue;
    }

    changed += 1;
    console.log(`  ~ ${r.id}  ${r.start_date}`);
    console.log(`      from: ${before}`);
    console.log(`      to:   ${after}`);

    if (APPLY) {
      // current_step stays 0 — the request has not moved, it has been re-routed.
      const { error: upErr } = await sb
        .from('hr_leave_applications')
        .update({ approval_chain: built, current_step: 0 })
        .eq('id', r.id);
      if (upErr) {
        console.log(`      FAILED: ${upErr.message}`);
        failed += 1;
        changed -= 1;
      }
    }
  }

  console.log(
    `\n${changed} ${APPLY ? 'rebuilt' : 'would change'}, ${unchanged} already match, ` +
      `${failed} could not be rebuilt.`
  );
  if (!APPLY && changed > 0) console.log('Dry run — pass --apply to write.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
