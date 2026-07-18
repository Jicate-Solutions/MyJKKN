# Bug Cluster Fixability — v1 Spec

**Status:** built 2026-07-18 · **Surface:** Groups tab of `/admin/bug-reports`
**Sibling:** `2026-07-18-FEATURE-bug-reverify-tiers.md` (per-bug re-verification)

## Problem

The Groups tab already clusters similar open bug reports (nightly `fn_bug_cluster_scan`, ~67 groups over ~1,000 open bugs). Confirming a group parks every member under the canonical bug, so resolving that one bug cascades a resolve to all members and emails every reporter (the #2136 duplicate machinery).

That cascade is only correct **if the members really do share one root cause**. A large text-clustered group routinely mixes several unrelated problems that merely *sound* alike ("not working", "can't submit"). An admin looking at 33 reports has no cheap way to know: is this one bug reported 33 times, or several bugs the text-similarity scan happened to bundle?

Fixability answers exactly that, grounded in the actual code — **before** anyone confirms the group.

## The non-negotiable safety rule

The fixability verdict is a **recommendation only**. It **never** resolves a cluster and **never** emails reporters. A false "one fix fixes all" would wrongly tell N learners their unrelated bug is fixed. A human always decides; the resolve-cascade + reporter emails stay owned entirely by the existing duplicate machinery, triggered by a human clicking Resolve.

## The core trap: false-consolidation

The failure mode to guard against is **claiming one shared root cause when there are several**. Two defenses:

1. **Schema** — the verdict carries `subgroups[]`, so the runner can (and must, when warranted) split a cluster into distinct root causes rather than being forced into a single answer. A server-side clamp also forces `single_fix_feasible = false` whenever the model itself returned more than one subgroup.
2. **Prompt** — the analysis prompt is adversarial about it: different modules/pages almost always mean different causes; `single_fix_feasible` may be true **only** if the model read the code and verified one change resolves all members; when unsure, split. Under-consolidating is safe, over-consolidating is harmful.

## Architecture — a self-claiming drainer keyed on the cluster row

Fixability needs to read the **actual production code paths** the member bugs describe. That rules out the Windows batch drain (`ai_jobs`/`ai_job_types`) used by per-bug re-verify and AI-triage — that drain is a text-in/text-out recipe executor with no repo checkout and no `claude` binary. Fixability must run on the **Mac Max-lane**, which has the MyJKKN repo + the `claude` CLI (the same place the overnight bug-fix runner lives).

`max_lane_requests` (the "⚡ Run on Max" button relay) has no payload column to carry a `cluster_id`, so instead of the poller path we use a **drainer keyed on the cluster row itself**:

```
Groups tab button
  → POST /api/bug-reports/clusters/[id]/fixability
  → fn_bug_cluster_fixability_request(id)         [sets metadata.fixability.status='requested']

Mac launchd lane (ai.jkkn.maxlane.fixability, every 2 min)
  → fn_bug_cluster_fixability_claim(runner)        [oldest requested; FOR UPDATE SKIP LOCKED;
                                                     stale-'running' reclaim — self-healing]
  → git worktree add --detach off jicate/main
  → claude -p  (Read/Glob/Grep ONLY — no Bash/Write/Edit)  → reads real code → JSON verdict
  → fn_bug_cluster_fixability_complete(id, 'done', verdict)   [writes metadata.fixability.verdict]
  → git worktree remove --force   (nothing committed, nothing pushed)

Groups tab  → polls fn_bug_cluster_list every 8s while any cluster is requested/running
            → renders the verdict card (one-fix vs N subgroups)
```

The `cluster_id` **is** the row the runner claims, so no parameter passing is needed. This mirrors the proven `ai_jobs` / `max_lane` claim-complete-stale-recovery pattern and touches **zero shared infra** — no `poller.mjs` edit, no `max_lane_requests` change.

Because the Mac agentic run takes minutes, the trigger is **async + poll**, not a long-poll route (which would exceed Vercel's `maxDuration`).

## The verdict

```jsonc
{
  "shared_root_cause": boolean,
  "root_cause": "the one shared cause (if shared), else ''",
  "files": ["real file paths for the shared fix"],
  "single_fix_feasible": boolean,     // clamped false if subgroups.length > 1
  "confidence": "low" | "medium" | "high",
  "subgroups": [
    { "root_cause": "distinct cause", "bug_ids": ["BUG-…"], "files": ["…"] }
  ],
  "summary": "1–3 plain sentences",
  "model": "sonnet"
}
```

Stored at `bug_clusters.metadata.fixability.verdict`. `metadata` is a new general-purpose JSONB bucket (mirrors `bug_reports.metadata.{ai_triage,ai_reverify}`), leaving room for future cluster-level AI artifacts.

## The runner (READ-ONLY)

`/Users/omm/jkkn-max-lane/bug-cluster-fixability.mjs` (Mac-local, like the rest of the Max-lane fleet — not in the repo). Read-only is enforced three ways:

- `--allowedTools Read Glob Grep` (no write tools offered);
- `--disallowedTools Bash Write Edit MultiEdit NotebookEdit WebFetch WebSearch` (hard policy block, holds even under `--dangerously-skip-permissions`);
- the checkout is a **detached** throwaway worktree, force-removed after — nothing can be committed or pushed regardless.

Cost is ₹0 (Claude Max subscription); each run writes one `ai_model_usage` row (`feature_key='bug.fixability'`, `provider='claude_code'`, `cost_inr=0`).

## RPCs (migration `20260718120000_bug_cluster_fixability.sql`)

| Function | Caller | Grant |
|---|---|---|
| `fn_bug_cluster_fixability_request(uuid)` | Groups-tab route (service role, after `requireBugAdmin`) | `authenticated, service_role`; anon revoked; admin-gated inside |
| `fn_bug_cluster_fixability_claim(text,int)` | Mac runner | `service_role` only; anon+authenticated revoked |
| `fn_bug_cluster_fixability_complete(uuid,text,jsonb,text)` | Mac runner | `service_role` only; anon+authenticated revoked |

`fn_bug_cluster_list` is extended to return `metadata.fixability` so the card renders from the existing list fetch.

## Non-goals / deferred

- **v2 — re-grouping ALL open bugs by shared codebase root cause** (not just within existing text-clusters). Much larger compute + design problem; deferred.
- No auto-fix, no auto-PR. Fixability only *analyzes*. The payoff loop is: verdict says "one fix in file X resolves all N" → a human (or the overnight bug-fix runner) fixes once → confirming the group + resolving the canonical cascades to all N + emails each reporter.
