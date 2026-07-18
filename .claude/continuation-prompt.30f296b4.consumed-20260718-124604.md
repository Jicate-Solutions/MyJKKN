# CONTINUATION BRIEF — Self-Improving Bug-Fix Loop (spec-first, 3 increments)
_probe_verdict: healthy · generated 2026-07-18 (cnext). Where this brief and progress.txt disagree, progress.txt wins._

## TASK
Design-then-build the full self-improving bug-fix loop on the **Groups tab of `/admin/bug-reports`**, extending the LIVE cluster-fixability feature and the BUILT (unmerged) cluster-autofix feature. Director P0 = "1, 2 and 3" = build the **whole** loop, **SPEC FIRST**, then all three increments in order. The loop: **Analyze** (find single-fix clusters) → **Fix** (AI writes fix → DRAFT PR) → 🚦_human merge+deploy_ → **#1 Verify group** (fan-out the already-live `bug.reverify` recipe across the fixed cluster's members after deploy; show a likely_fixed / still_broken / inconclusive tally; recommendation-only) → **#2 Reporter feedback** (THE KEYSTONE + ground truth: a gated in-app 👍/👎 "is this fixed for you?" to each reporter; collect + store replies — a HUMAN approves the send because it is outbound messaging to real learners) → 🚦_human resolve → #2136 duplicate-cascade + emails N_ → **#3 Learn** (an outcome ledger recording `{root-cause category, files touched, fix pattern, verify verdict, reporter-confirmed y/n}` per fix, then RETRIEVE matching past outcomes as context into the NEXT analyze/fix). Step 1 of the work is to **WRITE A SHORT SPEC of the whole loop with the moat-vs-echo checkpoints marked, get Director review, THEN build #1 → #2 → #3.** Human-gated model (Director chose it): AI proposes, human approves the 2 irreversible steps.

## PROJECT / DB / SPEC
- **PROJECT:** `/Users/omm/PROJECTS/MyJKKN`
- **DATABASE:** Supabase prod ref `kvizhngldtiuufknvehv`. Creds via env files ONLY: `/Users/omm/PROJECTS/MyJKKN/.env.production.local` (real service-role key; values carry a literal `\n` — strip before curl). Mgmt API token: `/Users/omm/.supabase/access-token` (`curl https://api.supabase.com/v1/projects/<ref>/database/query` — the `supa_query` pattern). **Show-SQL-first before applying.** Every new SECDEF RPC needs explicit `REVOKE EXECUTE ... FROM anon, PUBLIC`.
- **SPEC to write:** `docs/features/2026-07-18-FEATURE-cluster-selfimproving-loop.md` (sibling to the fixability spec). Follow `docs/DOCUMENTATION_INDEX.md`; author it inside a jicate/main worktree (it ships as an app-side PR). Note: writing the spec will TRIP the terminology gate — keep code paths in backticks, reword prose student→learner / faculty→Senior Learners / staff→team members.

