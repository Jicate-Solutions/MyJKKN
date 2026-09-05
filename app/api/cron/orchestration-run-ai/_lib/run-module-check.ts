// app/api/cron/orchestration-run-ai/_lib/run-module-check.ts
//
// Shared handler behind every `/api/cron/orchestration-run-ai/<moduleKey>`
// route. This is the routine the Orchestration Console's "Run AI" button
// (app/api/admin/orchestration/run/route.ts, owned by another agent — NOT
// edited here) resolves via `getRoutineById('orchestration-run-ai-<key>')` in
// lib/ai-routines/registry.ts and fires with a plain GET + Bearer CRON_SECRET,
// exactly like app/api/admin/ai-routines/trigger/route.ts fires any other
// registered cron. That call carries no query string and no body, so the
// module key has to live in the URL PATH — hence one thin route.ts per module
// (each just calls this with its own hardcoded key) instead of a single route
// reading `?moduleKey=`. A query string does not work here: the registry's
// own wiring test (__tests__/lib/ai-routines/registry-cron-wiring.test.ts)
// resolves a cron triggerPath to a literal `app/<triggerPath>/route.ts` on
// disk, and a `?`-bearing path never matches a real directory.
//
// WHAT THIS ROUTINE DOES — gate + report, nothing else:
//   1. Authenticates the caller via Authorization: Bearer <CRON_SECRET>, the
//      same constant-time check every other /api/cron/* route in this repo
//      uses (mirrored from app/api/cron/event-feedback-naac-evidence/route.ts).
//   2. Finds the orchestration_actions row the console's run route just
//      inserted (kind='run_ai', target=<moduleKey>, status='pending') and
//      flips it to 'running'. Falls back to inserting its own row when this
//      route is fired directly (curl, or a future dispatcher schedule) rather
//      than via the console.
//   3. Reads the PRs already tracked for this module from orchestration_prs
//      (module_key=<moduleKey> — that mapping only exists there; GitHub has
//      no concept of "module"), and for each one, asks the GitHub REST API
//      for its live mergeable_state + check-run CI state, then upserts the
//      refreshed row back into orchestration_prs.
//   4. Marks the action row 'done' with a result summary, or 'failed' with
//      the honest reason — NEVER 'done' for work it did not actually do.
//
// HARD CONSTRAINT: this routine never merges or deploys anything. It has no
// write path to GitHub at all beyond reading PR/check state — no `gh pr
// merge`, no deploy hook, nothing that changes what ships.
//
// Every Supabase call is wrapped so a missing table (orchestration_actions /
// orchestration_prs — the console's migration is staged but not yet applied
// everywhere, per its own header) degrades to an honest 'failed' response
// instead of an unhandled crash.

import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const ORCHESTRATION_REPO_FULL_NAME = 'Jicate-Solutions/MyJKKN';
const GITHUB_API = 'https://api.github.com';
const MAX_PRS_PER_RUN = 25;

// ── auth ─────────────────────────────────────────────────────────────────

