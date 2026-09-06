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
//   3. Upserts orchestration_modules rows — but ONLY for a known module key:
//      one of the ~11 seeded modules, or a key a human has already curated
//      (any of does_text/output_text/impact_text/blocked_reason/
//      blocked_impact/module_url is non-empty). Every other PR scope folds
//      into a single `other` catch-all row instead of minting a new one —
//      this is what used to blow up into 55 module cards, one per commit
//      scope ever seen. `status` is derived from that module's current PRs,
//      but can only ever be the non-blocking vocabulary (`idle`/`gated`) —
//      `status='blocked'` is written only by preserving a module's existing
//      status when it already carries a human blocked_reason; PR state alone
//      can never produce a blocked row with no explanation. Only `key`,
//      `title` (kept as-is if the module already exists), `status` and
//      `updated_at` are written — does_text/output_text/impact_text/
//      module_url/blocked_reason/blocked_impact are NEVER touched here, so a
//      human's hand-written explainer text can never be clobbered by a cron
//      tick. Unreachable, uncurated module rows are pruned in the same step.
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
import { classifyPullRequestRisk, type PullRequestRisk } from '@/lib/services/orchestration/pr-risk';

const GITHUB_API = 'https://api.github.com';
const REPO_OWNER = 'Jicate-Solutions';
const REPO_NAME = 'MyJKKN';

// Per-PR detail (mergeable state + CI check-runs + changed files for the risk
// tier) costs up to 3 extra GitHub calls each. Bounded so one run can never
// fan out into hundreds of calls — PRs beyond this count still get their basic
// row (number/title/module_key/is_draft), just without mergeable/ci_state/
// risk_tier this tick.
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
  /** null when the files read failed or the PR was past MAX_PRS_DETAILED —
   *  the stored tier is then left untouched rather than reset to NORMAL. */
  risk: PullRequestRisk | null;
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
// NOTE: this 'blocked' label is a PR-level signal only — moduleStatusFromPrs
// below never turns it into a module's status='blocked' on its own. A module
// only ever becomes 'blocked' when a human has written a blocked_reason (see
// the sync route's module-status step); PR state alone folds into 'gated'.
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

// PR-derived status is deliberately limited to the non-blocking vocabulary
// ('idle' / 'gated'). A module's status can only become 'blocked' when a
// human has written a blocked_reason — the sync route enforces that at the
// call site below, not here. A CI failure or merge conflict on a PR still
// surfaces as 'gated' ("needs attention"), never invents a blocked module
// with no explanation attached.
function moduleStatusFromPrs(classifications: Array<'blocked' | 'gated' | 'ok'>): ModuleStatus {
  if (classifications.length === 0) return 'idle';
  if (classifications.some((c) => c === 'blocked' || c === 'gated')) return 'gated';
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
  token: string,
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

  // Risk tier from the changed-file list. Title/draft come from the list call
  // already in hand, so this is one extra GitHub read per PR (files), not two.
  // null on a read failure — the stored tier is then preserved, never reset.
  const risk = await classifyPullRequestRisk(token, listItem.number, {
    title: listItem.title ?? '',
    isDraft: !!listItem.draft,
  });

  return {
    number: listItem.number,
    title: listItem.title ?? null,
    isDraft: !!listItem.draft,
    moduleKey,
    mergeableState,
    ciState,
    risk,
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
    const chunkResults = await Promise.all(chunk.map((pr) => buildNormalizedPr(token, headers, pr)));
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
      risk: null,
    });
  }

  return { prs: results, truncated: overflow.length > 0 };
}

function isMissingRelationError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  const message = err instanceof Error ? err.message : String((err as { message?: string } | null)?.message ?? err);
  return code === '42P01' || /relation .* does not exist/i.test(message ?? '');
}

