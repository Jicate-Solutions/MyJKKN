import 'server-only';

// lib/services/solutions/repo-activity-service.ts
// Live GitHub activity for repos linked to a solution — Capability 2 of the
// Solutions Hub ↔ intern-repo integration.
// Spec: specs/solutions-hub-intern-repo-integration-spec-2026-07-11.md
//
// DESIGN (locked Director decisions):
//   - #6  Nothing is stored — live fetch only, so the card can never show stale
//         data as fresh. GitHub down → per-repo error the UI renders honestly.
//   - #9  Every open PR carries waiting_days (reviewer-side delay made visible).
//   - #10 intern_ready is DERIVED from a live branch-protection check, never a
//         stored flag — the badge cannot drift from reality.
//   - #5  A deleted/renamed repo surfaces as repo_missing so the UI can say
//         "fix or unlink" instead of hiding the problem.
//
// Token: fine-grained read-only PAT in GITHUB_SOLUTIONS_HUB_TOKEN (server env,
// never NEXT_PUBLIC). Needs: Contents+Pull requests+Checks read on org repos,
// Administration read for the protection check. Absent token → configured:false
// and the UI shows a setup hint instead of pretending.

const GITHUB_API = 'https://api.github.com';
const MAX_PRS_DETAILED = 10; // per repo, keeps the call fan-out bounded

export type CiState = 'pass' | 'fail' | 'pending' | 'none';

export interface RepoOpenPr {
  number: number;
  title: string;
  author: string;
  url: string;
  created_at: string;
  waiting_days: number;
  draft: boolean;
  ci: CiState;
  preview_url: string | null;
}

export interface RepoActivity {
  repo_full_name: string;
  /** true/false from the live protection check; null when the token can't read protection */
  intern_ready: boolean | null;
  /** repo 404s on GitHub — deleted or renamed (decision 5: show, don't hide) */
  repo_missing: boolean;
  /** transport/API failure for this repo — UI shows "can't reach GitHub" (decision 6) */
  error: boolean;
  open_prs: RepoOpenPr[];
  last_shipped: { number: number; title: string; url: string; merged_at: string } | null;
}

export interface SolutionRepoActivityResult {
  configured: boolean;
  repos: RepoActivity[];
}

function ghHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function gh(token: string, path: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    headers: ghHeaders(token),
    // Live data by design (decision 6) — client-side React Query provides the 60s cache.
    cache: 'no-store',
  });
  const json = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, json };
}

function ciFromCheckRuns(runs: any[]): CiState {
  if (!runs || runs.length === 0) return 'none';
  if (runs.some((r) => r.status !== 'completed')) return 'pending';
  if (runs.some((r) => ['failure', 'timed_out', 'cancelled'].includes(r.conclusion))) return 'fail';
  return 'pass';
}

function findPreviewUrl(comments: any[]): string | null {
  for (const c of comments ?? []) {
    const isBot = typeof c?.user?.login === 'string' && c.user.login.endsWith('[bot]');
    if (!isBot || typeof c?.body !== 'string') continue;
    const m = c.body.match(/https:\/\/[a-z0-9][a-z0-9.-]*\.vercel\.app[^\s)\]]*/i);
    if (m) return m[0];
  }
  return null;
}

async function fetchRepoActivity(token: string, repoFullName: string): Promise<RepoActivity> {
  const base: RepoActivity = {
    repo_full_name: repoFullName,
    intern_ready: null,
    repo_missing: false,
    error: false,
    open_prs: [],
    last_shipped: null,
  };

  try {
    const repo = await gh(token, `/repos/${repoFullName}`);
    if (repo.status === 404) return { ...base, repo_missing: true };
    if (repo.status !== 200) return { ...base, error: true };
    const defaultBranch: string = repo.json.default_branch;

    const [protection, openPrs, closedPrs] = await Promise.all([
      gh(token, `/repos/${repoFullName}/branches/${encodeURIComponent(defaultBranch)}/protection`),
      gh(token, `/repos/${repoFullName}/pulls?state=open&per_page=${MAX_PRS_DETAILED}`),
      gh(token, `/repos/${repoFullName}/pulls?state=closed&sort=updated&direction=desc&per_page=15`),
    ]);

    // Decision 10: intern-ready = protection exists AND ≥1 human approval required.
    if (protection.status === 200) {
      const approvals = protection.json?.required_pull_request_reviews?.required_approving_review_count ?? 0;
      base.intern_ready = approvals >= 1;
    } else if (protection.status === 404) {
      base.intern_ready = false; // no protection at all
    } // 403 → token lacks admin-read → stays null ("unknown"), never a false badge

    if (Array.isArray(closedPrs.json)) {
      const shipped = closedPrs.json.find((p: any) => p.merged_at);
      if (shipped) {
        base.last_shipped = {
          number: shipped.number,
          title: shipped.title,
          url: shipped.html_url,
          merged_at: shipped.merged_at,
        };
      }
    }

    if (Array.isArray(openPrs.json)) {
      const now = Date.now();
      base.open_prs = await Promise.all(
        openPrs.json.map(async (p: any): Promise<RepoOpenPr> => {
          const [checks, comments] = await Promise.all([
            gh(token, `/repos/${repoFullName}/commits/${p.head.sha}/check-runs?per_page=50`),
            gh(token, `/repos/${repoFullName}/issues/${p.number}/comments?per_page=30`),
          ]);
          return {
            number: p.number,
            title: p.title,
            author: p.user?.login ?? 'unknown',
            url: p.html_url,
            created_at: p.created_at,
            waiting_days: Math.max(0, Math.floor((now - new Date(p.created_at).getTime()) / 86_400_000)),
            draft: !!p.draft,
            ci: checks.status === 200 ? ciFromCheckRuns(checks.json?.check_runs) : 'none',
            preview_url: comments.status === 200 ? findPreviewUrl(comments.json) : null,
          };
        })
      );
    }

    return base;
  } catch {
    // Network-level failure — decision 6: report, never fabricate.
    return { ...base, error: true };
  }
}

export async function getSolutionRepoActivity(repoFullNames: string[]): Promise<SolutionRepoActivityResult> {
  const token = process.env.GITHUB_SOLUTIONS_HUB_TOKEN;
  if (!token) return { configured: false, repos: [] };

  const repos = await Promise.all(repoFullNames.map((r) => fetchRepoActivity(token, r)));
  return { configured: true, repos };
}
