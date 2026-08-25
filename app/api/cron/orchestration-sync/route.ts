// =====================================================================
// Orchestration state writer — keeps the Orchestration Console alive
// =====================================================================
// Closes the gap PR #3183 left open: that PR built the console's read API
// and a manual POST /api/admin/orchestration/sync endpoint, but nothing
// calls either one on a schedule — so orchestration_modules, orchestration_prs,
// orchestration_actions and orchestration_session_state stay empty forever
// and the console renders blank. This route is the missing writer.
//
// Each run, via the service-role client:
//   1. Pulls open PRs for Jicate-Solutions/MyJKKN from the GitHub REST API
//      (best-effort: no token configured → skip the PR refresh, still do the
//      rest — never fails the whole run over a missing token).
//   2. Upserts one orchestration_prs row per open PR (conflict key: number),
//      with a module_key derived from the PR title's conventional-commit
//      scope (`fix(campus-living): …` → `campus-living`), falling back to
//      the branch-name prefix when the title carries no scope.
//   3. Upserts orchestration_modules rows for each distinct module_key seen
//      this run, deriving `status` from that module's current PRs. Only
//      `key`, `title` (kept as-is if the module already exists) and `status`
//      are written — does_text/output_text/impact_text/module_url/
//      blocked_reason/blocked_impact are NEVER touched here, so a human's
//      hand-written explainer text can never be clobbered by a cron tick.
//   4. Writes a heartbeat row into orchestration_session_state (session_id
//      'cron-sync') — this is what powers the console's "updated Xm ago"
//      freshness stamp even when no tower session is currently open.
//   5. Prunes orchestration_prs rows for PRs that are no longer open — but
//      ONLY when the GitHub fetch actually succeeded this run, so a transient
//      GitHub outage can never wipe good data out from under the console.
//
// The four orchestration_* tables ship in a migration that is staged but not
// yet applied (supabase/migrations/20261003000000_orchestration_console.sql).
// Every DB call below is guarded so a missing-relation error (Postgres
// 42P01) degrades to a clean, logged skip — this route must never 500 just
// because the migration hasn't landed yet.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` header (Vercel cron
// invoker sends this automatically) OR `?secret=` query param (manual runs) —
// same dual-guard pattern as every other cron route in this repo.
// Never merges or deploys anything — this writer only reads GitHub and writes
// its own four tables.
// =====================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

const GITHUB_API = 'https://api.github.com';
const REPO_OWNER = 'Jicate-Solutions';
const REPO_NAME = 'MyJKKN';

// Per-PR detail (mergeable state + CI check-runs) costs up to 2 extra GitHub
// calls each. Bounded so one run can never fan out into hundreds of calls —
// PRs beyond this count still get their basic row (number/title/module_key/
// is_draft), just without mergeable/ci_state this tick.
const MAX_PRS_DETAILED = 60;
const GH_CONCURRENCY = 8;

type CiState = 'pass' | 'fail' | 'pending' | 'none';
type ModuleStatus = 'idle' | 'working' | 'gated' | 'blocked';

interface NormalizedPr {
  number: number;
  title: string | null;
  isDraft: boolean;
  moduleKey: string | null;
  mergeableState: string | null;
  ciState: CiState | null;
}

function ghHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function ciFromCheckRuns(runs: Array<{ status?: string; conclusion?: string | null }>): CiState {
  if (!runs || runs.length === 0) return 'none';
  if (runs.some((r) => r.status !== 'completed')) return 'pending';
  if (runs.some((r) => ['failure', 'timed_out', 'cancelled'].includes(r.conclusion ?? ''))) return 'fail';
  return 'pass';
}

// Conventional-commit scope from the title (`fix(campus-living): …` →
// `campus-living`); falls back to the branch name — stripping a leading
// conventional type segment (`feat/`, `fix/`, …) then taking the token up to
// the first `-`/`_` as the module key. Best-effort only: this powers a
// console grouping, not a source of truth, so an imperfect guess here is
// fine and never blocks the row from being written.
function deriveModuleKey(title: string | null, branchRef: string | null): string | null {
  const scope = title?.match(/^\s*[a-zA-Z][\w.-]*\(([^)]+)\)/)?.[1]?.trim();
  if (scope) return scope;

  const branch = branchRef?.trim();
  if (!branch) return null;
  const withoutType = branch.replace(
    /^(feat|fix|chore|refactor|test|docs|ci|build|perf|style|hotfix)\//,
    '',
  );
  const seg = withoutType.split(/[-_/]/).filter(Boolean)[0];
  return seg || branch;
}

