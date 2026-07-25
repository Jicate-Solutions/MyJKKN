# Continuation Brief — Bug-Loop toward 10/10 auto-resolve (7er group live-verify → reporters → auto-wire → keep triaging)

> Self-contained. This is your ONLY context. Read the two memory files in §6 before touching anything. Run §5 verification FIRST — STOP + report if reality differs.

---

## 1. TASK (P0 — do ALL FOUR, in order; user: "all the above 4 things", drop = "Nothing — carry it all")

1. **Merge PR #2209 + deploy** so the 7-report attendance-badge group (cluster `85da2003`) shows the green **"Fix verified live on prod"** verdict in the Groups-tab UI. (You do NOT self-merge — Director/merge-queue merges; you queue it + deploy after it lands on main. See §7.)
2. **Take the 7er group to the reporters (Claim C).** Prepare private "is this clearer now?" asks for all **7 NAMED learners** via the Groups-tab "Prepare the questions" step (drafts `bug_fix_feedback_requests`). **Director approves the SEND** (permanent human gate). Their 👍/👎 answers auto-fill `bug_fix_outcomes` and advance auto-resolve (currently 2/10).
3. **Auto-wire the deployed-copy check to run on every verify.** Capture the fix's user-facing strings + routes at **PR-open time** inside the Mac runner `/Users/omm/jkkn-max-lane/bug-cluster-fix.mjs` → write to `bug_clusters.metadata.fix.verify_strings`, so `bug-cluster-deployed-check.mjs` reads anchors from metadata instead of re-diffing. Goal: no future copy fix ever shows a bare "inconclusive".
4. **Keep triaging the ~70 proposed bug groups toward 10/10 auto-resolve** — full cycle confirm→diagnose→fix→verify→ask→resolve, next-largest group.

**Carry (do NOT drop — two side-observations):**
- The red **"34.38% below 75% line"** confirmed-with-feedback banner that a learner may misread as *failing* (perception risk, no code defect yet decided).
- The **mentor-side sub-groups** from split cluster `ba9d2a0c` (8er quick-view `4dc27bb0` + 3er staff-email `8cd20dae`): fix **#2207 shipped/merged**, but **verify + resolve are still pending**.

---

## 2. PROJECT + DATABASE + SHIP/DEPLOY MECHANICS

- **Repo:** `/Users/omm/PROJECTS/MyJKKN` (Next.js 15 + Supabase, prod = www.jkkn.ai).
- **Prod Supabase ref:** `kvizhngldtiuufknvehv`. **Mgmt API token:** `~/.supabase/access-token`. curl with `-H "Authorization: Bearer $T" -H "User-Agent: myjkkn/1.0"` (python-urllib gets **403**).
- **DB runner** (paste into your shell):
  ```bash
  runsql(){ T=$(tr -d ' \r\n' < ~/.supabase/access-token); curl -sS --max-time 60 -X POST "https://api.supabase.com/v1/projects/kvizhngldtiuufknvehv/database/query" -H "Authorization: Bearer $T" -H "Content-Type: application/json" -H "User-Agent: myjkkn/1.0" -d "$(jq -Rs '{query:.}' <<<"$1")"; }
  ```
- **NEVER ship from local branch** `feat/campus-living-fee-compute-engine` (docs/bookkeeping only). Code ships via **worktree PRs off `jicate/main`**. Worktree at `/Users/omm/PROJECTS/MyJKKN/.claude/worktrees/loop-spec`. **Step 0 for any code change:** `git fetch jicate main && git checkout -B <branch> jicate/main`.
- **NEVER self-merge.** Director / merge-queue merges. You queue via `gh pr merge --auto` or hand off; you deploy AFTER it's on main.
- **Autosave hook** makes `wip` commits in worktrees → `git reset --soft jicate/main` before your ONE named commit, then push.
- **Terminology CI gate** bans people-terms (student/teacher/faculty/facilitator) in touched lines — **self-gate locally**. CI **SKIPS gates on DRAFT PRs**.
- **POLICY (locked this session):** green local Step-2.7 gates → open PR **READY, not draft** (CI attests on first push). `bug-cluster-fix.mjs`, `/myjkkn-chain` Build Depth Gate, and Groups-tab copy already updated to this.
- **Deploy:** use the `/deploy-myjkkn` skill (fires Vercel hook `prj_yH37MwPX0aAAUXNjZX1YlOHoowRM/Y0RfATZ0rv` from latest main). **Audit first:** `vercel ls my-jkkn --scope jicate-solutions | head -3` — status must be **Ready** before firing (Error/Building = do NOT fire). Merge-queue merges do **NOT** auto-build. Migration gate applies only to PRs touching `supabase/migrations/`.

