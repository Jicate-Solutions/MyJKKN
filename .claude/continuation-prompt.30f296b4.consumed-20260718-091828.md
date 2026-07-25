TASK: Build cluster-fixability v1 — a per-cluster, codebase-grounded fixability analysis on the Groups tab of /admin/bug-reports. The flow: a Groups-tab action "Analyze fixability (AI Max, ₹0)" triggers a Mac-side worktree runner (reuse the /Users/omm/overnight/v2/overnight-v2.sh Phase-B pattern: `git worktree add` off jicate/main + `claude -p` agentic with the MyJKKN repo as cwd and Bash/Read/Glob/Grep tools) — but READ-ONLY: analysis only, NO edits, NO commit, NO PR. The runner reads the actual code paths the cluster's member bugs describe (module_name/sub_module_name/page_url on each bug row) and returns a structured verdict: `{shared_root_cause: bool, root_cause: string, files: string[], single_fix_feasible: bool, confidence: low|medium|high, subgroups: [{root_cause, bug_ids[], files[]}]}`. Persist to `bug_clusters.metadata.fixability`; render a result card on the Groups tab (one-fix-fixes-all vs N distinct-root-cause subgroups). RECOMMENDATION-ONLY — the verdict NEVER auto-resolves a cluster and NEVER emails reporters (a false-consolidation would wrongly email N learners). The payoff loop: verdict says "one fix in file X resolves all N" → a human (or overnight-bugfix) fixes once → the already-live #2136 duplicate-cascade resolves all N children + emails each reporter. Prove on a REAL cluster: the ~27/32-member "practical attendance" cluster or the 20-member feedback cluster e715fc79 (BUG-004660, already Director-confirmed). v2 (re-grouping ALL open bugs by shared codebase root cause, not just within text-clusters) is explicitly DEFERRED.

