# Bug-Cluster Self-Improving Loop — Spec

**Status:** spec for review (2026-07-18) · **Surface:** Groups tab of `/admin/bug-reports` + reporter's own bug view
**Siblings:** `2026-07-18-FEATURE-cluster-fixability.md` (Analyze) · `2026-07-18-FEATURE-bug-reverify-tiers.md` (the re-check recipe we reuse) · `2026-07-18-FEATURE-cluster-autofix.md` (Fix — on unmerged PR #2163)
**Loop it belongs to:** the existing `bug-triage` row in `loop_registry` (`/admin/loops`), today at `gates {a:on, f:off, g:on, m:off}`, class `intake`.

---

## Problem

The cluster loop today runs: **Analyze** (`fixability`, live) → **Fix** (`autofix`, built, PR #2163) → 🚦human merge+deploy → 🚦human Resolve (the #2136 cascade that emails every reporter). It stops there. Two things are missing, and one of them is a trap:

1. **No measurement of whether the fix actually worked.** After a fix deploys, nothing checks the reported symptom is really gone before a human resolves the group and emails N learners "your issue is handled." A wrong resolve damages trust at scale.
2. **No learning.** Each fix starts from a blank slate; a root-cause pattern the loop already fixed (or already *failed* to fix) teaches the next fix nothing.
3. **The trap:** if we add "learning" by letting the AI condition on its *own* past verdicts, the loop gets confidently worse — it grades its own homework and calls its confirmation bias "improvement." That is an **echo**, not a moat.

This spec closes the loop **honestly**: it adds a *measurement* whose ground truth comes from the reporters themselves, and a *feed-forward* that retrieves only **measured** outcomes into the next fix.

---

## The full loop, with moat-vs-echo checkpoints marked

```
  Analyze ─▶ Fix ─▶ 🚦HUMAN merge+deploy
  (live)    (PR#2163)        │
                             ▼
                    ┌──────────────────────────────────────────────┐
                    │ #1 VERIFY GROUP   (reuse live bug.reverify)   │
                    │   fan-out the reporter-POV read-check across  │
                    │   the fixed cluster's members → tally         │
                    │   likely_fixed / still_broken / inconclusive  │
                    │                                               │
                    │  ⚠️ MOAT CHECKPOINT: this is the AI checking  │
                    │     its OWN fix → a WEAK signal. It earns NO   │
                    │     gate. Recommendation-only. If we ever      │
                    │     called this "the measurement", the loop    │
                    │     would be an ECHO. It is a fast filter, not │
                    │     ground truth.                              │
                    └──────────────────────────────────────────────┘
                             │
                             ▼
                    ┌──────────────────────────────────────────────┐
                    │ #2 REPORTER FEEDBACK   ★ THE KEYSTONE ★        │
                    │   after a human approves the send, each        │
                    │   reporter sees an in-app 👍/👎 "is this fixed  │
                    │   for you?" → answers collected + stored       │
                    │                                               │
                    │  ✅ MOAT CHECKPOINT: THIS is the measurement.  │
                    │     Ground truth = the person who reported it. │
                    │     Earns loop gate  m: off → on.              │
                    │  🚦 HUMAN GATE #3: sending is outbound         │
                    │     messaging to real learners → a human       │
                    │     approves the send.                         │
                    └──────────────────────────────────────────────┘
                             │
                             ▼
                    🚦HUMAN Resolve group  (#2136 cascade + emails N)
                             │
                             ▼
                    ┌──────────────────────────────────────────────┐
                    │ #3 LEARN   (outcome ledger + retrieval)       │
                    │   record {root_cause_category, files_touched,  │
                    │   fix_pattern, verify_verdict,                 │
                    │   reporter_confirmed y/n} per fix →            │
                    │   RETRIEVE matching MEASURED outcomes as       │
                    │   context into the NEXT Analyze/Fix            │
                    │                                               │
                    │  ✅ MOAT CHECKPOINT: retrieval keys on         │
                    │     reporter_confirmed (the MEASURED field),   │
                    │     NOT on the AI's own verify verdict. Earns  │
                    │     loop gate  f: off → on.                    │
                    │  🔬 ACCEPTANCE: moat-loop 2-cycle test must    │
                    │     show cycle-2's fix CHANGES BECAUSE cycle-1 │
                    │     was reporter-measured. Else it's theater.  │
                    └──────────────────────────────────────────────┘
                             │
                             └────────▶ back into Analyze/Fix (smarter)
```

**The one sentence that defines success:** the next fix is demonstrably different **because a prior fix's reporter-confirmed outcome was measured against a baseline.** If the next fix would be identical with or without the outcome ledger, we built an echo and the `f` gate must stay off.

---

## Where this registers (answers "does it auto-add to the Loop Control Tower?")

**No auto-add.** There is no trigger; every registry row is a hand-written migration. This loop touches the three registries as follows:

| Registry | Table / page | What we do here |
|---|---|---|
| **Loop Control Tower** | `loop_registry` · `/admin/loops` | **`UPDATE` the existing `bug-triage` row's `gates`** as each increment earns it — `m: off→on` when #2 ships + collects; `f: off→on` when #3 ships + passes the 2-cycle test; then graduate `loop_class` `intake → self_improving`. Refresh the `description` to name the live measure + feed-forward. |
| **AI Routines** | `ai_routine_schedules` · `/admin/ai-routines` | Optionally add a routine that fires the **post-deploy verify sweep** (#1) and the **feedback-request preparation** (#2) once a fixed cluster's PR has deployed. v1 can trigger these from the Groups tab button instead of a routine; a routine is the automation follow-up. |
| **AI Models (recipes)** | `ai_job_types` · `/admin/ai-models` | **Reuse `bug.reverify`** for #1 (no new recipe). #3's retrieval is deterministic SQL + prompt-context injection into the *existing* `bug.fixability` / `bug.cluster_fix` runners — **no new recipe.** |

So the honest gate ledger for this loop:

| Increment | Earns | Why |
|---|---|---|
| #1 Verify group | *nothing* | AI checking its own fix = weak signal, not a measure |
| #2 Reporter feedback | `m: off → on` | reporter = ground truth |
| #3 Learn (retrieve measured outcomes) | `f: off → on` | measurement feeds the next action |
| #2 **and** #3 live + 2-cycle-proven | `loop_class: intake → self_improving` | matches the honesty bar the other `self_improving` loops (`scf`, `mess`, `induction-*`) already meet |

---

## Increment #1 — Verify group (fan-out `bug.reverify`)

**Goal:** after a fix deploys, tell a human *before* they resolve the group how many members' symptoms actually look fixed — a fast filter, never a decision.

- **Reuse the live recipe.** `bug.reverify` (Tier 2, merged + live: `interactive=false`, `tool_set=none`, lane=max) already re-checks one bug's symptom **as the reporter** (60s-JWT impersonation, read-only) and judges `likely_fixed | still_broken | inconclusive`. #1 fans that recipe across a fixed cluster's members.
- **New action** on the Groups tab: `POST /api/bug-reports/clusters/[id]/verify` → for each member bug, enqueue the `bug.reverify` evidence+judge path (dedupe key `bug-reverify:<bug_id>`), then **tally** the verdicts into `bug_clusters.metadata.verify` = `{ likely_fixed: n, still_broken: n, inconclusive: n, per_bug: {…}, ran_at, deploy_sha }`.
- **UI:** a verify card on the group showing the tally + a per-member breakdown. **Recommendation-only footer** identical to fixability: it never resolves, never emails.
- **Write-symptom safety clamp carries over:** a "can't submit / can't mark" (write) symptom can never be read-verified fixed → stays `inconclusive` (`reproducible:"write"`), same clamp `bug.reverify` already enforces.
- **Cost:** ₹0 (batch drain, Max subscription); one `ai_model_usage` row per member (`feature_key='bug.reverify'`, `cost_inr=0`).
- **Route gate note:** the `ai-reverify` route is gated `role IN (super_admin|administrator|ceo)` and `is_super_admin` does **not** bypass it there. If the new verify route reuses that gate, widen it the same way #2157 widened the module admin gates.

**Moat honesty:** #1's tally is displayed as *"AI re-check (not reporter-confirmed)"* everywhere, so no one mistakes it for the measurement. It earns no gate.

---

## Increment #2 — Reporter feedback ★ keystone / ground truth ★

**Goal:** the person who reported the bug tells us, in-app, whether it's actually fixed for them. This is the measurement that makes the loop real.

### Delivery contract (the part that's easy to get wrong)
- **A human approves the send.** Sending 👍/👎 prompts is **outbound messaging to real learners** → **human gate #3.** Rows are prepared in `status='pending_send'`; a human on the Groups tab clicks *"Send 'is this fixed?' to N reporters"* → flips them to `sent`. No AI verdict ever triggers a send.
- **Prepared on deploy, sent before resolve** *(locked)*: rows are prepared as soon as the fix deploys; the human may approve the send any time from then on — so reporter answers can **inform** the resolve decision instead of arriving after the "it's fixed" emails already went out. The #1 verify tally is **surfaced next to the send button but never blocks it** *(locked)* — it is the AI's weak self-check; the human decides.
- **At-least-once, render-then-client-ack.** The reporter's in-app surface renders the prompt; the client **acks receipt** (`delivered_at`) on render. Do **not** stamp-on-read as "answered" — that loses answers (the render-then-ack lesson). The answer (👍/👎) is a separate explicit write.
- **One prompt per (reporter, fixed-cluster).** Idempotent on `(cluster_id, reporter_user_id)`.
- **Skip the odd-ones-out** *(locked)*: only members inside the fixability verdict's **shared-cause** set are eligible. Members the analysis marked as a different-cause subgroup/outlier are **excluded** — they'd get a confusing question about a fix that never touched their issue, and their 👎 would poison the measurement.
- **Anti-nag cap** *(locked)*: a learner never has more than **3 open prompts** at once; further prompts queue until one is answered or expires.
- **Late 👎 after resolve** *(locked)*: an answer of "still broken" that lands **after** the group was resolved raises a visible **"a reporter says still broken"** red flag on the group for human review. **No auto-reopen** — humans own status changes, always.
- **Silence = no data** *(locked)*: an expired, unanswered prompt contributes **nothing**. Silence is never counted as agreement — a group nobody answered yields `reporter_confirmed='none'` and the loop learns no lesson from it.

### DB (new table `bug_fix_feedback_requests`)
```
id              uuid pk
cluster_id      uuid   → bug_clusters
bug_id          text   (the reporter's own report id, for the deep-link)
reporter_user_id uuid  → profiles
fix_pr          text   (the PR that fixed it, for the outcome ledger)
deploy_sha      text
status          text   check in (pending_send, sent, delivered, answered, expired)
answer          text   check in (fixed, not_fixed) null until answered
sent_at         timestamptz   (human-approved send)
delivered_at    timestamptz   (client ack on render — at-least-once)
answered_at     timestamptz
expires_at      timestamptz   (default now()+14d; expired ≠ answered)
created_at      timestamptz default now()
```
RLS: a reporter reads/answers **only their own** rows (`reporter_user_id = auth.uid()`); admins read all. Every new SECDEF RPC (`fn_bug_feedback_prepare`, `_approve_send`, `_ack_delivery`, `_answer`) ships with explicit `REVOKE EXECUTE FROM anon, PUBLIC`.

### UI
- **Reporter side** *(locked: both surfaces)*: a one-tap 👍 *Fixed* / 👎 *Still broken* card on the reporter's own bug view **plus** a small in-app nudge ("1 of your reports may be fixed — tell us?") that deep-links to it. Renders → client acks → answer writes. Plain-language, JKKN terminology.
- **Admin side (Groups tab):** *"Send feedback requests (N reporters)"* button on a fixed cluster (human gate #3) with the #1 verify tally displayed beside it (surface, never block), then a live counter *"sent N · answered M · 👍a 👎b"* and the late-👎 red flag when applicable.

**Moat honesty:** `answer` is the ground-truth field the whole loop hangs on. It is written **only by the reporter**, never by any AI. This is what earns `m: off→on`.

---

## Increment #3 — Learn (outcome ledger + retrieval)

**Goal:** the next Analyze/Fix conditions on **measured** past outcomes, so the loop gets better — provably, not vibratively.

### DB (new table `bug_fix_outcomes`)
```
id                 uuid pk
cluster_id         uuid
canonical_bug_id   text
root_cause_category text   (from the fixability verdict; the retrieval key)
files_touched      text[]  (from the fix PR diff)
fix_pattern        jsonb   (short structured description of the change)
fix_pr             text
verify_verdict     jsonb   (#1 tally — the WEAK signal, stored but not the retrieval key)
reporter_confirmed text    check in (positive, negative, none)   ← THE MEASURED FIELD
reporter_pos       int default 0
reporter_neg       int default 0
deployed_at        timestamptz
resolved_at        timestamptz
created_at         timestamptz default now()
```
`reporter_confirmed` derivation *(locked — "any 👎 = not clean")*: `positive` only if ≥1 answer and **zero** 👎; `negative` if **any** 👎; `none` if no answers arrived before expiry (silence teaches nothing). Strictest rule wins because a false "fixed" is the expensive error — it misleads learners **and** teaches the loop a wrong lesson. One row per fixed cluster.

### Retrieval (the feed-forward)
When the `bug.fixability` / `bug.cluster_fix` runner analyzes a **new** cluster, it first queries `bug_fix_outcomes` for prior rows whose `root_cause_category` (and/or `files_touched` overlap) match, and injects the **reporter-measured** ones as prompt context:
- a prior fix with this signature that reporters **confirmed** → *"this pattern worked; prefer it"*;
- a prior fix that reporters **rejected** → *"this file/pattern did NOT actually fix it for reporters; avoid it, or escalate to `needs_migration`, or lower confidence."*

Retrieval keys on `reporter_confirmed` (measured), **never** on `verify_verdict` (the AI's own #1 signal). That distinction is the entire difference between a moat and an echo.

### Acceptance — the moat-loop 2-cycle test (run before flipping `f` on)
1. **Cycle 1:** fix cluster A with root-cause signature S → reporters answer 👎 (`reporter_confirmed='negative'`) → outcome row recorded.
2. **Cycle 2:** a new cluster B with the **same signature S** → the runner retrieves cycle-1's negative outcome → its fix **demonstrably changes** (avoids the failed file/pattern, escalates to `needs_migration`, or lowers `single_fix_feasible`).
3. **Falsification:** run cycle 2 **with the cycle-1 row hidden** — if the fix is identical either way, retrieval isn't doing anything → **echo → `f` stays off.** The test passes only if the presence of the measured row changes the next action.

Consider running this via the `/moat-loop` skill's live 2-cycle simulation.

---

## Human gates (all three stay human, permanently)

1. **Merge** the AI's fix PR to live `jkkn.ai` (never auto-merge — permanent MyJKKN rule).
2. **Resolve** a group (the #2136 cascade that **emails N learners**).
3. **Send** the reporter 👍/👎 feedback prompts (outbound messaging to real learners).

No AI verdict from #1, and no measured outcome from #2/#3, may auto-perform any of these.

---

## Build order & shipping

1. **#1 Verify group** — new route + tally + card, reuse `bug.reverify`. App-side worktree PR off `jicate/main`. Prove ₹0 on a real fixed cluster.
2. **#2 Reporter feedback** — migration (`bug_fix_feedback_requests` + 4 anon-locked RPCs) + reporter card + admin send-gate + at-least-once delivery. On merge+collect, migration to flip `bug-triage` `m: off→on`.
3. **#3 Learn** — migration (`bug_fix_outcomes`) + outcome writer (on resolve) + retrieval injection into the runners + the 2-cycle test. On passing the test, migration to flip `f: off→on` and graduate `loop_class → self_improving`.

Runners + launchd stay Mac-local. Every new SECDEF RPC gets explicit `REVOKE EXECUTE FROM anon, PUBLIC`. The runner self-gates (Step 2.7) because CI skips TypeCheck/terminology/reachability on draft PRs. Spec docs trip the terminology gate — prose uses learner / Senior Learners / team members; code paths stay in backticks.

---

## Decisions locked (Director interview, 2026-07-18)

| # | Decision | Locked answer |
|---|---|---|
| D1 | Reporter surface | **Both** — 👍/👎 card on their bug view **+** small in-app nudge deep-linking to it |
| D2 | When feedback is prepared/sent | **Prepare on deploy; human may approve send before resolve** — answers inform the resolve decision |
| D3 | Does #1's AI tally gate the send button? | **Surface, never block** — the AI self-check is a weak signal; the human decides |
| D4 | #3 retrieval scope | **`root_cause_category` first**; `files_touched` overlap in v1.1 once outcome volume exists *(technical call, Claude)* |
| D5 | What counts as reporter-confirmed | **Any 👎 = not clean** — `positive` needs ≥1 answer and zero 👎 |
| E1 | 👎 arriving after the group was resolved | **Red flag on the group for human review** — no auto-reopen, humans own status changes |
| E2 | Reporters who never answer (14-day expiry) | **Silence = no data** — never counted as agreement; the loop learns nothing from it |
| E3 | Odd-one-out members (different root cause per the analysis) | **Skipped** — only shared-cause members get the prompt, so mistagged 👎s can't poison the measurement |
| E4 | Prompt volume per learner | **Max 3 open prompts** at a time; further prompts queue |

---

## Non-goals / deferred

- No auto-merge, no auto-resolve, no auto-send — ever.
- No Tier-3 agentic UI re-drive for #1 (write-symptom verification stays `inconclusive`; that's `bug.reverify`'s deferred Tier 3).
- Multi-subgroup fixing (dominant-subgroup of a mixed cluster) stays deferred per the autofix spec.
- Cross-loop learning (feeding bug outcomes into *other* loops via `loop_edges`) is out of scope for v1.