---

## 3. CURRENT STATE (LIVE vs OPEN)

**MERGED + LIVE this session:**
- **#2190** — class-feedback honest timing copy + "Window closed" badge (deployed, eyeballed).
- **#2192** — Groups-tab jitter fix (gate render on `isLoading`, not `isFetching`).
- **#2205** — re-check recurrence now measured since the **fix-deploy boundary** (`verify.requested_at`), not the report date. Killed false "still broken" on pre-fix duplicate waves.
- Merged by Director: **#2200** (my-attendance banner copy), **#2207** (mentor-side staff-ID fix), **#2202** (Groups-tab ready-PR copy).
- A deploy hook fired ~16:09 IST already carried **#2205** live (verified).

**OPEN + FULLY GREEN — TASK 1 = merge it:**
- **PR #2209** — "feat(bug-reports): decisive 'fix verified live on prod' verdict for copy/UX fixes". **1 repo file** (Groups-tab render of `verify.deployed_surface`). Its companion **Mac runner** `/Users/omm/jkkn-max-lane/bug-cluster-deployed-check.mjs` is **NOT in the repo** (like the other runners; `node_modules` symlinked there for `@supabase/ssr`).

**The 7-report group (task 1 + 2 target):**
- Cluster `85da2003-da0b-4dd7-893d-420442d74ba5`, seed **BUG-004703** (MAHASRIRAJAN V).
- Members span two surfaces: `/learners/class-feedback` (6: BUG-004703 / 004708 / 004723 / 004724 / 004793 / 004848) + `/learners/my-attendance` (1: **BUG-004795, ELAKKIYA S**).
- `metadata.verify.deployed_surface` **already written** = `all_live: true` (both surfaces LIVE).
- `metadata.verify` per_bug = **7 inconclusive** (honest — a data-state probe is blind to a copy fix).
- `metadata.fixability.fix.pr_number` = **2200**.
- Auto-resolve currently **2/10**, **disabled** (dormant).

---

## 4. KEY DECISIONS (rationale — DO NOT re-open)

