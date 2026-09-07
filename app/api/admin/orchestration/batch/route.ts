// app/api/admin/orchestration/batch/route.ts
//
// GET /api/admin/orchestration/batch
// The ship-policy view of every tracked pull request, bucketed for a tower
// session (or the Director on the phone) deciding what to merge next:
//
//   ready.low / ready.normal / ready.held   — looks mergeable, by risk tier
//   conflicted                              — GitHub reports merge conflicts
//   blocked                                 — CI not green, mergeability
//                                             unknown, or GitHub says blocked
//   drafts                                  — draft PRs, never candidates
//
// "Ready" here is an ESTIMATE, not a verdict: live GitHub `mergeable` /
// `mergeable_state` (read now) plus the CI state the sync cron stored on its
// last tick. The merge action re-reads everything — check runs included —
// through the guard in lib/services/orchestration/github-merge.ts, and that
// guard is the only thing that decides. This endpoint exists so the caller
// can pick the LOW bucket for an unattended pass and see the HELD reasons
// before touching anything; it merges nothing.
//
// Reads the risk tier from orchestration_prs (written by the sync cron). Rows
// synced before 20261105000000_orchestration_prs_risk_tier.sql was applied
// read as NORMAL.
//
// RBAC: super_admin only — same gate as every sibling route.

import { NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { OrchestrationPr } from '@/types/orchestration';
import type { RiskTier } from '@/lib/services/orchestration/risk-tier';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const GITHUB_API = 'https://api.github.com';
const REPO_OWNER = 'Jicate-Solutions';
const REPO_NAME = 'MyJKKN';

// One live GitHub read per non-draft PR. Same ceiling and fan-out the sync
// cron uses, for the same reason: bounded calls per request.
const MAX_LIVE_READS = 60;
const GH_CONCURRENCY = 8;

// Every PR in this repo reads `unstable` (a permanent neutral check plus
// routine skips), so `clean` alone would leave this bucket empty forever —
// see the CI-gate comments in github-merge.ts. Both count; the guard reads
// the actual check-run conclusions at merge time.
const READY_MERGE_STATES = new Set(['clean', 'unstable']);

interface BatchPr {
  number: number;
  title: string | null;
  headRefName: string | null;
  risk_tier: RiskTier;
  risk_reasons: string[];
  mergeable_state: string | null;
  ci_state: string | null;
  /** Why it is NOT ready — only on conflicted/blocked entries. */
  reason?: string;
}

interface LivePr {
  mergeable: boolean | null;
  mergeable_state: string | null;
  draft: boolean;
  headRefName: string | null;
}

async function readLivePr(token: string, prNumber: number): Promise<LivePr | null> {
  try {
    const res = await fetch(`${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${prNumber}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      cache: 'no-store',
    });
    if (res.status !== 200) return null;
    const pr = (await res.json().catch(() => null)) as {
      mergeable?: unknown;
      mergeable_state?: unknown;
      draft?: unknown;
      head?: { ref?: unknown };
    } | null;
    if (!pr) return null;
    return {
      mergeable: typeof pr.mergeable === 'boolean' ? pr.mergeable : null,
      mergeable_state: typeof pr.mergeable_state === 'string' ? pr.mergeable_state : null,
      draft: pr.draft === true,
      headRefName: typeof pr.head?.ref === 'string' ? pr.head.ref : null,
    };
  } catch {
    return null;
  }
}

function tierOf(row: OrchestrationPr): RiskTier {
  return row.risk_tier === 'HELD' || row.risk_tier === 'LOW' ? row.risk_tier : 'NORMAL';
}

export async function GET() {
  await connection();

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

  const { data, error } = await supabase.from('orchestration_prs').select('*').order('number', { ascending: true });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  const rows = (data ?? []) as OrchestrationPr[];

  const token = process.env.ORCH_GITHUB_TOKEN;
  const live = new Map<number, LivePr | null>();
  if (token) {
    const candidates = rows.filter((r) => !r.is_draft).slice(0, MAX_LIVE_READS);
    for (let i = 0; i < candidates.length; i += GH_CONCURRENCY) {
      const chunk = candidates.slice(i, i + GH_CONCURRENCY);
      const results = await Promise.all(chunk.map((r) => readLivePr(token, r.number)));
      chunk.forEach((r, idx) => live.set(r.number, results[idx]));
    }
  }

  const ready: Record<'low' | 'normal' | 'held', BatchPr[]> = { low: [], normal: [], held: [] };
  const conflicted: BatchPr[] = [];
  const blocked: BatchPr[] = [];
  const drafts: BatchPr[] = [];

  for (const row of rows) {
    const l = live.get(row.number) ?? null;
    const entry: BatchPr = {
      number: row.number,
      title: row.title,
      headRefName: l?.headRefName ?? null,
      risk_tier: tierOf(row),
      risk_reasons: Array.isArray(row.risk_reasons) ? row.risk_reasons : [],
      mergeable_state: l?.mergeable_state ?? row.mergeable ?? null,
      ci_state: row.ci_state,
    };

    if (row.is_draft || l?.draft) {
      drafts.push(entry);
      continue;
    }

    const state = (entry.mergeable_state ?? '').toLowerCase();
    if (state === 'dirty' || state === 'conflicting' || l?.mergeable === false) {
      conflicted.push({ ...entry, reason: 'merge conflicts with main' });
      continue;
    }
    if (state === 'blocked') {
      blocked.push({ ...entry, reason: 'GitHub reports mergeable_state blocked' });
      continue;
    }
    if (!l) {
      blocked.push({
        ...entry,
        reason: token ? 'live GitHub read failed or PR beyond the live-read cap' : 'ORCH_GITHUB_TOKEN not configured — no live read',
      });
      continue;
    }
    if (l.mergeable !== true) {
      blocked.push({ ...entry, reason: `mergeable is ${String(l.mergeable)} — GitHub still computing or refusing` });
      continue;
    }
    if (!READY_MERGE_STATES.has(state)) {
      blocked.push({ ...entry, reason: `mergeable_state is '${state || 'unknown'}'` });
      continue;
    }
    if (row.ci_state !== 'pass') {
      blocked.push({ ...entry, reason: `CI is '${row.ci_state ?? 'unknown'}' at last sync — guard would refuse` });
      continue;
    }

    if (entry.risk_tier === 'HELD') ready.held.push(entry);
    else if (entry.risk_tier === 'LOW') ready.low.push(entry);
    else ready.normal.push(entry);
  }

  const readyCount = ready.low.length + ready.normal.length + ready.held.length;
  return NextResponse.json({
    ok: true,
    live: Boolean(token),
    ready,
    conflicted,
    blocked,
    drafts,
    counts: {
      open: rows.length,
      ready: readyCount,
      conflicted: conflicted.length,
      held: rows.filter((r) => tierOf(r) === 'HELD').length,
    },
  });
}
