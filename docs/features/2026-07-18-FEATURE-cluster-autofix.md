# Bug Cluster Auto-Fix — "Fix this group" → reviewed PR

**Status:** built 2026-07-18 · **Surface:** Groups tab of `/admin/bug-reports`
**Sequel to:** `2026-07-18-FEATURE-cluster-fixability.md`

## Problem

Fixability tells an admin *whether* one fix resolves a whole cluster and *where* the root cause is. The natural next step is to actually make that fix. But letting AI change production code is a different risk class from letting it read — a wrong change hits every institution, and resolving the group emails N learners a (possibly false) all-clear.

## The loop, and where humans stay in it

```
[Analyze ✓] → "Fix this group"
   → AI writes the fix in a worktree, runs the Build Depth Gate, opens a DRAFT PR  ← AI, ₹0
   →  🚦 human reviews + merges + deploys                                       ← gate 1
   → "Verify group": re-check each report as its reporter (bug.reverify)       ← AI, ₹0  (fast-follow, reuses #2153)
   →  🚦 human clicks "Resolve group" → cascade + emails all N reporters        ← gate 2 (#2136, already live)
```

The two irreversible steps — **merging AI code to live jkkn.ai** and **resolving a group (which emails N reporters)** — always stay human. The AI only ever opens a reviewable PR and gives verdicts.

## What ships in this PR

Only the **Fix → draft PR** half. The Verify half reuses the already-live `bug.reverify` and is a fast follow; Resolve already exists (#2136).

- **Gate on the trigger.** `fn_bug_cluster_fix_request` refuses unless the cluster has a completed fixability verdict with `single_fix_feasible=true` — you can only auto-fix a group the analysis confirmed one change resolves. (Multi-subgroup / dominant-subgroup fixing is deferred.)
- **Migration `20260718140000`** — three anon-locked SECDEF RPCs on `metadata.fixability.fix`: `_request` (admin), `_claim` + `_complete` (service-role). Same drainer pattern as fixability.
- **Route** — `POST /api/bug-reports/clusters/[id]/fix` (flags for the fix; async).
- **UI** — a green "Fix this group (AI Max, ₹0)" button on single-fix clusters, and fix-state rendering: preparing → **draft PR #N ready (link)** → or "needs a database change — a human must make this" / error. Poll while running.

## The write runner (Mac-local)

`/Users/omm/jkkn-max-lane/bug-cluster-fix.mjs` — mirrors the fixability runner but with write tools, and inherits the overnight bug-fixer's safety rails:

- **Seeded** by the fixability verdict (`root_cause` + `files`), so the fix agent starts with a strong, code-grounded prior.
- **Forbidden paths** (`auth`, `middleware`, `supabase/migrations`, `rls`, `policies`, `billing`, `payment`, `checkout`, `.env`, `vercel.json`, `CLAUDE.md`, `app/(routes)/admin`) — enforced **twice**: in the prompt, and by a hard post-diff check that **aborts the push** if any forbidden file changed.
- **DB-function root causes** (the 33-member cluster's cause was `fn_scf_submit_feedback` in a migration) can't be auto-edited — migrations are immutable + forbidden. The agent makes no change and reports `needs_migration` with the precise change a human must write. The human gate does real work here.
- **Build Depth Gate (Step 2.7 of `/myjkkn-chain`)** — before pushing, the runner runs, locally on the worktree: the three hard static gates (nav-config, radix-empty-value, permissions-catalog) **delta vs a clean-`main` baseline** (only NEW failures block); a PR-scoped `tsc` mirror (a generated scoped `tsconfig` over the changed files + `types/**`, to dodge the full-project OOM); and the **JKKN terminology delta gate** — uniquely important for an AI code-fixer, which trips it just by *touching* a line that already contains one of the legacy role words the standard remaps to learner-centered language, even without adding it. One **repair round** fixes any of the three. This is not optional: **CI *skips* the static gates, TypeCheck, terminology and reachability on draft PRs**, so the runner is the only pre-merge signal until a human marks the PR ready. A regression that survives the repair round tags the PR title `[GATES-RED]` and is called out in the body.
- **Draft PR only** — the runner shell owns push + `gh pr create --draft`; it has no merge path.
- ₹0 (Max subscription); one `ai_model_usage` row (`feature_key='bug.cluster_fix'`).

## Proof

Proven on cluster `fb6eacfe` (2 reports about a person's own record missing from a list they should appear in), whose verdict was `single_fix_feasible=true`: the runner applied the fix to `hooks/staff/use-staff.ts` (repointing the legacy client-side filter at the scope-aware `/api/staff` logic) and opened DRAFT PR **#2162** — no forbidden paths touched, nothing merged or resolved.

## Deferred

- **Verify group** (fan-out `bug.reverify` across members after deploy + tally) — fast follow, reuses the live recipe.
- **Multi-subgroup / dominant-subgroup fixing** (e.g. "fix the 32-share-cause subgroup") — the trigger currently requires a whole-cluster single fix.
- Auto-written migrations for DB-function root causes — intentionally left to humans.
