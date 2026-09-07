import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { mergePullRequest, type MergeMethod } from '@/lib/services/orchestration/github-merge';
import { classifyPullRequestRisk } from '@/lib/services/orchestration/pr-risk';
import { type RiskTier } from '@/lib/services/orchestration/risk-tier';
import { recordAction } from '@/lib/services/orchestration/audit';

// POST /api/admin/orchestration/actions/merge
//
// Merges one pull request via the merge-action service. Super-admin only.
// Requires an explicit `confirm: true` in the body — this is a deliberate
// server-side confirmation guard on top of whatever the client UI does, so
// this route can never be triggered by an accidental/malformed request.
//
// Body: {
//   prNumber: number,
//   confirm?: true,
//   unattended?: true,               // LOW tier only — see below
//   tierAck?: 'LOW'|'NORMAL'|'HELD', // required (= 'HELD') for HELD-tier PRs
//   method?: 'squash'|'merge'|'rebase'
// }
//
// SHIP POLICY (risk tiers, lib/services/orchestration/risk-tier.ts). The tier
// is classified LIVE from GitHub at click time — the stored orchestration_prs
// value is only a fallback, because a push since the last sync may have added
// a migration. Enforcement happens BEFORE the merge guard is called; the
// guard's own verdict (CI, mergeability, sha pin) is then final and untouched.
//
//   HELD    confirm: true AND tierAck: 'HELD'            else 422, with reasons
//   NORMAL  confirm: true                                (unchanged behaviour)
//   LOW     confirm: true  OR  unattended: true
//
//   unattended: true on any tier other than LOW → 422
//   "unattended merge is only permitted for LOW-tier PRs".
//   Tier unreadable (GitHub files read failed, no stored tier) → 422 for
//   unattended; treated as NORMAL for a confirmed merge.
//
// Every outcome is written to orchestration_actions with the tier, why it
// was decided, and the mode (confirmed / unattended).

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VALID_METHODS: readonly MergeMethod[] = ['squash', 'merge', 'rebase'];
const VALID_TIERS: readonly RiskTier[] = ['LOW', 'NORMAL', 'HELD'];

type TierSource = 'live' | 'stored' | 'unknown';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_super_admin')
      .eq('id', user.id)
      .single();

    const isSuper = profile?.role === 'super_admin' || profile?.is_super_admin === true;
    if (!isSuper) {
      return NextResponse.json({ ok: false, error: 'Forbidden: super_admin only' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
    }

    const { prNumber, confirm, method, tierAck, unattended } = body as {
      prNumber?: unknown;
      confirm?: unknown;
      method?: unknown;
      tierAck?: unknown;
      unattended?: unknown;
    };

    const isUnattended = unattended === true;
    if (confirm !== true && !isUnattended) {
      return NextResponse.json(
        { ok: false, error: 'Refusing: request body must include confirm: true' },
        { status: 400 }
      );
    }

    if (typeof prNumber !== 'number' || !Number.isInteger(prNumber) || prNumber <= 0) {
      return NextResponse.json({ ok: false, error: 'prNumber must be a positive integer' }, { status: 400 });
    }

    if (tierAck !== undefined && (typeof tierAck !== 'string' || !VALID_TIERS.includes(tierAck as RiskTier))) {
      return NextResponse.json(
        { ok: false, error: `tierAck must be one of: ${VALID_TIERS.join(', ')}` },
        { status: 400 }
      );
    }

    let mergeMethod: MergeMethod | undefined;
    if (method !== undefined) {
      if (typeof method !== 'string' || !VALID_METHODS.includes(method as MergeMethod)) {
        return NextResponse.json(
          { ok: false, error: `method must be one of: ${VALID_METHODS.join(', ')}` },
          { status: 400 }
        );
      }
      mergeMethod = method as MergeMethod;
    }

    // ── Risk tier: live first, stored fallback ─────────────────────────────
    const mode = isUnattended ? 'unattended' : 'confirmed';
    let tier: RiskTier | null = null;
    let riskReasons: string[] = [];
    let tierSource: TierSource = 'unknown';

    const token = process.env.ORCH_GITHUB_TOKEN;
    if (token) {
      const live = await classifyPullRequestRisk(token, prNumber);
      if (live) {
        tier = live.tier;
        riskReasons = live.reasons;
        tierSource = 'live';
      }
    }
    if (!tier) {
      const { data: stored } = await supabase
        .from('orchestration_prs')
        .select('risk_tier, risk_reasons')
        .eq('number', prNumber)
        .maybeSingle();
      const storedRow = stored as { risk_tier?: unknown; risk_reasons?: unknown } | null;
      if (storedRow && typeof storedRow.risk_tier === 'string' && VALID_TIERS.includes(storedRow.risk_tier as RiskTier)) {
        tier = storedRow.risk_tier as RiskTier;
        riskReasons = Array.isArray(storedRow.risk_reasons)
          ? storedRow.risk_reasons.filter((r): r is string => typeof r === 'string')
          : [];
        tierSource = 'stored';
      }
    }

    const refuse = (reason: string) => {
      const result = { ok: false, merged: false, reason, tier, riskReasons, tierSource, mode };
      return recordAction('merge', `PR #${prNumber}`, user.id, 'refused', result).then(() =>
        NextResponse.json(result, { status: 422 })
      );
    };

    // ── Tier enforcement (before the guard) ────────────────────────────────
    if (isUnattended && tier !== 'LOW') {
      return refuse(
        tier
          ? `unattended merge is only permitted for LOW-tier PRs (this PR is ${tier}: ${riskReasons.join('; ')})`
          : 'unattended merge is only permitted for LOW-tier PRs (this PR\'s tier could not be read — fail closed)'
      );
    }
    if (tier === 'HELD' && tierAck !== 'HELD') {
      return refuse(
        `PR is HELD — merging needs tierAck: 'HELD' alongside confirm: true. Held because: ${riskReasons.join('; ')}`
      );
    }

    // ── The guard, unchanged, is the final word ────────────────────────────
    const result = await mergePullRequest(prNumber, { method: mergeMethod });

    const logged = { ...result, tier: tier ?? 'NORMAL', riskReasons, tierSource, mode };
    await recordAction('merge', `PR #${prNumber}`, user.id, result.merged ? 'merged' : 'refused', logged);

    return NextResponse.json(logged, { status: result.ok ? 200 : 422 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