## CURRENT STATE (verified this session — re-verify before trusting)
- **Fixability v1 SHIPPED + LIVE:** PR **#2160 MERGED + DEPLOYED**, card eyeballed on prod. `bug_clusters.metadata.fixability`; 3 anon-locked RPCs (request/claim/complete); `fn_bug_cluster_list` surfaces fixability. Mac runner `bug-cluster-fixability.mjs` + launchd `ai.jkkn.maxlane.fixability` (LOADED). ~4 clusters have `done` verdicts (82273574 = 33-member split; 84edad35; fb6eacfe = single_fix).
- **Autofix BUILT, NOT merged:** PR **#2163** (feature) + PR **#2162** (the AI's demo fix — real StaffService self-filter bug) — **both OPEN, both non-draft, mergeable=UNKNOWN (GitHub still computing, not a blocker)**, awaiting Director merge. Migration `20260718140000` (3 anon-locked fix RPCs on `metadata.fixability.fix`) **APPLIED LIVE** (not on main until #2163 merges — deploy ships code not migrations). Mac WRITE runner `bug-cluster-fix.mjs` (runs **Step 2.7 Build Depth Gate**: static gates delta + scoped-tsc + terminology-delta + one repair round) + launchd `ai.jkkn.maxlane.clusterfix` (LOADED).
- **`bug.reverify` (Tier 2, #2153) is MERGED + LIVE** — the increment #1 recipe to reuse. Recipe `interactive=false` (batch drain runs it). `reporter_user_id` on ~99.8% of open bugs. Impersonation via `lib/auth/impersonate.ts` (60s JWT); `SUPABASE_JWT_SECRET` IS set in Vercel prod. `is_super_admin` gate-widening (#2157) + first data-presence probe learner-in-scope (#2158) also MERGED + LIVE.
- **#2136 duplicate-cascade** (resolve canonical → cascade + reporter emails) is LIVE — this is the "resolve group" human gate that fires emails.
- ⚠️ Route gate on ai-reverify / ai-triage is hardcoded `role IN (super_admin|administrator|ceo)` and `is_super_admin` does NOT bypass it there (only the module admin gates were widened by #2157). If a new Verify/feedback route reuses that gate, widen it too.

## VERIFY CURRENT STATE (read-only — run BEFORE any work)
0. **MANDATORY production-code sweep** per CLAUDE.md (include output in the SAME response as your plan):
   `git ls-tree jicate/main -r --name-only | grep -iE "(reverify|reporter.*feedback|outcome.*ledger|self.*improv|verify.*group|fixability|cluster.*fix)"`
   `gh pr list --repo Jicate-Solutions/MyJKKN --state all --limit 30 --search "feedback OR verify OR reverify in:title"`
1. `gh pr view 2163 --json state,mergeable,isDraft` and same for `2162` — confirm still OPEN. **If Director merged them, adjust — do NOT re-merge.**
2. `git -C /Users/omm/PROJECTS/MyJKKN fetch jicate main`
3. Confirm the `bug.reverify` recipe row + `app/api/bug-reports/[id]/ai-reverify/route.ts` are still live.
4. **If reality differs from this brief → STOP, report, do NOT execute a stale plan.**

## WHAT NEEDS TO HAPPEN (sequential)
0. **MANDATORY prod-code sweep FIRST** (output in same response as the plan).
1. **Write the loop spec** — `docs/features/2026-07-18-FEATURE-cluster-selfimproving-loop.md`, moat-vs-echo checkpoints marked at each stage. Get Director review before building.
2. **Build #1 Verify group** — reuse the live `bug.reverify`; new route/action + per-member tally UI on the Groups tab (likely_fixed / still_broken / inconclusive). Recommendation-ONLY — never auto-resolves.
3. **Build #2 Reporter feedback** (KEYSTONE) — a gated in-app 👍/👎 "is this fixed for you?" delivered to each reporter after a fix deploys; collect + store replies. **A HUMAN approves the send** (outbound messaging to real learners — see rule below). Delivery must be at-least-once (render-then-client-ack; do NOT stamp-on-read — that loses answers).
4. **Build #3 Learn** — outcome ledger `{root-cause category, files touched, fix pattern, verify verdict, reporter-confirmed y/n}` per fix, then RETRIEVE matching past outcomes as context into the NEXT analyze/fix. **Prove with a moat-loop 2-cycle test** that the next fix changes BECAUSE a measured reporter-confirmed prior outcome, not because the AI conditioned on a pile of its own unverified text.
5. **Ship app-side via worktree PRs off jicate/main**; runners/launchd stay Mac-local. Prove each increment ₹0.

## MOAT-VS-ECHO (the spine of the whole task)
The loop is a **real self-improving moat ONLY if the next fix demonstrably changes BECAUSE a prior outcome was MEASURED against a baseline.** **Reporter feedback (#2) is the ground truth** that prevents the loop learning from its own unverified verdicts — that would be an echo / confirmation-bias-at-scale failure ("the AI grading its own homework"). If #3's "learning" is just text the AI conditions on, it is **theater**. Build the MEASUREMENT (reporter-confirmed outcome), not the vibe. Strongly consider running the **`/moat-loop` skill's 2-cycle live simulation** to verify #3 before declaring it done.

## CONSTRAINTS & RULES
- **MANDATORY prod-code sweep before ANY build plan** (CLAUDE.md — caught 5× in one session). Plan without sweep = plan is invalid.
- **Ship ONLY via worktrees off `jicate/main`** — local `omm-dev` is 720+ commits diverged; git merge/push/cherry-pick to prod is impossible. Author files IN the worktree. Pattern: `git fetch jicate main && git checkout -B <branch> jicate/main` as Step 0; verify `pwd` is this repo before any worktree-agent spawn (worktree origin is CWD-determined, not prompt-determined).
- **NEVER auto-merge any MyJKKN PR** (permanent multi-tenant rule). **Deploy ONLY via `/deploy-myjkkn` after a fresh explicit Director "deploy".**
- **The 2 IRREVERSIBLE STEPS STAY HUMAN:** (a) merging AI code to live jkkn.ai; (b) resolving-a-group (which emails N learners). Sending the reporter-feedback 👍/👎 messages is ALSO a human-approved send (outbound to real learners). Never let any AI verdict/verify auto-resolve a cluster or auto-email reporters.
- **New SECDEF RPCs:** explicit `REVOKE EXECUTE FROM anon, PUBLIC`. The anon-lock CI gate scans the migration DIFF — a `CREATE OR REPLACE` of an existing SECDEF fn ALSO needs the REVOKE line (no-op re-assert).
- **JKKN terminology gate = delta + zero-tolerance + blocking** (student→learner, faculty→Senior Learners, staff→team members). Flags PROSE incl. in spec docs; EXEMPTS backtick-wrapped code paths. The AI-fixer trips it just by TOUCHING a legacy-term line (even a log string it didn't author).
- **CI SKIPS TypeCheck / terminology / reachability / visual-proof on DRAFT PRs** (`if: !draft`) → they report `skipping`, NOT `pass`. An AI-fixer opening draft PRs has NO reliable CI signal → **rely on the runner's local Step 2.7 gate.** Marking a draft ready does NOT retro-trigger already-`skipped` checks; to force them, push a new commit while non-draft (or open non-draft). For a scoped PR, `mergeable:MERGEABLE + CLEAN + 0 failures` IS the healthy state — "16 green checks" is the wrong mental model.
- **Local full `tsc` OOMs** (SIGABRT 134 = vacuous green) → scoped tsconfig (`include: [next-env.d.ts, types/**/*.ts, ...changedFiles]`, ~3s).
- **Auto-save hook makes `wip` commits in worktrees** → `git reset --soft` before push; scrub `.claude/` + continuation-prompt files. **force-push is blocked by the guard-git-push hook** → add a 2nd commit + fast-forward instead.
- **Live DB fn defs DRIFT from repo migration files** — `pg_get_functiondef` before integrating any RPC.
- **Migrations don't deploy with code** — apply prod migrations yourself (Mgmt token) with show-SQL-first.

## KEY DECISIONS MADE THIS SESSION (with rationale)
- (a) **Human-gated loop** chosen by Director (AI proposes; human approves the 2 irreversible steps) over full autonomy.
- (b) **Reporter feedback is the keystone / ground truth** — Claude flagged that without it the "learning" is the AI grading its own homework.
- (c) **Fix runner must self-run Step 2.7** (incl. terminology) because CI skips those gates on drafts — Director caught this gap.
- (d) **scoped-tsconfig tsc (~3s) replaces the OOMing full tsc.**
- (e) probe_verdict: healthy — the fresh session can trust progress.txt + memory.

## KEY FILES TO READ FIRST
- **Specs (jicate/main):** `docs/features/2026-07-18-FEATURE-cluster-fixability.md` and `docs/features/2026-07-18-FEATURE-bug-reverify-tiers.md`. ⚠️ **The autofix spec `2026-07-18-FEATURE-cluster-autofix.md` is NOT on jicate/main yet — it's on the unmerged PR #2163 branch** (`gh pr diff 2163` or check out the branch to read it).
- **Groups tab UI:** `app/(routes)/admin/bug-reports/_components/bug-groups-tab.tsx` (Groups tab + FixabilityPanel/FixSection — extend here).
- **The reverify pattern to reuse for Verify-group:** `app/api/bug-reports/[id]/ai-reverify/route.ts` + `lib/bug-reports/reverify/evidence.ts` + `app/(routes)/admin/bug-reports/_components/ai-reverify-card.tsx`.
- **Impersonation:** `lib/auth/impersonate.ts` (60s JWT).
- **Mac runners (NOT in repo):** `/Users/omm/jkkn-max-lane/bug-cluster-fix.mjs` (write runner + Step 2.7 gate) and `bug-cluster-fixability.mjs` (read-only runner) — the drainer pattern any new async agentic stage should copy (self-claiming, keyed on the cluster row's `metadata`; NOT the poller — no payload col; NOT the Windows batch drain — it can't read code).
- **Memory:** `project_bug_cluster_fixability.md` (full arc incl. the "NEXT VISION" loop section), `project_bug_reverify_tier2.md`, `feedback_ci_skips_gates_on_draft_prs_ai_fixer_must_self_gate.md`.

## DO NOT
Auto-merge any MyJKKN PR. Deploy without a fresh explicit Director "deploy". Let any AI verdict/verify auto-resolve a cluster or auto-email reporters (human gate). Build #3's "learning" as unmeasured text (echo). Skip the prod-code sweep before the plan. Push `omm-dev` to main. Trust repo migration files for live fn signatures.

## VERIFY BY (post-execution)
A written loop spec with moat checkpoints marked; Verify-group produces a real per-member tally reusing `bug.reverify` (₹0); reporter-feedback sends only after a human approves + stores replies (at-least-once delivery); the outcome ledger records **measured** outcomes AND a 2-cycle test shows the next fix changed **because of** a measured reporter-confirmed prior outcome; app-side worktree PRs open + CI green; nothing auto-resolved; no reporter emails fired without a human gate.

---
_probe_verdict: **healthy.** Run **VERIFY CURRENT STATE** (read-only) before executing — if reality has drifted from this brief, STOP and report rather than run a stale plan._