PROJECT: /Users/omm/PROJECTS/MyJKKN
DATABASE: Supabase prod ref kvizhngldtiuufknvehv. Creds via env files only: /Users/omm/PROJECTS/MyJKKN/.env.production.local (real service-role key; values carry a literal \n suffix — strip before curl). Mgmt API token: /Users/omm/.supabase/access-token (used by overnight-v2.sh `supa_query`). Supabase MCP has full read+write on this prod ref (show-SQL-first). SUPABASE_JWT_SECRET is now in Vercel prod (added last session) — impersonation/reachability live; not needed for fixability (read-only code analysis, no reporter impersonation).
SPEC: No spec yet for fixability — WRITE ONE (sibling to /Users/omm/PROJECTS/MyJKKN/docs/features/2026-07-18-FEATURE-bug-reverify-tiers.md, which covers Tier 2/3 reverify). Follow docs/DOCUMENTATION_INDEX.md + naming `2026-07-18-FEATURE-cluster-fixability.md`.
PROGRESS: /Users/omm/PROJECTS/MyJKKN/progress.txt (top block = this session's history; the "Next Session — Tasks" list has P0 verbatim).

CURRENT STATE:
- Two green PRs from last session AWAIT Director merge (do not touch/merge): #2157 (is_super_admin gate-widening across all 8 bug-reports gates) + #2158 (first v1.1 data-presence probe `learner-in-scope`). Both CI-green, proven E2E (BUG-005009 flipped inconclusive/low → likely_fixed/medium).
- #2153 (Tier 2 Bug Re-verify) MERGED + DEPLOYED + LIVE. bug.reverify recipe live.
- Groups tab (#2140) LIVE. `bug_clusters` table + `fn_bug_cluster_scan` / `fn_bug_cluster_list` live (66 groups over 1,036 open bugs at last scan). #2136 duplicate-cascade (dup_of + resolve-cascade + reporter emails) MERGED + LIVE.
- The Max lane runs `claude` agentic on the codebase via the overnight-v2.sh worktree pattern — this is the exact mechanism to clone for fixability, minus all write/push/PR steps.
- Local branch feat/campus-living-fee-compute-engine is DOCS-ONLY; ALL code ships via worktree PRs off jicate/main.

VERIFY CURRENT STATE (read-only, run BEFORE any work):
1. `gh pr view 2157 --repo Jicate-Solutions/MyJKKN --json state,mergeable` and same for 2158 — confirm still OPEN/mergeable (if already merged by Director, adjust; do NOT re-merge).
2. Confirm clusters exist: Mgmt API count query via overnight-v2.sh `supa_query` pattern — `SELECT count(*), max(jsonb_typeof(metadata)) FROM bug_clusters;` (confirm rows + metadata is jsonb).
3. Confirm the runner substrate: `test -f /Users/omm/overnight/v2/overnight-v2.sh` and re-read its Phase-B worktree+claude block.
4. `git -C /Users/omm/PROJECTS/MyJKKN fetch jicate main`.
If reality differs from this brief → STOP, report to the user, do NOT execute a stale plan.

WHAT NEEDS TO HAPPEN (sequential):
0. MANDATORY production-code sweep FIRST (CLAUDE.md NON-NEGOTIABLE): `git ls-tree jicate/main -r --name-only | grep -iE "(fixability|bug_cluster|rootcause|root_cause|cluster.*fix)"` + `gh pr list --repo Jicate-Solutions/MyJKKN --state all --limit 30 --search "fixability OR cluster in:title"`. Include the sweep output in the same response as the build plan. Plan without sweep = invalid.
1. Write the short fixability spec doc (see SPEC).
2. Build the Mac-side READ-ONLY fixability runner: a shell script (clone overnight-v2.sh Phase-B) that pulls a cluster's member bugs (bug ids + module + page_url + description) from prod, `git worktree add` off jicate/main, runs `claude -p` agentic (Bash/Read/Glob/Grep, NO Write/Edit) with a prompt that reads the real code paths and emits the JSON verdict as its last line. NO commit, NO push, NO PR. Tear down the worktree after.
3. Wire the trigger + persistence. Investigate: new `ai_job_type` recipe (batch-drain path) vs a `max_lane_requests` routine (Mac poller path). The overnight-bugfix uses the Mac poller/routine path, so likely reuse that (the runner needs the repo + `claude` binary on the Mac, which only the poller side has). Any new recipe = interactive=false. Persist verdict to `bug_clusters.metadata.fixability`.
4. Groups-tab "Analyze fixability" action + result card (renders one-fix-vs-N-subgroups) in app/(routes)/admin/bug-reports.
5. Prove on a real cluster: verdict cites REAL files/functions, correctly returns single-fix OR subgroups, ledger row provider=claude_code cost_inr=0.
6. Ship the app-side pieces (route/UI) via a worktree PR off jicate/main. Do NOT auto-merge. Do NOT deploy without Director go.

CONSTRAINTS & RULES:
- MANDATORY production-code sweep before ANY build plan (CLAUDE.md, caught 5× in one session).
- Ship ONLY via worktrees off jicate/main (never push omm-dev to main; local is 720+ commits diverged).
- NEVER auto-merge any MyJKKN PR (permanent multi-tenant-risk rule).
- Deploy ONLY via /deploy-myjkkn AFTER explicit Director approval.
- New recipes: interactive=false (interactive=true is chat-drain-only-and-refused — see the feedback memory). Any new SECURITY DEFINER RPC needs explicit `REVOKE EXECUTE FROM anon, PUBLIC`.
- JKKN terminology gate is CI-blocking + zero-tolerance: student→learner, faculty→Senior Learners, staff→team members. Sweep verdict text + UI copy.
- Local full `tsc` OOMs (8G/16G, >10min) — use PR-scoped tsc + rely on CI TypeCheck.
- Auto-save hook makes `wip` commits in worktrees → `git reset --soft` before push; scrub `.claude/` + continuation-prompt files from any branch.
- Worktree `origin` is a DIFFERENT repo — push to the `jicate` remote explicitly.
- Live DB fn defs DRIFT from repo migration files — `pg_get_functiondef` before integrating (e.g. live `fn_ai_claim` has 3 params, repo file is stale).
- RECOMMENDATION-ONLY discipline is the spine: the fixability verdict must NEVER trigger a resolve/cascade/email. Human-in-the-loop only.

KEY FILES TO READ FIRST:
- /Users/omm/overnight/v2/overnight-v2.sh (Phase-B worktree+claude agentic pattern — the exact mechanism to clone READ-ONLY; note `supa_query`, `run_gates`, the worktree add/teardown, the FORBIDDEN paths, the ledger).
- /Users/omm/PROJECTS/MyJKKN/app/(routes)/admin/bug-reports (Groups tab + cluster components + existing AiBriefingCard/AiReverifyCard for the card pattern to mirror).
- /Users/omm/PROJECTS/MyJKKN/supabase/migrations/20260717150000_bug_clusters_scan_loop.sql (bug_clusters schema + fn_bug_cluster_scan/list — but pg_get_functiondef the LIVE defs before trusting).
- /Users/omm/PROJECTS/MyJKKN/lib/bug-reports/reverify/evidence.ts + route app/api/bug-reports/[id]/ai-reverify (the recent enqueue→poll→persist-metadata pattern to mirror for the fixability persistence).
- Memory: /Users/omm/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/project_bug_reverify_tier2.md + project_bug_triage_epic.md + feedback_interactive_job_type_only_served_by_chat_drain.md.

KEY DECISIONS MADE LAST SESSION (with rationale):
- interactive=false for all bug recipes — interactive=true is chat-drain-only-and-refused (any non-chat interactive recipe fails 100%).
- Added SUPABASE_JWT_SECRET to Vercel prod rather than rewriting impersonation to service-role — the project uses legacy HS256 and the secret was simply misconfigured (a different JWT_SECRET existed and fails Supabase sig).
- Widened ALL 8 bug-reports gates (#2157), not just the 2 AI routes — the narrow 3-role gate is a duplicated pattern; a partial fix leaves the same 403 elsewhere.
- learner-in-scope probe first (#2158) — BUG-005009 had a clean deterministic read + the data was actually fixed, making it a provable earned-likely_fixed.
- Fixability: READ-ONLY analysis runner (no auto-fix/PR) for v1; re-grouping-all-bugs deferred to v2 — per-cluster analysis is tractable + provable, re-grouping-all is a much bigger compute+design problem.
- Session probe_verdict: healthy (long session, state tracked carefully in memory + progress.txt throughout).

APPROACH: sequential — sweep → spec → build read-only runner → wire trigger+persistence → Groups-tab UI → prove on a real cluster → worktree PR. Investigate ai_job_type recipe (drain) vs max_lane_requests routine (poller) early; the overnight-bugfix uses the poller/routine path and needs the repo+claude binary on the Mac, so that's the likely reuse.

QUALITY BAR: On a real cluster, the fixability run produces a structured verdict grounded in ACTUAL code reads (cites real files/functions that exist in jicate/main), correctly says one-fix-fixes-all OR splits into subgroups with distinct root causes, at ₹0 (ledger claude_code cost_inr=0). The verdict renders on the Groups tab. NEVER auto-resolves. The failure mode to guard against is FALSE-CONSOLIDATION (claiming one fix when there are multiple causes) — the runner must be willing to, and demonstrably able to, return subgroups.

DO NOT: auto-merge any MyJKKN PR. Deploy without a fresh explicit Director "deploy". Let the fixability verdict auto-resolve a cluster or email reporters. Push omm-dev to main. Skip the production-code sweep before the build plan. Trust repo migration files for live fn signatures (pg_get_functiondef first).

VERIFY BY (post-execution): a real cluster's `bug_clusters.metadata.fixability` populated with a code-grounded verdict (cites real files); a ledger row provider=claude_code cost_inr=0 for the run; the Groups-tab card renders it; worktree PR open + CI green; nothing auto-resolved, no reporter emails fired.