function humanizeModuleKey(key: string): string {
  return key
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// A PR is "blocked" when CI is red or GitHub reports a real merge conflict.
// "gated" covers everything still in flight (CI running/absent, or draft) —
// the safe, honest middle state. Anything else counts toward "idle" per the
// module status rule below. Deliberately reads only ci_state/mergeable/
// is_draft — fields this writer itself computes — and leaves `gate_state`
// alone since that column's vocabulary belongs to a different agent's work.
function classifyPr(pr: { ciState: CiState | null; mergeableState: string | null; isDraft: boolean }): 'blocked' | 'gated' | 'ok' {
  const conflictStates = new Set(['dirty', 'blocked']);
  if (pr.ciState === 'fail' || (pr.mergeableState && conflictStates.has(pr.mergeableState.toLowerCase()))) {
    return 'blocked';
  }
  if (pr.isDraft || pr.ciState === 'pending' || pr.ciState === 'none' || pr.ciState === null) {
    return 'gated';
  }
  return 'ok';
}

function moduleStatusFromPrs(classifications: Array<'blocked' | 'gated' | 'ok'>): ModuleStatus {
  if (classifications.some((c) => c === 'blocked')) return 'blocked';
  if (classifications.length > 0 && classifications.every((c) => c === 'gated')) return 'gated';
  return 'idle';
}

async function fetchOpenPrList(
  token: string,
): Promise<Array<{ number: number; title: string; draft: boolean; head: { sha: string; ref: string } }>> {
  const headers = ghHeaders(token);
  const out: Array<{ number: number; title: string; draft: boolean; head: { sha: string; ref: string } }> = [];
  let page = 1;
  // Hard safety cap: 10 pages * 100 = 1,000 open PRs. This repo has never
  // come close; this just bounds worst-case pagination.
  while (page <= 10) {
    const res = await fetch(
      `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/pulls?state=open&per_page=100&page=${page}&sort=created&direction=desc`,
      { headers, cache: 'no-store' },
    );
    if (!res.ok) {
      throw new Error(`GitHub pulls list failed: HTTP ${res.status}`);
    }
    const batch = (await res.json()) as Array<{
      number: number;
      title: string;
      draft: boolean;
      head: { sha: string; ref: string };
    }>;
    out.push(...batch);
    if (batch.length < 100) break;
    page += 1;
  }
  return out;
}

async function buildNormalizedPr(
  headers: HeadersInit,
  listItem: { number: number; title: string; draft: boolean; head: { sha: string; ref: string } },
): Promise<NormalizedPr> {
  const moduleKey = deriveModuleKey(listItem.title ?? null, listItem.head?.ref ?? null);

  let mergeableState: string | null = null;
  try {
    const detailRes = await fetch(`${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${listItem.number}`, {
      headers,
      cache: 'no-store',
    });
    if (detailRes.ok) {
      const detail = (await detailRes.json()) as { mergeable_state?: string | null };
      mergeableState = typeof detail.mergeable_state === 'string' ? detail.mergeable_state : null;
    }
  } catch {
    // best-effort — leave mergeableState null
  }

  let ciState: CiState = 'none';
  try {
    const sha = listItem.head?.sha;
    if (sha) {
      const checksRes = await fetch(
        `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/commits/${sha}/check-runs?per_page=100`,
        { headers, cache: 'no-store' },
      );
      if (checksRes.ok) {
        const checksJson = (await checksRes.json()) as {
          check_runs?: Array<{ status?: string; conclusion?: string | null }>;
        };
        ciState = ciFromCheckRuns(checksJson.check_runs ?? []);
      }
    }
  } catch {
    // best-effort — leave ciState at its default
  }

  return {
    number: listItem.number,
    title: listItem.title ?? null,
    isDraft: !!listItem.draft,
    moduleKey,
    mergeableState,
    ciState,
  };
}

async function fetchOpenPrsWithDetail(token: string): Promise<{ prs: NormalizedPr[]; truncated: boolean }> {
  const listed = await fetchOpenPrList(token);
  const headers = ghHeaders(token);
  const detailed = listed.slice(0, MAX_PRS_DETAILED);
  const overflow = listed.slice(MAX_PRS_DETAILED);

  const results: NormalizedPr[] = [];
  for (let i = 0; i < detailed.length; i += GH_CONCURRENCY) {
    const chunk = detailed.slice(i, i + GH_CONCURRENCY);
    const chunkResults = await Promise.all(chunk.map((pr) => buildNormalizedPr(headers, pr)));
    results.push(...chunkResults);
  }

  for (const pr of overflow) {
    results.push({
      number: pr.number,
      title: pr.title ?? null,
      isDraft: !!pr.draft,
      moduleKey: deriveModuleKey(pr.title ?? null, pr.head?.ref ?? null),
      mergeableState: null,
      ciState: null,
    });
  }

  return { prs: results, truncated: overflow.length > 0 };
}

function isMissingRelationError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  const message = err instanceof Error ? err.message : String((err as { message?: string } | null)?.message ?? err);
  return code === '42P01' || /relation .* does not exist/i.test(message ?? '');
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.warn('[cron/orchestration-sync] CRON_SECRET not configured');
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    console.warn('[cron/orchestration-sync] Unauthorized attempt');
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const started = Date.now();

  let supabase: ReturnType<typeof createServiceRoleClient>;
  try {
    supabase = createServiceRoleClient();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Supabase service role not configured';
    console.error('[cron/orchestration-sync] service role client failed:', message);
    return NextResponse.json({ ok: false, error: message, elapsed_ms: Date.now() - started }, { status: 500 });
  }

  const summary = {
    ok: true as boolean,
    github: {
      token_present: false,
      attempted: false,
      succeeded: false,
      open_prs_fetched: 0,
      detail_truncated: false,
      error: null as string | null,
    },
    prs_upserted: 0,
    prs_pruned: 0,
    modules_upserted: 0,
    heartbeat_written: false,
    tables_missing: [] as string[],
    errors: [] as string[],
    elapsed_ms: 0,
  };

  // ── 1) Pull open PRs from GitHub (best-effort) ──────────────────────────
  const token = process.env.ORCH_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
  let openPrs: NormalizedPr[] = [];
  let ghSucceeded = false;
  if (!token) {
    summary.github.error = 'No ORCH_GITHUB_TOKEN or GITHUB_TOKEN configured — PR refresh skipped';
  } else {
    summary.github.token_present = true;
    summary.github.attempted = true;
    try {
      const { prs, truncated } = await fetchOpenPrsWithDetail(token);
      openPrs = prs;
      summary.github.detail_truncated = truncated;
      summary.github.open_prs_fetched = openPrs.length;
      ghSucceeded = true;
      summary.github.succeeded = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'GitHub fetch failed';
      summary.github.error = message;
      console.warn('[cron/orchestration-sync] GitHub PR fetch failed:', message);
    }
  }

  // ── 2) Upsert orchestration_prs ──────────────────────────────────────────
  if (openPrs.length > 0) {
    const nowIso = new Date().toISOString();
    const rows = openPrs.map((p) => ({
      number: p.number,
      module_key: p.moduleKey,
      title: p.title,
      mergeable: p.mergeableState,
      ci_state: p.ciState,
      ci_checked_at: p.ciState !== null ? nowIso : null,
      is_draft: p.isDraft,
      updated_at: nowIso,
    }));
    try {
      const { error } = await supabase.from('orchestration_prs').upsert(rows, { onConflict: 'number' });
      if (error) {
        if (isMissingRelationError(error)) {
          summary.tables_missing.push('orchestration_prs');
        } else {
          summary.errors.push(`orchestration_prs upsert: ${error.message}`);
        }
      } else {
        summary.prs_upserted = rows.length;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'orchestration_prs upsert threw';
      if (isMissingRelationError(err)) summary.tables_missing.push('orchestration_prs');
      else summary.errors.push(`orchestration_prs upsert: ${message}`);
    }
  }

  // ── 3) Prune closed PRs — ONLY when GitHub actually answered this run ──
  if (ghSucceeded) {
    try {
      if (openPrs.length === 0) {
        // No open PRs at all: every tracked row is stale.
        const { error, count } = await supabase
          .from('orchestration_prs')
          .delete({ count: 'exact' })
          .gt('number', 0);
        if (error) {
          if (isMissingRelationError(error)) summary.tables_missing.push('orchestration_prs');
          else summary.errors.push(`orchestration_prs prune: ${error.message}`);
        } else {
          summary.prs_pruned = count ?? 0;
        }
      } else {
        const openNumbers = openPrs.map((p) => p.number);
        const { error, count } = await supabase
          .from('orchestration_prs')
          .delete({ count: 'exact' })
          .not('number', 'in', `(${openNumbers.join(',')})`);
        if (error) {
          if (isMissingRelationError(error)) summary.tables_missing.push('orchestration_prs');
          else summary.errors.push(`orchestration_prs prune: ${error.message}`);
        } else {
          summary.prs_pruned = count ?? 0;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'orchestration_prs prune threw';
      if (isMissingRelationError(err)) summary.tables_missing.push('orchestration_prs');
      else summary.errors.push(`orchestration_prs prune: ${message}`);
    }
  }

  // ── 4) Upsert orchestration_modules for every module_key seen ──────────
  const moduleKeys = Array.from(
    new Set(openPrs.map((p) => p.moduleKey).filter((k): k is string => !!k && k.length > 0)),
  );
  if (moduleKeys.length > 0) {
    try {
      const statusByModule = new Map<string, ModuleStatus>();
      for (const key of moduleKeys) {
        const classifications = openPrs
          .filter((p) => p.moduleKey === key)
          .map((p) => classifyPr(p));
        statusByModule.set(key, moduleStatusFromPrs(classifications));
      }

      const { data: existingModules, error: fetchErr } = await supabase
        .from('orchestration_modules')
        .select('key, title')
        .in('key', moduleKeys);
      if (fetchErr) {
        if (isMissingRelationError(fetchErr)) {
          summary.tables_missing.push('orchestration_modules');
        } else {
          summary.errors.push(`orchestration_modules read: ${fetchErr.message}`);
        }
      } else {
        const existingTitleByKey = new Map((existingModules ?? []).map((m) => [m.key as string, m.title as string]));
        const nowIso = new Date().toISOString();
        // Only key/title/status/updated_at are ever written here — module_url,
        // blocked_reason, blocked_impact, does_text, output_text, impact_text
        // are intentionally absent from this payload so a human's hand-written
        // text (or the seed script's) is never clobbered by a sync tick.
        const moduleRows = moduleKeys.map((key) => ({
          key,
          title: existingTitleByKey.get(key) ?? humanizeModuleKey(key),
          status: statusByModule.get(key) ?? 'idle',
          updated_at: nowIso,
        }));
        const { error: upsertErr } = await supabase
          .from('orchestration_modules')
          .upsert(moduleRows, { onConflict: 'key' });
        if (upsertErr) {
          if (isMissingRelationError(upsertErr)) summary.tables_missing.push('orchestration_modules');
          else summary.errors.push(`orchestration_modules upsert: ${upsertErr.message}`);
        } else {
          summary.modules_upserted = moduleRows.length;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'orchestration_modules step threw';
      if (isMissingRelationError(err)) summary.tables_missing.push('orchestration_modules');
      else summary.errors.push(`orchestration_modules: ${message}`);
    }
  }

  // ── 5) Heartbeat — always attempted, regardless of GitHub outcome ──────
  try {
    const activity = ghSucceeded
      ? `synced ${summary.prs_upserted} open PR(s) across ${summary.modules_upserted} module(s)`
      : `PR refresh skipped (${summary.github.error ?? 'no GitHub token'}); heartbeat only`;
    const { error } = await supabase.from('orchestration_session_state').upsert(
      {
        session_id: 'cron-sync',
        name: 'Orchestration sync (cron)',
        current_activity: activity,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'session_id' },
    );
    if (error) {
      if (isMissingRelationError(error)) summary.tables_missing.push('orchestration_session_state');
      else summary.errors.push(`orchestration_session_state upsert: ${error.message}`);
    } else {
      summary.heartbeat_written = true;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'orchestration_session_state upsert threw';
    if (isMissingRelationError(err)) summary.tables_missing.push('orchestration_session_state');
    else summary.errors.push(`orchestration_session_state: ${message}`);
  }

  summary.tables_missing = Array.from(new Set(summary.tables_missing));
  summary.ok = summary.errors.length === 0;
  summary.elapsed_ms = Date.now() - started;

  // Always 200: a missing table or a down GitHub API is reported in the body
  // (tables_missing / errors / github.error), never surfaced as an HTTP
  // failure — this route must never look "down" to cron monitoring just
  // because the migration hasn't landed yet or GitHub had a bad minute.
  return NextResponse.json(summary);
}
