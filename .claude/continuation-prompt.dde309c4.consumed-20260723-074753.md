# CONTINUATION BRIEF — AI Pulse Prompt-Engineering Learning Loop

TASK (single start-here): **Get the loop deployed and go-live.** The Director ranked the next session 1→2→3: **(1) deploy + go-live**, then **(2) build the two remaining loop pieces**, then **(3) certify the moat**. Nothing dropped — carry it all.

PROJECT: /Users/omm/PROJECTS/MyJKKN (MyJKKN, jkkn.ai — multi-tenant; this omm-dev checkout is SHARED across panes/agents — do NOT `git add -A`, work in worktrees off jicate/main).

READ FIRST: `specs/ai-pulse-prompt-engineering-learning-loop-2026-07-22.md` (the full design + REVISION section) and memory `project_aipulse_prompt_engineering_learning_loop.md`. The whole loop was designed via a 23-decision interview + a moat-loop pressure-test; those two files hold the contract.

---

## VERIFY CURRENT STATE (read-only reality-check — run BEFORE acting)

```bash
# 1. Are the 3 open PRs merged yet? (agent CANNOT merge — human gate)
for n in 2290 2291 2292; do gh pr view $n --repo Jicate-Solutions/MyJKKN --json number,state,mergeable --jq '"#\(.number) \(.state) \(.mergeable)"'; done
# 2. Is #2281 (merged) deployed yet? (was in an ~8-commit undeployed queue)
gh api repos/Jicate-Solutions/MyJKKN/commits/main --jq '.sha[:7]'
vercel ls my-jkkn --scope jicate-solutions 2>&1 | head -3   # latest Production build status/age
# 3. Kill switches — the loop is DARK; confirm still off before any go-live:
#    (Supabase Management API, Bearer ~/.supabase/access-token, ref kvizhngldtiuufknvehv, non-default UA)
#    select config_key, value_jsonb from ai_pulse_policies where config_key in ('domain_starter_enabled','prompt_build_enabled');
#    domain_starter_enabled=true (live), prompt_build_enabled=false (the build-a-prompt UI is dark until YOU flip it)
```

Everything below is TRUE as of 2026-07-23 07:xx IST but VERIFY — other panes are active.

---

## WHAT NEEDS TO HAPPEN (ranked 1→2→3, then the backlog)