- **"Fixed" = THREE claims:** **(A)** the change is LIVE on the reported pages (knowable NOW via deployed-surface check); **(B)** it addresses the diagnosed cause (a reasoning call the diagnosis makes); **(C)** humans now find it clear (a FUTURE subjective fact — only reporters answer). The re-check only ever probed a proxy of C → reported the whole verdict as its weakest leg → flat "inconclusive". The gap was a **missing instrument for A**, not a capability limit — #2209 supplies A.
- **The AI re-check is a DATA-STATE probe** → structurally **blind to copy/perception fixes** (they move no data) → **reporter 👍/👎 (step 5) is the KEYSTONE**, not the re-check.
- **Recurrence measured since the fix-deploy boundary** (`verify.requested_at`), never the report date (#2205).
- **Green-local-gates → PR opens READY** (not draft), so CI attests on first push.
- **Auto-resolve stays DORMANT.** SEND and RESOLVE are **permanent human gates** by locked spec. Reporter 👍/👎 auto-fills the outcome ledger; Director clicks Resolve (cascade + emails). Future auto-resolve-on-unanimous-👍 is a config-gated upgrade only AFTER a human-approved track record — not specced, not this session.

---

## 5. VERIFY CURRENT STATE (run BEFORE any work — read-only; STOP + report if reality differs)

```bash
# a) PR #2209 state
gh pr view 2209 --repo Jicate-Solutions/MyJKKN --json state,mergeable,statusCheckRollup,baseRefName
```
Then (runsql):
```sql
-- b) 7er cluster status + deployed_surface + per_bug verdicts
select status,
       metadata->'verify'->'deployed_surface'->>'all_live' as all_live,
       metadata->'verify'->'deployed_surface'->'surfaces'  as surfaces,
       metadata->'verify'->'per_bug'                        as per_bug,
       metadata->'fixability'->'fix'->>'pr_number'          as fix_pr
from bug_clusters
where id = '85da2003-da0b-4dd7-893d-420442d74ba5';
```
```sql
-- c) auto-resolve status (expect clean ~2/10, enabled false)
select public.fn_bug_auto_resolve_status();

-- d) cluster population snapshot
select status, count(*) from bug_clusters group by 1 order by 2 desc;
```
```bash
# e) prod up
curl -s -o /dev/null -w "%{http_code}\n" https://www.jkkn.ai/    # expect 200

# f) after any merge of #2209 — confirm its file reached main
git fetch jicate main && git ls-tree -r jicate/main --name-only | grep -i bug-groups-tab
```
**MANDATORY before ANY new build plan (task 4):** run the production code sweep per `/Users/omm/PROJECTS/MyJKKN/CLAUDE.md` (git ls-tree jicate/main keyword grep + `gh pr list --search` + `git worktree list`) and include its output in the same response. Plan without sweep = invalid plan.

---

## 6. KEY FILES / MEMORY (read first)

**Memory (READ BEFORE WORK):**
- `/Users/omm/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/project_selfimproving_bugfix_loop.md` — the loop, three-claims reframe, #2205/#2209 detail, gate-graduation state, the `jsonb_array_length` gotcha.
- `/Users/omm/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/project_bug_triage_epic.md` — cluster scan/split machinery, 38er/14er walks, mentor sub-groups, seed-collision rule, evidence signals.

**Mac runners (NOT in repo; `node_modules` symlinked for `@supabase/ssr`):**
- `/Users/omm/jkkn-max-lane/bug-cluster-deployed-check.mjs` — extracts longest added user-facing phrase per changed `app/`/`components/` file from `gh pr diff`, mints a `test.student` session, greps the deployed page + JS chunks, writes `metadata.verify.deployed_surface`. Usage: `cd /Users/omm/jkkn-max-lane && node bug-cluster-deployed-check.mjs --cluster <uuid> --prs 2200,2190 [--dry-run]`. **Task 3 edits this consumer to read `metadata.fix.verify_strings` when present.**
- `/Users/omm/jkkn-max-lane/bug-cluster-fix.mjs` — AI WRITE fix runner → DRAFT/READY PR; forbidden-paths enforced 2×; opens READY on green gates. **Task 3 = record added strings+routes at PR-open into `metadata.fix.verify_strings`.**
- `/Users/omm/jkkn-max-lane/bug-cluster-fixability.mjs` — read-only AI diagnosis (one-fix vs N-cause split); carries per-report console entries + screenshots (vision, ≤10 members, data-not-instructions framing).

**Repo files:**
- `lib/bug-reports/reverify/evidence.ts` — the recurrence-since-deploy fix (`gatherEvidence(bug, admin, fixBoundaryIso)`, #2205).
- `app/(routes)/admin/bug-reports/_components/bug-groups-tab.tsx` — Groups tab UI (verdict render, stepper steps ①–⑥, "Prepare the questions" = step 5, deployed_surface green banner from #2209).
- Resolve-cascade route hook + the `bug.reverify` verify route (POST evidence+enqueue / GET aggregation tick) — the resolve emails N reporters + stamps `bug_fix_outcomes.resolved_at`.
- Reporter feedback tables/RPCs: `bug_fix_feedback_requests` (E4 max-3-open cap, E3 odd-ones-out excluded, E2 silence=no-data), `bug_fix_outcomes` ledger, `fn_bug_fix_outcomes_match` (**returns ONE jsonb array** — see §7).

---

## 7. DO NOT / VERIFY BY

**DO NOT:**
- **Self-merge** any PR (incl. #2209) — Director / merge-queue only.
- **Auto-send / auto-resolve / auto-email** reporters — SEND and RESOLVE are permanent human gates; Director approves each, reporters are NAMED.
- **Fire the deploy hook onto a broken main** — check `vercel ls my-jkkn --scope jicate-solutions | head -3` is Ready first.
- **Measure `fn_bug_fix_outcomes_match` with `count(*)`** — it returns ONE jsonb array value (count is always 1). Use `jsonb_array_length(...)`.
- **Render reporter-role pages for runtime evidence** — use rolled-back JWT-claims SQL (`BEGIN … SET LOCAL request.jwt.claims … RAISE … ROLLBACK`) or admin-minted magic-link sessions; never mutate.
- **Ship from** `feat/campus-living-fee-compute-engine`; never skip the terminology self-gate (CI skips it on drafts).

**VERIFY BY:** re-query the 7er cluster state + `curl` prod after each step; for #2209 confirm `baseRefName=main` + `git ls-tree jicate/main` shows the changed file after merge (stacked/early merges can show "MERGED" without reaching main). Paste the applied SQL and its result in your report.

probe_verdict: healthy