// Postgres 42703 (undefined_column), or PostgREST's schema-cache phrasing of
// the same fact — the risk-tier migration has not been applied to this DB.
function isMissingColumnError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  const message = err instanceof Error ? err.message : String((err as { message?: string } | null)?.message ?? err);
  return (
    code === '42703' ||
    code === 'PGRST204' ||
    /column .* does not exist/i.test(message ?? '') ||
    /Could not find the .* column/i.test(message ?? '')
  );
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
    prs_risk_classified: 0,
    risk_columns_missing: false,
    prs_pruned: 0,
    modules_upserted: 0,
    modules_pruned: 0,
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
    const baseRow = (p: NormalizedPr) => ({
      number: p.number,
      module_key: p.moduleKey,
      title: p.title,
      mergeable: p.mergeableState,
      ci_state: p.ciState,
      ci_checked_at: p.ciState !== null ? nowIso : null,
      is_draft: p.isDraft,
      updated_at: nowIso,
    });

    // Two upserts, not one: PostgREST requires every object in a bulk upsert
    // to carry the same keys, and a PR whose files could not be read must NOT
    // have its stored tier reset to the column default — so classified PRs go
    // with the risk columns, the rest without.
    const classified = openPrs.filter((p) => p.risk !== null);
    const unclassified = openPrs.filter((p) => p.risk === null);
    const riskRows = classified.map((p) => ({
      ...baseRow(p),
      risk_tier: p.risk!.tier,
      risk_reasons: p.risk!.reasons,
      changed_files_count: p.risk!.changedFilesCount,
    }));
    const plainRows = unclassified.map(baseRow);

    const reportUpsertError = (error: unknown) => {
      const message =
        error instanceof Error ? error.message : String((error as { message?: string } | null)?.message ?? error);
      if (isMissingRelationError(error)) summary.tables_missing.push('orchestration_prs');
      else summary.errors.push(`orchestration_prs upsert: ${message}`);
    };

    try {
      if (riskRows.length > 0) {
        const { error } = await supabase.from('orchestration_prs').upsert(riskRows, { onConflict: 'number' });
        if (error && isMissingColumnError(error)) {
          // 20261105000000_orchestration_prs_risk_tier.sql not applied yet —
          // fall back to the pre-tier row shape so the console keeps syncing.
          summary.risk_columns_missing = true;
          const retry = await supabase
            .from('orchestration_prs')
            .upsert(classified.map(baseRow), { onConflict: 'number' });
          if (retry.error) reportUpsertError(retry.error);
          else summary.prs_upserted += classified.length;
        } else if (error) {
          reportUpsertError(error);
        } else {
          summary.prs_upserted += riskRows.length;
          summary.prs_risk_classified = riskRows.length;
        }
      }
      if (plainRows.length > 0) {
        const { error } = await supabase.from('orchestration_prs').upsert(plainRows, { onConflict: 'number' });
        if (error) reportUpsertError(error);
        else summary.prs_upserted += plainRows.length;
      }
    } catch (err) {
      reportUpsertError(err instanceof Error ? err : new Error('orchestration_prs upsert threw'));
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

  // ── 4) Upsert orchestration_modules — constrained to a known module set ─
  // This used to mint a fresh module row for every distinct commit-scope
  // seen in an open PR title — one PR titled `fix(doctrines): …` invented a
  // permanent "Doctrines" module. Instead: a PR's derived scope only gets
  // its own row when it's one of the seeded modules below, or a human has
  // already written something onto that key (curated into existence). Any
  // other scope folds into the single CATCH_ALL_MODULE_KEY bucket rather
  // than minting a new row. PRs are still tracked in full under their real
  // scope in orchestration_prs (step 2, above, untouched) — only module-row
  // creation is constrained here.
  const CATCH_ALL_MODULE_KEY = 'other';
  const SEED_MODULE_KEYS = new Set([
    'referral',
    'notifications',
    'learners-council',
    'security',
    'accreditation',
    'campus-living',
    'hr',
    'solutions',
    'academic',
    'admissions',
    'orchestration',
  ]);

  if (openPrs.length > 0) {
    try {
      // Read the FULL existing catalog — not just this run's module keys —
      // needed to (a) tell real/curated modules apart from cron-invented
      // noise, and (b) find prune candidates below.
      const { data: allModules, error: fetchErr } = await supabase
        .from('orchestration_modules')
        .select('key, title, status, blocked_reason, blocked_impact, does_text, output_text, impact_text, module_url');

      if (fetchErr) {
        if (isMissingRelationError(fetchErr)) {
          summary.tables_missing.push('orchestration_modules');
        } else {
          summary.errors.push(`orchestration_modules read: ${fetchErr.message}`);
        }
      } else {
        const existingByKey = new Map((allModules ?? []).map((m) => [m.key as string, m as Record<string, unknown>]));

        // Any of these being non-empty means a human (or a prior seed
        // script) deliberately curated this module into existence — never
        // re-derive its status from raw PR state, never prune it.
        const hasHumanContent = (m: Record<string, unknown> | undefined): boolean =>
          !!m &&
          [m.blocked_reason, m.blocked_impact, m.does_text, m.output_text, m.impact_text, m.module_url].some(
            (v) => typeof v === 'string' && v.trim().length > 0,
          );

        const isProtectedKey = (key: string): boolean =>
          SEED_MODULE_KEYS.has(key) || hasHumanContent(existingByKey.get(key));

        const mappedKeyForPr = (moduleKey: string | null): string =>
          moduleKey && isProtectedKey(moduleKey) ? moduleKey : CATCH_ALL_MODULE_KEY;

        const targetKeys = Array.from(new Set(openPrs.map((p) => mappedKeyForPr(p.moduleKey))));

        const statusByModule = new Map<string, ModuleStatus>();
        for (const key of targetKeys) {
          const existing = existingByKey.get(key);
          const blockedReason = existing?.blocked_reason;
          if (typeof blockedReason === 'string' && blockedReason.trim().length > 0) {
            // A human already explained why this module is blocked — leave
            // its status exactly as-is instead of recomputing it from PRs.
            statusByModule.set(key, ((existing?.status as ModuleStatus) ?? 'blocked'));
          } else {
            const classifications = openPrs
              .filter((p) => mappedKeyForPr(p.moduleKey) === key)
              .map((p) => classifyPr(p));
            statusByModule.set(key, moduleStatusFromPrs(classifications));
          }
        }

        const nowIso = new Date().toISOString();
        // Only key/title/status/updated_at are ever written here — module_url,
        // blocked_reason, blocked_impact, does_text, output_text, impact_text
        // are intentionally absent from this payload so a human's hand-written
        // text (or the seed script's) is never clobbered by a sync tick.
        const moduleRows = targetKeys.map((key) => ({
          key,
          title: (existingByKey.get(key)?.title as string | undefined) ?? humanizeModuleKey(key),
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

        // ── Prune sensibly — only rows that are both unreachable by any
        // open PR this run AND carry no human-written text/blocked_reason.
        // When in doubt (protected key, or still targeted), leave the row.
        const staleKeys = (allModules ?? [])
          .map((m) => m.key as string)
          .filter((key) => key !== CATCH_ALL_MODULE_KEY && !targetKeys.includes(key) && !isProtectedKey(key));
        if (staleKeys.length > 0) {
          const { error: pruneErr, count } = await supabase
            .from('orchestration_modules')
            .delete({ count: 'exact' })
            .in('key', staleKeys);
          if (pruneErr) {
            if (isMissingRelationError(pruneErr)) summary.tables_missing.push('orchestration_modules');
            else summary.errors.push(`orchestration_modules prune: ${pruneErr.message}`);
          } else {
            summary.modules_pruned = count ?? 0;
          }
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