**① DEPLOY + GO-LIVE (Director's rank 1 — HUMAN-GATED, not auto-buildable).**
- If #2290/#2291/#2292 are MERGED → run `/deploy-myjkkn` (fires the Vercel hook from latest main; also ships the merged #2281 switcher fix + the queue). Then browser-verify the week-switcher only lists non-empty weeks.
- Then GO-LIVE the build-from-parts loop: flip `prompt_build_enabled=true` — **STAGED: one institution first** (Director's steer, given the 0.0017 baseline copy-rate). Browser-verify as a REAL learner via the persona harness: the "Build a prompt" card renders, submit lands a row in `ai_pulse_prompt_builds`, and the grade (4 checks + score + tips) returns within ~10 min (the `aipulse-prompt-grade` cron runs */10).
- If NOT merged → tell the Director plainly a developer must merge #2290/#2291/#2292 (agent physically cannot — pre-push guard + Translator-Pattern), then proceed to ② while waiting.

**② BUILD THE REMAINING LOOP PIECES (Director's rank 2 — THIS is what the auto-build can do).**
- **Auto-revert (decision #19):** a tuned prompt whose copy-rate dropped vs its prior should revert toward the better version next cycle. Extends the generation cron's `buildPrompt` hint (tell the model the last change LOWERED usage → go back toward the better prior) + a compare on `ai_pulse_domain_starters` copy-rate across cycles. Dark-buildable.
- **Learner-prompt graduation (decision #20):** the best learner builds (high usage + passed the AI checklist) graduate from `ai_pulse_prompt_builds` into the shared `ai_pulse_domain_starters` library — this is what makes the moat COMPOUND (staff+learner source). A promotion RPC + a cron/step. Dark-buildable.
- Both ship as new dark PRs (kill-switch-gated), same rigor: dry-run migrations, anon-lock all SECDEF, `interactive=false` for any Max-lane job type, `/ship-myjkkn`, Step 2.7 gates local.

**③ CERTIFY THE MOAT (Director's rank 3 — needs post-go-live data).**
- Once real learner builds + a second cycle exist, run the moat-loop 2-cycle simulation on the control cohort: assert measured copy-rate lift == known delta, confirm N+1 changes BECAUSE N's usage was measured, and the confound check `fn_ai_pulse_control_vs_tuned(cycle)` shows tuned > control. Only then is it a VERIFIED moat (not before — "verified by construction" ≠ verified).

**Backlog (carried, not ranked):** English-only cleanup — retire Tamil from the LIVE domain-starter prompts (Director said "ignore Tamil"). Separate track; touches live learner content → confirm scope before touching. (This session already made the NEW loop English-only; the live 13 prompts still carry Tamil.)

---

## KEY DECISIONS (rationale — so you don't relitigate)

- **The 4 PRs shipped this session (all migrations already applied to prod + verified; all SECDEF anon-locked, validated by running the secdef-anon-revoke CI gate locally):** #2281 MERGED (switcher hides empty weeks), #2290 OPEN (silent rotating control cohort), #2291 OPEN (grader dark substrate), #2292 OPEN (build-from-parts UI). Step 2.7 bespoke gates all PASS locally.
- **REUSE, not greenfield.** The prod sweep found the self-improving prompt loop was ALREADY a built dark substrate (#2185/#2195). Do NOT invent parallel tables/mechanisms — extend `ai_pulse_domain_starters` + the existing crons + the Max-lane job pattern.
- **dept_outcome_lift is NON-CAUSAL per prompt** (it's a DEPARTMENT aggregate every starter inherits). The moat signal is per-prompt **copy-rate** (`copies/learner_count`); the control cohort makes it a randomized A/B. This finding is WHY #2290 exists — don't revert to judging tuning by dept-lift.
- **All AI runs on the ₹0 Max lane, `interactive=false`** (interactive non-chat job types fail 100% on the runner). New AI steps = new `ai_pulse.*` job types on the same lane.
- **Dark-substrate-first is the house pattern** — everything ships behind a kill switch; go-live is a single reversible flip after eyeballing. Nothing is live to a learner yet.
- **Adoption is the binding constraint** — live copy-rate is 0.0017 (~1 in 600). The machinery is correct; whether learners USE it is the open bet. Hence the staged go-live.
- **probe_verdict: healthy** — context held all session (correctly tracked 4 PRs + the substrate discovery + all findings).
- **⚠️ Lesson (new memory `feedback_worktree_cleanup_exact_paths_not_grep`):** remove worktrees by EXACT paths, never a grep over `git worktree list` — this shared repo has 30+ sibling worktrees.

---

## EXECUTION DIRECTIVE (auto-build — armed by /cnext)

On `go`, after VERIFY CURRENT STATE passes, run an autonomous ultracode `/loop` build — but respect the ranking's reality:

- **Priority ① (deploy/go-live) is HUMAN-GATED — the auto-build must NOT attempt it** (it stops at a Draft PR and never merges/deploys/flips prod switches). If the 3 PRs aren't merged, surface that to the Director and do NOT block.
- **The auto-build's actual target is Priority ② (auto-revert + graduation)** — build each to a DRAFT PR via `/ship-myjkkn`, dark/kill-switch-gated, migrations dry-run-first + anon-locked, Step 2.7 gates local. STOP at the Draft PR. Never merge, never deploy (multi-tenant institutional risk).
- **Priority ③ (certify) needs post-go-live data — do NOT attempt until real builds exist.**
- Self-gate: if VERIFY shows main's latest Production build is Error, or the 3 PRs are un-merged AND ② has an unresolved dependency, report and wait rather than spin.
