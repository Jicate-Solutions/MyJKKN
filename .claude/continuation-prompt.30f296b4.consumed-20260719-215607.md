TASK: The Director chose BOTH priorities, verbatim: (1) "Work groups toward 10/10: triage the 70 proposed groups through the pipeline (confirm → diagnose → fix → verify → ask → human-resolve); each clean human-approved resolution advances auto-resolve activation (now 2/10). Start with the 38-report attendance group." AND (2) "Crack the 14-report group: the class-feedback group where static code reading found nothing — pursue the runtime evidence (its logs show 'Number of periods found: 0')." Explicit drop instruction: "Nothing — carry it all" — so P1 (activation migration at 10/10) and P2 (analyze-side retrieval v1.1 incl. coarser category key for DB-path fixes, feedback queue-release cron for the 3-cap, re-merge-on-new-evidence proposal) trail behind the two priorities.

PROJECT: /Users/omm/PROJECTS/MyJKKN
DATABASE: Supabase prod ref kvizhngldtiuufknvehv; env at /Users/omm/PROJECTS/MyJKKN/.env.production.local (values may carry a literal \n suffix — strip; never echo secrets); Mgmt API via `curl -H "Authorization: Bearer $(cat /Users/omm/.supabase/access-token)"` (python-urllib gets 403)
SPEC: `git show jicate/main:docs/features/2026-07-19-FEATURE-cluster-evidence-signals.md` (D1-D6 evidence signals, S1-S6 split, R1-R4 auto-resolve — all locked; do NOT re-open) and `git show jicate/main:docs/features/2026-07-18-FEATURE-cluster-selfimproving-loop.md` (the loop itself)
PROGRESS: /Users/omm/PROJECTS/MyJKKN/progress.txt

