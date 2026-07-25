# AI Pulse — Prompt & Context Engineering Learning Loop

- **Date:** 2026-07-22
- **Status:** DESIGN (locked via interview) — NOT built, NOT moat-certified
- **Author of decisions:** Director (23 decisions across a 6-round interview + a moat-loop pressure-test)
- **Builds on:** AI Pulse Domain Starter (live 2026-07-22, PRs #2260 + #2267) — `fn_ai_pulse_my_domain_starters`, `ai_pulse_domain_starters`, week-switcher.

---

## 1. What this is (one paragraph)

Turn the weekly AI Pulse "domain starter" from a *hand-out* (here's a ready prompt, go use it) into a **prompt & context-engineering learning loop**. Each week a learner **builds a prompt from parts** (role + context + task + output format), an AI **grades it against a checklist**, the learner's usage + edits **feed an AI that tunes next week's prompt wording**, and giving feedback **unlocks** a personalized "best prompt from learners like you" plus a streak. Learning-by-doing *is* the feedback signal; the feedback *is* the fuel that improves the shared prompt library.

## 2. The moat (what actually compounds)

Two loops are tangled in this feature. Only one is the moat:

- **Loop A — the prompt library gets better (THE MOAT).** Learner usage + edits refine a JKKN-owned prompt library. Years of thousands of learner signals produce a library a competitor starting fresh **cannot replay without JKKN's learner data.** It compounds and it stays. *This is the loop the design measures and the 2-cycle sim must certify.*
- **Loop B — each student gets better at prompt engineering.** A real, valuable *outcome* and the main **adoption** driver — but it's a personal skill that walks out with the graduate. Not an institutional asset. Keep it; don't mistake it for the moat.

> **Adoption caveat (deepest pressure-test finding):** a correct loop with zero cycles is a moat-building machine idling at zero. This loop's value is *entirely contingent on learners actually feeding it weekly* — AI Pulse's known bottleneck. The gate/streak mechanic is the bet to fix that; it is unproven until real cycles run.

## 3. Language

**English only.** Tamil is explicitly dropped from this feature (Director, 2026-07-22): no Tamil generation, tuning, or review. This removes the only sharp auto-publish risk (Tamil corruption invisible to non-readers). The earlier "hide the Tamil button" decision is therefore void — there is no Tamil surface.

## 4. How one weekly session works (learner's-eye view)

1. Learner opens **My AI Pulse**. Because they gave feedback last week, their **streak** ticks up and a **"best prompt from learners like you"** (top-used peer prompt in their subject) is unlocked and waiting.
2. This week's task: **build a prompt from parts** — pick a *role*, fill in *context* (their own goal/case/example — this is the context-engineering practice), state the *task*, choose an *output format*. **Hints sit beside every part** so a first-timer is never stuck (build from day one, with hints).
3. An **AI grades** the built prompt against a checklist (role? context? task? format?) and gives specific tips. Reuses the existing AI Pulse scoring engine (Agency / RCLTP) — new *rubric*, not new *engine*.
4. The learner's **usage** ("used it" = ran/copied into a real AI tool) + their edits are captured. This is the outcome signal.
5. Between cycles, an **autonomous weekly cron** tunes next week's prompt wording from the measured usage, **keeps the tuning only if measured usage went up**, and **auto-reverts** to the prior version if it went down.
6. If the learner's subject has no prompt this week, they still get the **general PE sandbox** to practice in. **Everyone sees both** (subject prompt + general sandbox). Until a new week's subject prompts are seeded, the **general prompt shows** so nobody sees a blank.

## 5. All 23 locked decisions

### Week-switcher & empty states
1. Past week with no prompts → **hidden** (switcher lists only weeks that have prompts).
2. ~~No Tamil text → hide Tamil button~~ → **VOID** (English-only; no Tamil).
3. Student whose subject isn't covered → gets the **general prompt** → evolved into the **PE sandbox**.
4. How far back to browse → **all weeks with content** (up to 12).

### The loop & the general prompt
5. General-prompt source → became a **self-improving feedback loop** (Director's reframe).
6. Who sees the general prompt → **everyone** sees both subject + general/sandbox.
7. New week not seeded yet → show **general prompt** until this week's subject prompts are ready.

### Prompt/context-engineering fusion
8. How to teach prompt engineering → **built into** the weekly prompt (the action is the lesson).
9. What the learner does → **build it from parts** (role + context + task + output format).
10. What feedback changes → **AI-tunes the actual wording** for next week.
11. Unlock rule → **partial unlock** (base prompt always shows; personalized best + streak unlock after last week's feedback — refines the "hard gate" idea without ever locking a student out).

### Buildability
12. First-timers → **build from day one, with hints**.
13. Grading a built prompt → **AI grades against a checklist** (reuse existing scoring).
14. Safety on AI-tuned prompts → **auto-publish, self-correct later** — now SOUND because: English-only (no corruption), auto-revert on worse usage, plus human reviews as backup. Residual: one-cycle exposure before a bad English rewrite reverts — acceptable.
15. The unlocked reward → **top prompt from learners like them**.

### Moat mechanics (from the pressure-test)
16. What counts as "good" → **students actually USED it** (action signal, harder to fake than a rating).
17. Prove it's not luck → **yes, a small silent control** (~10% of low prompts left un-tuned) to separate the tuning's effect from regression-to-the-mean.
18. How sure before acting → **at least 5 usage signals** (k-floor; no acting on noise).
19. If a rewrite scores worse → **auto-revert to the better version** (library only moves forward).

### Final edge cases
20. Where library prompts come from → **both: staff seed + learners grow it** (best learner-built prompts graduate in → the compounding moat).
21. Brand-new prompt with zero data → **show it widely for one cycle** to gather usage (exempt from k≥5 for its first week).
22. Fake "used it" clicks → **light auto-check, discard obvious fakes**, calibrated against normal behavior first (no punishment).
23. Control-group duration → **rotate every cycle** (a different small set is the control each week; no prompt held back long).

## 6. The 5-part loop map (moat-complete BY DESIGN)

| Part | Design provides | Status |
|---|---|---|
| 1. Input capture | learner-built prompts (parts + final) + "used it" usage events + AI grade | ✅ |
| 2. Signal detection | k ≥ 5 usage signals before a prompt is trusted/tunable; new prompts free for cycle 1 | ✅ floor defined |
| 3. Action / generation | AI-tune wording; surface top peer prompt; graduate best learner prompts into library | ✅ |
| 4. Measure vs stored baseline | store baseline usage at tune-time; measure next-cycle usage with SAME estimator; keep only if lift > 0 else auto-revert; **rotating control group** proves causation, not regression | ✅✅ measure + causal-validity |
| 5. Feed-forward | N+1 tuning consumes N's MEASURED usage (+ review verdict), not just edits | ✅ |

**Four holes — all closed by design:** dead channel (review verdict writes back + feeds tuner) · single lane (Loop A prompt-quality lane measures, not just the streak) · no autonomous trigger (weekly cron) · noise fed forward (k≥5 + control).

> **HARD RULE (moat-loop skill):** this is moat-complete *by design*, which is **NOT** the same as certified. A loop is a moat only when a **live 2-cycle simulation** proves N+1 changes *because* N's usage was *correctly* measured vs a baseline, AND the lift survives the confound check. That sim can only run against built code. **Do not claim "verified moat" before that sim runs.**

## 7. Data model (reuse first, per house rule)

**Reuse:**
- `ai_pulse_domain_starters` — the prompt library.
- `ai_pulse_domain_starter_events` — the "used it" usage signal (already logs engagement).
- `ai_pulse_polls` / `ai_pulse_poll_responses` — optional reflection capture.
- Agency / RCLTP scoring engine — the AI checklist grader.
- `fn_ai_pulse_my_domain_starters` — extend for: hide-empty weeks, partial-unlock, sandbox fallback, everyone-sees-both. (Tamil branch removed.)

**New (small):**
- `ai_pulse_prompt_builds` — learner's chosen parts + final prompt + AI grade + cycle.
- `ai_pulse_prompt_tunings` — per prompt per cycle: `baseline_usage`, `outcome_usage`, `lift`, `verdict` (kept | reverted | control), `is_control`, `review_verdict`, prior-version pointer (for auto-revert).
- learner unlock/streak state.
- graduation path: promote high-usage + checklist-passing learner prompts into `ai_pulse_domain_starters`.
- weekly cron (tune + measure + revert). **service_role only, anon-locked** (CLAUDE.md: cron/system SECDEF RPCs grant service_role, never authenticated; every new RPC `REVOKE EXECUTE FROM anon, PUBLIC`).

## 8. Open items to settle at build time (craft — decide during implementation)
- Exact definition of a counted "used it" event (copy vs run vs dwell) and the burst-detection threshold for fake-usage (calibrate on population first — see `feedback_integrity_metric_calibrate_on_population`).
- Same-cohort vs cross-cohort comparison for lift (population drift): prefer paired/same-prompt-across-cohorts, report overlap.
- Graduation bar specifics for learner prompts (usage percentile + checklist score).
- Streak/level surface (ranking is allowed — the "self-view never ranks" doctrine was dropped institution-wide).

## 9. Next steps
1. Optional: reconcile against `docs/architecture/config-table-pattern.md` (every switch = a config row) for the cron kill-switch + k-floor + control-% as policy rows.
2. Build PR #1 — read-fn changes (hide-empty, partial-unlock, sandbox, everyone-sees-both) + the two new tables. Anon-lock all RPCs.
3. Build PR #2 — build-from-parts UI + AI checklist grader wiring.
4. Build PR #3 — weekly tune/measure/revert cron + control-group rotation.
5. **Certify:** run the moat-loop 2-cycle simulation against the built loop (seed known delta → assert lift == delta → confirm N+1 cites N's measured usage and changes course → confound check: control vs tuned lift). Only then call it a verified moat.

---

## REVISION 2026-07-22 (post production-sweep — supersedes §7 "New tables" + §9 sequence)

The mandatory prod sweep found the **self-improving prompt loop is already built as a dark substrate** (PRs #2185/#2195/#2199), so this is **reuse-and-extend, not greenfield**. Director confirmed: **Reuse**, and **run all AI on the AI-Max lane wherever possible**.

**Already live — reuse, do NOT rebuild:**
- `ai_pulse_domain_starters` already carries: `generated_prompt`/`final_prompt`/`model`/`prompt_pack`, `prior_context` (feed-forward), `views`+`copies` (usage), `dept_outcome_lift`+`measure_status`+`outcome_measured_at` (measured outcome ledger). No `ai_pulse_prompt_tunings` table needed — that was a mistaken greenfield assumption.
- `aipulse-domain-starter-measure` cron already measures `dept_outcome_lift` vs the `ai_pulse_cycle_outcomes` **spine** and marks `'insufficient'` on small samples (≈ the k-floor). Feed-forward = gate ④ (#1921).
- AI compute runs on the **₹0 Max lane** (`enqueueJobsLane`/`collectJobsLane`, job type `ai_pulse.domain_starter`, `interactive=false`, drained by the runner box). New AI steps (grade, tune, personalize) become new `ai_pulse.*` job types on the SAME lane — **must be `interactive=false`** (interactive non-chat types fail 100%).

**Outcome-signal reconciliation (locked):** keep `dept_outcome_lift` as the **moat outcome** (one spine, never fork); "used it"/`copies` is the **leading action signal**; add the rotating silent **control** so dept-lift is finally attributable.

**Corrected delta (the only genuinely-new work):** build-from-parts authoring + capture · AI checklist grader (Max lane) · learner-prompt graduation into the library · partial-unlock/streak/"top peer prompt" reward · rotating silent control (upgrades the LIVE loop from unverified→verifiable) · auto-revert on worse outcome · read-fn tweaks · English-only cleanup.

**Note:** the LIVE loop is currently **unverified self-reinforcing** (measures a lift, no control) — the control-group PR is the highest-value fix, not just a new-feature nicety.

### PR sequence (revised) & status
- **PR #1 — SHIPPED** ✅ (PR #2281): learner week-switcher hides empty weeks. `fn_ai_pulse_switchable_cycles` applied to prod + anon-locked + proven (covered learner → 1 cycle vs 8). Awaiting human merge → then `/deploy-myjkkn`.
- **PR #2 — SHIPPED** ✅ (PR #2290): rotating silent control cohort. KEY FINDING — `dept_outcome_lift` is department-level (non-attributable per prompt), so the loop was self-improving on a confounded signal; the fix judges tuning by per-prompt **copy-rate** and adds a ~10% rotating silent control (generated without the improvement hint) = a randomized A/B. `is_control` column + `fn_ai_pulse_control_vs_tuned(cycle)` applied to prod + anon-locked. Cron withholds the hint for control topics. Awaiting human merge → `/deploy-myjkkn`. (Live copy-rate today = 0.0017 — adoption is the binding constraint.)
- **PR #3a — SHIPPED** ✅ (PR #2291): build-from-parts grader **dark substrate**. `ai_pulse_prompt_builds` (RLS-locked) + 3 SECDEF RPCs (submit=learner, record_grade=**service_role-only**, my_builds=learner) + `prompt_build_enabled` kill switch (DARK) + `ai_pulse.prompt_grade` Max-lane job type (`interactive=false`) + `aipulse-prompt-grade` cron. Applied to prod + write round-trip verified. No UI, nothing reaches a learner. Awaiting human merge.
- **PR #3b — SHIPPED** ✅ (PR #2292): build-from-parts **UI** on My AI Pulse. `prompt-builder-card.tsx` (four labeled parts → live preview → grade as 4 checks + score + tips; self-hides via `fn_ai_pulse_prompt_build_enabled`, applied to prod). Wired into `page.tsx`; grade cron registered in `vercel.json` (`*/10`). DARK — renders nothing until go-live. Awaiting human merge. **Visual eyeball deferred to go-live** (dark artifact — can't render until the switch flips post-deploy).
- **Go-live (after #2291+#2292 merge+deploy):** flip `prompt_build_enabled=true`, then browser-verify as a learner (persona harness) — the card renders, submit lands a build, the grade returns within ~10 min. Consider a staged flip (one institution) given the 0.0017 baseline.
- **PR #4:** learner-prompt graduation + partial-unlock/streak/reward.
- **PR #5:** auto-revert + run the 2-cycle sim to certify.
- **Separate:** English-only cleanup (retiring live Tamil touches what learners see now — confirm scope first).