function bearerMatches(authHeader: string | null, secret: string): boolean {
  const presented = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ── "table doesn't exist yet" detection (mirrors the repo's own convention,
// e.g. lib/services/campus-living/empty-bed-notice-service.ts) ────────────

function isMissingRelation(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === '42P01' || error.code === 'PGRST205') return true;
  return /does not exist|schema cache/i.test(error.message ?? '');
}

// ── GitHub REST — read-only: PR detail + check-runs only, nothing else ────

function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function ghGet(token: string, path: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${GITHUB_API}${path}`, { headers: ghHeaders(token), cache: 'no-store' });
  const json = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, json };
}

/** Mirrors lib/services/solutions/repo-activity-service.ts's ciFromCheckRuns. */
function ciFromCheckRuns(runs: Array<{ status?: string; conclusion?: string }> | undefined | null): string {
  if (!runs || runs.length === 0) return 'none';
  if (runs.some((r) => r.status !== 'completed')) return 'pending';
  if (runs.some((r) => ['failure', 'timed_out', 'cancelled'].includes(r.conclusion ?? ''))) return 'fail';
  return 'pass';
}

// ── main handler ────────────────────────────────────────────────────────

/**
 * Resolves the GitHub token this routine reads PR/CI state with.
 *
 * Order is deliberate: a least-privilege read-only token first, and the
 * orchestration console's own ORCH_GITHUB_TOKEN only as a floor. Exported so
 * the ORDER itself is testable — the failure this closes was silent, and the
 * kind of thing a later edit reorders without noticing.
 */
export function resolveGithubToken(
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  return (
    env.CRON_GITHUB_TOKEN || env.GITHUB_TOKEN || env.GH_TOKEN || env.ORCH_GITHUB_TOKEN
  );
}

export async function runOrchestrationModuleCheck(
  request: NextRequest,
  moduleKey: string,
): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || !bearerMatches(authHeader, cronSecret)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  let supabase: ReturnType<typeof createServiceRoleClient>;
  try {
    supabase = createServiceRoleClient();
  } catch (err) {
    // Missing SUPABASE_SERVICE_ROLE_KEY / URL — cannot even open the audit
    // trail, so there is nothing honest left to report.
    const message = err instanceof Error ? err.message : 'service role client unavailable';
    return NextResponse.json({ ok: false, moduleKey, error: message }, { status: 500 });
  }

  // 1) open (or find) the action row and flip it to 'running'.
  let actionId: string | null = null;
  try {
    const { data: pending, error: pendingErr } = await supabase
      .from('orchestration_actions')
      .select('id')
      .eq('kind', 'run_ai')
      .eq('target', moduleKey)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pendingErr) {
      if (isMissingRelation(pendingErr)) {
        return NextResponse.json(
          {
            ok: false,
            moduleKey,
            error: 'orchestration_actions table does not exist yet (migration not applied).',
          },
          { status: 500 },
        );
      }
      throw pendingErr;
    }

    if (pending?.id) {
      actionId = pending.id as string;
      await supabase.from('orchestration_actions').update({ status: 'running' }).eq('id', actionId);
    } else {
      // Fired directly (no console-inserted 'pending' row waiting) — open our
      // own audit row so a bare curl / future schedule still leaves a trail.
      const { data: inserted, error: insertErr } = await supabase
        .from('orchestration_actions')
        .insert({ kind: 'run_ai', target: moduleKey, status: 'running' })
        .select('id')
        .single();
      if (insertErr) throw insertErr;
      actionId = (inserted?.id as string) ?? null;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed to open the orchestration_actions row';
    return NextResponse.json({ ok: false, moduleKey, error: message }, { status: 500 });
  }

  const markDone = async (result: Record<string, unknown>) => {
    if (actionId) {
      const { error } = await supabase
        .from('orchestration_actions')
        .update({ status: 'done', result })
        .eq('id', actionId);
      if (error) {
        // The work itself succeeded; only the final audit write failed. Say so
        // rather than silently dropping it.
        return NextResponse.json(
          { ok: true, moduleKey, actionId, ...result, auditWriteError: error.message },
          { status: 200 },
        );
      }
    }
    return NextResponse.json({ ok: true, moduleKey, actionId, ...result }, { status: 200 });
  };

  const markFailed = async (reason: string, extra: Record<string, unknown> = {}) => {
    if (actionId) {
      await supabase
        .from('orchestration_actions')
        .update({ status: 'failed', result: { error: reason, ...extra } })
        .eq('id', actionId);
    }
    return NextResponse.json({ ok: false, moduleKey, actionId, error: reason, ...extra }, { status: 502 });
  };

  // 2) GitHub token. No general-purpose org PAT exists in this repo yet — the
  // only one on file (GITHUB_SOLUTIONS_HUB_TOKEN) is scoped to intern repos
  // for an unrelated feature (lib/services/solutions/repo-activity-service.ts)
  // and should not be assumed to cover Jicate-Solutions/MyJKKN itself. This
  // routine needs its own read-only PAT (pull-requests:read, checks:read on
  // Jicate-Solutions/MyJKKN) set as CRON_GITHUB_TOKEN (or GITHUB_TOKEN /
  // GH_TOKEN as a fallback if one is already configured server-side).
  //
  // ORCH_GITHUB_TOKEN is accepted LAST, as a floor. The orchestration console
  // already requires that token for its Merge button
  // (lib/services/orchestration/github-merge.ts), and its scope
  // (contents:write + pull_requests:write) strictly covers the reads this
  // routine needs. Without this fallback the console needs TWO differently
  // named GitHub tokens depending on which of its own buttons you press:
  // configuring it correctly for Merge still leaves Run AI dead, and the error
  // named three variables — none of them the one the other half of the same
  // feature uses. Prefer a least-privilege read-only CRON_GITHUB_TOKEN when
  // one exists; fall back rather than fail with the console's own token in
  // hand. Absent every name → an honest 'failed', never a fabricated 'done'.
  const token = resolveGithubToken();
  if (!token) {
    return markFailed(
      'No GitHub token configured (CRON_GITHUB_TOKEN / GITHUB_TOKEN / GH_TOKEN / ORCH_GITHUB_TOKEN) — cannot read PR/CI state.',
    );
  }

  // 3) which PRs belong to this module — read from orchestration_prs, never
  // discovered fresh from GitHub (that mapping is the sync route's job).
  let trackedNumbers: number[] = [];
  try {
    const { data, error } = await supabase
      .from('orchestration_prs')
      .select('number')
      .eq('module_key', moduleKey)
      .order('number', { ascending: false })
      .limit(MAX_PRS_PER_RUN);
    if (error) {
      if (isMissingRelation(error)) {
        return markFailed('orchestration_prs table does not exist yet (migration not applied).');
      }
      throw error;
    }
    trackedNumbers = (data ?? [])
      .map((r: { number: unknown }) => Number(r.number))
      .filter((n: number) => Number.isFinite(n));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed to read tracked PRs';
    return markFailed(message);
  }

  if (trackedNumbers.length === 0) {
    return markDone({
      checked: 0,
      updated: 0,
      note: `No PRs are tracked for module "${moduleKey}" yet — nothing to refresh. PR tracking is populated by /api/admin/orchestration/sync.`,
      elapsed_ms: Date.now() - startedAt,
    });
  }

  // 4) refresh each tracked PR's live mergeable_state + CI state.
  let updated = 0;
  const errors: string[] = [];
  for (const number of trackedNumbers) {
    try {
      const pr = await ghGet(token, `/repos/${ORCHESTRATION_REPO_FULL_NAME}/pulls/${number}`);
      if (pr.status === 404) {
        errors.push(`PR #${number}: not found on GitHub`);
        continue;
      }
      if (pr.status !== 200) {
        errors.push(`PR #${number}: GitHub returned HTTP ${pr.status}`);
        continue;
      }
      const headSha: string | undefined = pr.json?.head?.sha;
      const checks = headSha
        ? await ghGet(token, `/repos/${ORCHESTRATION_REPO_FULL_NAME}/commits/${headSha}/check-runs?per_page=50`)
        : { status: 0, json: null };
      const ciState = checks.status === 200 ? ciFromCheckRuns(checks.json?.check_runs) : 'unknown';

      const { error: upsertErr } = await supabase.from('orchestration_prs').upsert(
        {
          number,
          module_key: moduleKey,
          title: typeof pr.json?.title === 'string' ? pr.json.title : null,
          // GitHub's own state enum ('clean' | 'dirty' | 'unstable' | 'blocked' |
          // 'behind' | 'draft' | 'unknown') — stored verbatim, not remapped.
          mergeable: typeof pr.json?.mergeable_state === 'string' ? pr.json.mergeable_state : 'unknown',
          ci_state: ciState,
          ci_checked_at: new Date().toISOString(),
          is_draft: !!pr.json?.draft,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'number' },
      );
      if (upsertErr) {
        errors.push(`PR #${number}: DB write failed — ${upsertErr.message}`);
        continue;
      }
      updated += 1;
    } catch (err) {
      errors.push(`PR #${number}: ${err instanceof Error ? err.message : 'unexpected error'}`);
    }
  }

  if (updated === 0 && errors.length > 0) {
    return markFailed(`Could not refresh any of ${trackedNumbers.length} tracked PR(s) for "${moduleKey}".`, {
      checked: trackedNumbers.length,
      errors,
    });
  }

  return markDone({
    checked: trackedNumbers.length,
    updated,
    errors: errors.length > 0 ? errors : undefined,
    elapsed_ms: Date.now() - startedAt,
  });
}
