// app/api/whats-new/refresh/route.ts
//
// POST /api/whats-new/refresh — the super admin's "check for new changes"
// button on /whats-new.
//
// WHAT IT ACTUALLY DOES, and why that matters for what we tell the reader: the
// running server has no git repository, so it cannot read the history the
// changelog is built from. Only the GitHub Actions job can. So this route does
// not refresh anything itself — it asks GitHub to run
// .github/workflows/whats-new-refresh.yml (workflow_dispatch) and returns as
// soon as GitHub accepts the request. GitHub answers 204 the moment the run is
// QUEUED, before a single step has executed. Everything this route says is
// therefore "started", never "done"; the UI in
// components/changelog/whats-new-view.tsx repeats that distinction to the
// reader rather than claiming the page is now current.
//
// KNOWN LIMIT, verified 2026-09-06 rather than assumed: workflow_dispatch only
// works for a workflow file that exists on the DEFAULT branch.
// `git cat-file -e jicate/main:.github/workflows/whats-new-refresh.yml` fails —
// the workflow is on this feature branch, not yet on main. Until it merges,
// GitHub answers 404 here, which is why the 404 branch below says so in words
// instead of surfacing a bare status code.
//
// RBAC: super admin only, checked server-side against profiles — the same two
// fields every /api/admin/orchestration/* route checks (role === 'super_admin'
// OR is_super_admin). A caller who is not one gets a 403 that SAYS why. No
// silent redirect, no empty 200: a permission miss that renders nothing is the
// bug this team has been bitten by repeatedly (CLAUDE.md #27).
//
// Response shape is `{ ok, ... }` — the action-route idiom from
// app/api/admin/orchestration/*, not the bare `{ error }` of the sibling GET.
// This route is an action, and its only caller is the button.

import { NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const GITHUB_API = 'https://api.github.com';
const REPO_OWNER = 'Jicate-Solutions';
const REPO_NAME = 'MyJKKN';
const WORKFLOW_FILE = 'whats-new-refresh.yml';

/** workflow_dispatch resolves the workflow file on this branch — GitHub allows
 *  dispatch only from the default branch's copy of the file. */
const WORKFLOW_REF = 'main';

/** The dispatch call itself is a single POST that GitHub answers immediately;
 *  anything slower than this is a network problem, not a long job. */
const DISPATCH_TIMEOUT_MS = 15_000;

/** GitHub's error bodies are useful to a super admin, but they are also
 *  untrusted upstream text. Passed through trimmed and length-capped. */
function shortDetail(body: string): string {
  try {
    const parsed = JSON.parse(body) as { message?: unknown };
    if (typeof parsed.message === 'string') return parsed.message.slice(0, 300);
  } catch {
    // not JSON — fall through
  }
  return body.trim().slice(0, 300);
}

export async function POST() {
  await connection();

  // 1) Signed in?
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: 'You are signed out, so nothing was started. Sign in and try again.' },
      { status: 401 }
    );
  }

  // 2) Super admin?
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  const isSuper = profile?.role === 'super_admin' || profile?.is_super_admin === true;
  if (!isSuper) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Only a super admin can refresh What’s New. Your account does not have that role, ' +
          'so nothing was started. The page you are reading is unaffected.',
      },
      { status: 403 }
    );
  }

  // 3) Can this server reach GitHub at all?
  const token = process.env.ORCH_GITHUB_TOKEN;
  if (!token) {
    // Not a 500: the request was valid and the caller was allowed. The server
    // simply has no credential for this, and retrying changes nothing until
    // ORCH_GITHUB_TOKEN is set on the deployment.
    return NextResponse.json(
      {
        ok: false,
        error:
          'This server is not set up to refresh What’s New — the GitHub credential ' +
          '(ORCH_GITHUB_TOKEN) is missing from this deployment. Nothing was started. ' +
          'This needs a deployment setting changed, not another click.',
      },
      { status: 503 }
    );
  }

  // 4) Ask GitHub to run the job.
  const url = `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${WORKFLOW_FILE}/dispatches`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: WORKFLOW_REF }),
      cache: 'no-store',
      signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'network error';
    return NextResponse.json(
      {
        ok: false,
        error: `Could not reach GitHub to start the update (${message}). Nothing was started.`,
      },
      { status: 502 }
    );
  }

  // 204 No Content is GitHub's success answer for a dispatch. It means QUEUED.
  if (res.status === 204) {
    console.warn(
      `[whats-new/refresh] super admin ${user.id} dispatched ${WORKFLOW_FILE} on ${WORKFLOW_REF}`
    );
    return NextResponse.json({
      ok: true,
      status: 'started',
      workflow: WORKFLOW_FILE,
      ref: WORKFLOW_REF,
      message:
        'Update started. It usually takes a minute or two — the newest changes appear ' +
        'once it finishes, not straight away.',
    });
  }

  const detail = shortDetail(await res.text().catch(() => ''));

  // Everything below is a REFUSAL by GitHub. Each one gets its own sentence,
  // because "502" tells a super admin nothing about what to do next.
  let error: string;
  if (res.status === 404) {
    error =
      `GitHub has no ${WORKFLOW_FILE} on the ${WORKFLOW_REF} branch yet, so there is nothing to run. ` +
      'This is expected until the pull request carrying that workflow is merged. ' +
      '(GitHub also answers 404 when the credential cannot see the repository at all.)';
  } else if (res.status === 401 || res.status === 403) {
    error =
      'GitHub rejected this server’s credential. It needs permission to run workflows ' +
      `(actions: write) on ${REPO_OWNER}/${REPO_NAME}. Nothing was started.`;
  } else if (res.status === 422) {
    error =
      `GitHub would not start the job on the ${WORKFLOW_REF} branch. ` +
      'Most often the workflow exists but has no manual trigger (workflow_dispatch) on that branch.';
  } else {
    error = `GitHub refused to start the update (HTTP ${res.status}). Nothing was started.`;
  }

  return NextResponse.json(
    { ok: false, error, githubStatus: res.status, githubMessage: detail || undefined },
    { status: 502 }
  );
}