CURRENT STATE (as of brief-write time):
- Loop GRADUATED: loop_registry 'bug-triage' all 4 gates on, loop_class=self_improving (migration 20260718220000). Both walk clusters resolved with unanimous reporter 👍; outcome ledger = 2 clean positive rows.
- Grouping LIVE twice-upgraded: two-tier trigram attach (#2176, 20260719003000) + error-fingerprint group-forming (#2177, 20260719020000). ~70-71 proposed groups, 299+ reports grouped, largest = the 38-member attendance group.
- Diagnosis runner (Mac-local /Users/omm/jkkn-max-lane/bug-cluster-fixability.mjs — NOT in repo) now injects captured console logs (5/report, error>warn>log, data-not-instructions framing) + screenshots for clusters ≤10 (vision). Proven on "Details are mismatched".
- SPLIT shipped+walked (#2180, 20260719040000, fn_bug_cluster_split): 22-member "Not to submit feedback" → 3 sub-groups: 14-member class-feedback (BUG-004739, cluster 9f9f0919-182e-452a-8977-ad8c26ddcfad), 2-member nudge-banner (BUG-004736, cluster 3ae62a71-30c5-46fe-8bbb-468f18f60a89, parent repurposed), 6-member widget-misfiled (BUG-004749, cluster 2cd50c57-8d2f-43b5-9f07-ca41d5158b8a). Amber "Split into N groups" button on stepper step ② for multi-cause verdicts.
- AUTO-RESOLVE shipped DORMANT (#2182, 20260719050000, deploy 74wk8oma8): R1 trigger / R2 earn-gate (2/10; enabling = human migration) / R3 circuit breaker / R4 bell. Groups tab shows "Auto-resolve off — earned 2/10". Nightly bug-cluster-scan cron (02:49 IST) carries the dormant pass. resolve-cascade extracted to lib/bug-reports/resolve-cascade.ts — the ONE resolve path.
- Repo-root branch feat/campus-living-fee-compute-engine is docs-only; all code shipped via worktree branches off jicate/main, all merged.

VERIFY CURRENT STATE (run BEFORE any work — read-only; state may have drifted):
1. `curl -s -X POST "https://api.supabase.com/v1/projects/kvizhngldtiuufknvehv/database/query" -H "Authorization: Bearer $(cat /Users/omm/.supabase/access-token)" -H "Content-Type: application/json" -d '{"query":"select public.fn_bug_auto_resolve_status();"}'` → expect armed=false, clean count 2/10.
2. Same endpoint: `select status, count(*) from bug_clusters group by 1;` (expect ~70 proposed) and the 14-member class-feedback cluster row for id 9f9f0919-182e-452a-8977-ad8c26ddcfad (member_count 14, confirmed).
3. `gh pr list --repo Jicate-Solutions/MyJKKN --state open --limit 15` — expect no open loop PRs (all merged).
4. `git -C /Users/omm/PROJECTS/MyJKKN fetch jicate main && git -C /Users/omm/PROJECTS/MyJKKN log jicate/main --oneline | head -5`; prod up: `curl -s -o /dev/null -w "%{http_code}" https://www.jkkn.ai/` → 200.
If reality differs from this brief → STOP, report, do NOT execute the stale plan.

WHAT NEEDS TO HAPPEN:
1. [P0 — priority 1] Work the 70 proposed groups toward 10/10, starting with the 38-member attendance group. The working loop PER GROUP: Confirm (admin click via API as minted test.superadmin — parks members as status='duplicate' under seed canonical, NO emails) → Diagnose (queue "What's causing this?" fixability job → Mac runner drains ₹0) → if one-fix verdict: AI fix draft PR → Director merges → /deploy-myjkkn on Director word → Verify group (fan-out bug.reverify per member) → Prepare+Send 👍/👎 asks (Director approves send with reporters NAMED) → reporter answers auto-fill the outcome ledger → Director resolves (cascade + emails via resolve-cascade). If multi-cause verdict: amber Split button (sub-groups born confirmed, each restarts at step ①). Batch independent groups' diagnose jobs; human gates stay sequential per group.
2. [P0 — priority 2] The 14-member class-feedback group (cluster 9f9f0919-182e-452a-8977-ad8c26ddcfad, BUG-004739): static code reading found NO defect. Pursue runtime evidence — captured logs show "Number of periods found: 0" ×64 and "Role faculty not found, using empty permissions". Likely next move: reproduce with a real reporter's data via rolled-back impersonated probes (jwt-claims in BEGIN..RAISE..ROLLBACK) of the feedback pending path — find why period lookup returns 0 for those learners (timetable rows? role permission short-circuit? date filter?). Never render reporter views.
3. [P1] When clean track hits 10/10: PROPOSE the activation migration (flip bug_reports.auto_resolve.enabled) — Director approves + merges; do not apply unasked.
4. [P2] Analyze-side retrieval v1.1 (coarser category key — migration-filename categories never match future clusters); feedback queue-release cron for the 3-open-cap; re-merge-on-new-evidence proposal feature (S4 note).

CONSTRAINTS & RULES:
- NEVER auto-merge. Deploys only on a fresh Director word via /deploy-myjkkn (audit `vercel ls` head first; merge-queue merges do NOT auto-build; a hold on a merged PR is void at the next deploy of anything).
- Migrations: show SQL first → BEGIN..RAISE rolled-back validation on prod → apply via Mgmt API curl → update supabase/SQL_FILE_INDEX.md. Every SECDEF fn: `REVOKE EXECUTE ... FROM anon, PUBLIC; GRANT ... TO authenticated;` (service_role-only for admin/runner fns).
- Send + Resolve are PERMANENT human gates (locked spec). Nothing auto-emails, auto-confirms, auto-resolves (auto-resolve stays dormant).
- Ship only via worktrees off jicate/main (use /Users/omm/PROJECTS/MyJKKN/.claude/worktrees/loop-spec; Step 0: `git fetch jicate main && git checkout -B <branch> jicate/main`). Push to the `jicate` remote.
- Auto-save hook makes wip commits — `git reset --soft jicate/main` before the ONE named commit AND verify current branch first (a commit last session landed on a stale branch).
- Scoped tsc only (full tsc OOMs = vacuous green); pre-existing error in types/academic/timetable-queries.ts is main-side — ignore. Terminology gate is delta+blocking and flags "children" — write "sub-groups". CI SKIPS all gates on DRAFT PRs — self-gate locally. Stacked PRs merge into their BASE branch — verify baseRefName=main + `git ls-tree jicate/main` content after every merge.
- Persona mint = generateLink→verifyOtp as test.superadmin@jkkn.ac.in; pages never reach networkidle2 (react-query polling) — use domcontentloaded + fixed waits; filter buttons are lowercase text CSS-capitalized.
- Confirmed-cluster members carry status='duplicate' — any "open members" query must include it. Interactive=true job types are only served by the chat drain — loop job types stay interactive=false. Live DB fn defs drift from repo files — pg_get_functiondef before extending any fn.

KEY FILES TO READ FIRST:
- /Users/omm/jkkn-max-lane/bug-cluster-fixability.mjs — the diagnosis runner (evidence injection, claim paths, lock handling); sibling bug-cluster-fix.mjs is the write runner.
- `git show jicate/main:lib/bug-reports/resolve-cascade.ts` — the ONE resolve path (emails/cascade/ledger) both human and dormant auto-resolve use.
- `git show jicate/main:docs/features/2026-07-19-FEATURE-cluster-evidence-signals.md` — D/S/R locked decisions.
- /Users/omm/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/project_selfimproving_bugfix_loop.md — full loop mechanics + gotchas.
- /Users/omm/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/project_bug_triage_epic.md — cluster scan/split/auto-resolve history.

KEY DECISIONS MADE THIS SESSION (with rationale):
- Fingerprints FORM groups (D3, simulation-decided: 14 pairs → 7 new groups, zero blobs; recruit-only caught almost nothing — fp-paired reports sit nowhere near text-formed groups).
- Tier-2 recruits-never-chains: lowering the EDGE threshold was simulation-proven a regression (generic phrasing chains into 66-/155-member blobs the 40-cap discards).
- Split sub-groups born CONFIRMED (click = decision) and splits are FINAL (S4); parent row REPURPOSED in place on seed collision (oldest report IS old canonical — audit=split_siblings).
- Auto-resolve built DORMANT with a ledger-measured earn-gate (10 clean human-approved resolutions); flipping enabled stays a human migration even at 10/10. Circuit breaker: first still-broken answer on an auto-resolved group suspends the feature everywhere.
- probe_verdict: healthy.

APPROACH: Sequential per-group triage through the human gates; batch independent groups' diagnose/verify jobs in parallel (₹0 Max lane). Every Director-facing click gets a plain-English AskUserQuestion with blast radius stated (who gets emailed, what gets parked, what deploys). Wait states (Director merges, reporter answers, cron runs) = Monitor/background watches, not polling.

QUALITY BAR: Each resolution is reporter-confirmed through the full loop — never rubber-stamped. The clean-track count advances ONLY via human-approved resolutions whose ledger rows are positive with zero late still-broken. For the class-feedback group: a named root cause reproduced against real data (or an honest "environmental/no-defect" verdict with evidence), not a plausible guess.

DO NOT:
- Flip bug_reports.auto_resolve.enabled (needs 10/10 + a Director-approved migration).
- Auto-merge, email, or resolve without an explicit Director word in THIS session.
- Trust gh's MERGED state without checking baseRefName=main + content on jicate/main.
- Use count(*) over fn_bug_fix_outcomes_match — it returns ONE jsonb array; measure with jsonb_array_length.
- Render reporter-role pages or mint reporter sessions — runtime evidence comes from jwt-claims rolled-back SQL probes only.
- Re-open any D1-D6 / S1-S6 / R1-R4 locked decision.

VERIFY BY (post-execution):
1. `fn_bug_auto_resolve_status()` shows the clean count advanced (N/10 > 2) and armed=false still.
2. Every group resolved this session has a bug_fix_outcomes row with reporter_confirmed='positive' and resolved_at stamped; reporters received resolution emails via the cascade.
3. Groups-tab gate strip eyeballed live reflecting the new count; confirmed/resolved filters match DB counts.
4. Class-feedback group: diagnosis verdict updated in bug_clusters.metadata.fixability citing the runtime evidence; if a fix shipped, it followed the full merge→deploy→verify→ask chain.
